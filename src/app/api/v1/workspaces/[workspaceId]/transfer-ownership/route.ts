
import mongoose, { Types } from "mongoose";
import { NextResponse } from "next/server";

import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { MembershipModel } from "@/modules/workspaces/membership.model";

interface RouteContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  const session = await mongoose.startSession();

  try {
    const { workspaceId } = await params;

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "workspace:transfer",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permisos para transferir la propiedad.",
        },
        {
          status:
            access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

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

    const { targetUserId, confirmation } = body as {
      targetUserId?: unknown;
      confirmation?: unknown;
    };

    if (
      typeof targetUserId !== "string" ||
      !Types.ObjectId.isValid(targetUserId)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El usuario destino no es válido.",
        },
        { status: 400 }
      );
    }

    if (confirmation !== "TRANSFER_OWNERSHIP") {
      return NextResponse.json(
        {
          success: false,
          message: "Debes confirmar explícitamente la transferencia.",
        },
        { status: 400 }
      );
    }

    const currentUserId = access.user._id.toString();

    if (targetUserId === currentUserId) {
      return NextResponse.json(
        {
          success: false,
          message: "Ya eres el propietario de este workspace.",
        },
        { status: 400 }
      );
    }

    let transferred = false;

    await session.withTransaction(async () => {
      const currentOwner = await MembershipModel.findOne({
        workspaceId,
        userId: currentUserId,
        role: "OWNER",
        status: "active",
      }).session(session);

      if (!currentOwner) {
        throw new Error("CURRENT_OWNER_NOT_FOUND");
      }

      const targetMembership = await MembershipModel.findOne({
        workspaceId,
        userId: targetUserId,
        status: "active",
      }).session(session);

      if (!targetMembership) {
        throw new Error("TARGET_MEMBER_NOT_FOUND");
      }

      // Primero liberar el índice único de OWNER.
      currentOwner.role = "ADMIN";
      await currentOwner.save({ session });

      // Después asignar la propiedad al nuevo miembro.
      targetMembership.role = "OWNER";
      await targetMembership.save({ session });

      transferred = true;
    });

    if (!transferred) {
      return NextResponse.json(
        {
          success: false,
          message: "No se pudo transferir la propiedad.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Propiedad transferida correctamente.",
      data: {
        previousOwner: {
          userId: currentUserId,
          role: "ADMIN",
        },
        newOwner: {
          userId: targetUserId,
          role: "OWNER",
        },
      },
    });
  } catch (error) {
    console.error("[WORKSPACE OWNERSHIP TRANSFER]", error);

    if (error instanceof Error) {
      if (error.message === "CURRENT_OWNER_NOT_FOUND") {
        return NextResponse.json(
          {
            success: false,
            message: "No se encontró al propietario actual.",
          },
          { status: 409 }
        );
      }

      if (error.message === "TARGET_MEMBER_NOT_FOUND") {
        return NextResponse.json(
          {
            success: false,
            message: "El usuario destino no es miembro activo del workspace.",
          },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: "Error al transferir la propiedad.",
      },
      { status: 500 }
    );
  } finally {
    await session.endSession();
  }
}
