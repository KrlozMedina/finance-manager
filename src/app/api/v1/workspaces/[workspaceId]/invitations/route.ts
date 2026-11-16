
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { connectDB } from "@/lib/mongodb/connection";

import { InvitationModel } from "@/modules/workspaces/invitation.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";
import { UserModel } from "@/modules/users/user.model";

interface RouteContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

const INVITATION_EXPIRATION_DAYS = 7;

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  try {
    const { workspaceId } = await params;

    // 1. Verificar autenticación, membresía y permiso.
    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "members:invite",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para invitar miembros.",
        },
        {
          status:
            access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    // 2. Validar cuerpo.
    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El cuerpo de la petición no es válido.",
        },
        { status: 400 }
      );
    }

    const { email, role } = body as {
      email?: unknown;
      role?: unknown;
    };

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes proporcionar un correo válido.",
        },
        { status: 400 }
      );
    }

    if (
      !["ADMIN", "EDITOR", "VIEWER"].includes(
        role as string
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El rol seleccionado no es válido.",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    await connectDB();

    // 3. Evitar invitar a un miembro activo.
    const existingUser = await UserModel.findOne({
      email: normalizedEmail,
    }).select("_id");

    if (existingUser) {
      const existingMembership = await MembershipModel.findOne({
        workspaceId,
        userId: existingUser._id,
        status: "active",
      });

      if (existingMembership) {
        return NextResponse.json(
          {
            success: false,
            message: "Este usuario ya pertenece al workspace.",
          },
          { status: 409 }
        );
      }
    }

    // 4. Invalidar invitaciones pendientes que ya expiraron.
    await InvitationModel.updateMany(
      {
        workspaceId,
        email: normalizedEmail,
        status: "pending",
        expiresAt: { $lte: new Date() },
      },
      {
        $set: { status: "expired" },
      }
    );

    // 5. Comprobar invitación pendiente.
    const existingInvitation = await InvitationModel.findOne({
      workspaceId,
      email: normalizedEmail,
      status: "pending",
    });

    if (existingInvitation) {
      return NextResponse.json(
        {
          success: false,
          message: "Ya existe una invitación pendiente para este correo.",
        },
        { status: 409 }
      );
    }

    // 6. Generar token seguro y guardar únicamente su hash.
    const token = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() +
        INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
    );

    const invitation = await InvitationModel.create({
      workspaceId,
      email: normalizedEmail,
      role,
      tokenHash,
      status: "pending",
      invitedBy: access.user._id,
      expiresAt,
    });

    // 7. Construir URL de aceptación.
    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      new URL(request.url).origin;

    const invitationUrl = new URL(
      `/invitations/accept?token=${token}`,
      baseUrl
    ).toString();

    return NextResponse.json(
      {
        success: true,
        message: "Invitación creada correctamente.",
        data: {
          id: invitation._id.toString(),
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          invitationUrl,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "[POST /api/v1/workspaces/:workspaceId/invitations]",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Error al crear la invitación.",
      },
      { status: 500 }
    );
  }
}
