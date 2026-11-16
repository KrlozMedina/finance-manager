
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import mongoose from "mongoose";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { connectDB } from "@/lib/mongodb/connection";

import { InvitationModel } from "@/modules/workspaces/invitation.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";

type AcceptanceResult =
  | {
      status: "accepted";
      workspaceId: string;
      role: string;
    }
  | {
      status: "expired";
    }
  | {
      status: "email_mismatch";
    }
  | {
      status: "already_member";
    }
  | {
      status: "invalid_owner_membership";
    }
  | {
      status: "not_found";
    };

export async function POST(request: Request) {
  try {
    // 1. Comprobar usuario autenticado.
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes iniciar sesión para aceptar una invitación.",
        },
        { status: 401 }
      );
    }

    // 2. Validar token recibido.
    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body.token !== "string" ||
      !/^[a-f0-9]{64}$/i.test(body.token)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El token de invitación no es válido.",
        },
        { status: 400 }
      );
    }

    await connectDB();

    // 3. Calcular hash del token.
    const tokenHash = createHash("sha256")
      .update(body.token)
      .digest("hex");

    const session = await mongoose.startSession();

    let result: AcceptanceResult = {
      status: "not_found",
    };

    try {
      await session.withTransaction(async () => {
        const invitation = await InvitationModel.findOne({
          tokenHash,
          status: "pending",
        })
          .select("+tokenHash")
          .session(session);

        if (!invitation) {
          result = { status: "not_found" };
          return;
        }

        // 4. Verificar expiración.
        if (invitation.expiresAt.getTime() <= Date.now()) {
          invitation.status = "expired";
          await invitation.save({ session });

          result = { status: "expired" };
          return;
        }

        // 5. Verificar correo del usuario.
        const userEmail = user.email.toLowerCase().trim();

        if (invitation.email !== userEmail) {
          result = { status: "email_mismatch" };
          return;
        }

        // 6. Comprobar membresía existente.
        let membership = await MembershipModel.findOne({
          workspaceId: invitation.workspaceId,
          userId: user._id,
        }).session(session);

        if (membership?.status === "active") {
          result = { status: "already_member" };
          return;
        }

        // No modificar una membresía OWNER mediante invitaciones.
        if (membership?.role === "OWNER") {
          result = { status: "invalid_owner_membership" };
          return;
        }

        const acceptedAt = new Date();

        if (membership) {
          // Reactivar una membresía suspendida o pendiente.
          membership.role = invitation.role;
          membership.status = "active";
          membership.joinedAt = acceptedAt;

          await membership.save({ session });
        } else {
          // Crear nueva membresía.
          await MembershipModel.create(
            [
              {
                workspaceId: invitation.workspaceId,
                userId: user._id,
                role: invitation.role,
                status: "active",
                joinedAt: acceptedAt,
              },
            ],
            { session }
          );
        }

        // 7. Marcar invitación como aceptada.
        invitation.status = "accepted";
        invitation.acceptedAt = acceptedAt;

        await invitation.save({ session });

        result = {
          status: "accepted",
          workspaceId: invitation.workspaceId.toString(),
          role: invitation.role,
        };
      });
    } finally {
      await session.endSession();
    }

    // 8. Responder según el resultado.
    const finalResult = result as AcceptanceResult;

    switch (finalResult.status) {
      case "accepted":
        return NextResponse.json({
          success: true,
          message: "Invitación aceptada correctamente.",
          data: {
            workspaceId: finalResult.workspaceId,
            role: finalResult.role,
          },
        });

      case "expired":
        return NextResponse.json(
          {
            success: false,
            message: "La invitación ha expirado.",
          },
          { status: 410 }
        );

      case "email_mismatch":
        return NextResponse.json(
          {
            success: false,
            message: "Tu correo electrónico no coincide con la invitación.",
          },
          { status: 403 }
        );

      case "already_member":
        return NextResponse.json(
          {
            success: false,
            message: "Ya perteneces a este workspace.",
          },
          { status: 409 }
        );

      case "invalid_owner_membership":
        return NextResponse.json(
          {
            success: false,
            message: "No se puede modificar una membresía de propietario mediante una invitación.",
          },
          { status: 409 }
        );

      default:
        return NextResponse.json(
          {
            success: false,
            message: "La invitación no existe o ya fue utilizada.",
          },
          { status: 404 }
        );
    }
  } catch (error) {
    console.error("[POST /api/v1/invitations/accept]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al aceptar la invitación.",
      },
      { status: 500 }
    );
  }
}
