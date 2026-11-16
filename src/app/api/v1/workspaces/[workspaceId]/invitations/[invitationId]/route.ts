
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { InvitationModel } from "@/modules/workspaces/invitation.model";

interface RouteContext {
  params: Promise<{
    workspaceId: string;
    invitationId: string;
  }>;
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const { workspaceId, invitationId } = await params;

    if (!Types.ObjectId.isValid(invitationId)) {
      return NextResponse.json(
        {
          success: false,
          message: "ID de invitación inválido.",
        },
        { status: 400 }
      );
    }

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "members:invite",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para revocar invitaciones.",
        },
        {
          status:
            access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const now = new Date();

    // Revocación atómica: solo permite cancelar invitaciones
    // pendientes que todavía no hayan expirado.
    const invitation = await InvitationModel.findOneAndUpdate(
      {
        _id: invitationId,
        workspaceId,
        status: "pending",
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: "revoked",
          revokedAt: now,
        },
      },
      {
        new: true,
      }
    ).select("_id email role status revokedAt");

    if (!invitation) {
      const existingInvitation = await InvitationModel.findOne({
        _id: invitationId,
        workspaceId,
      }).select("_id status expiresAt");

      if (!existingInvitation) {
        return NextResponse.json(
          {
            success: false,
            message: "No se encontró la invitación.",
          },
          { status: 404 }
        );
      }

      if (
        existingInvitation.status === "pending" &&
        existingInvitation.expiresAt <= now
      ) {
        await InvitationModel.updateOne(
          {
            _id: invitationId,
            workspaceId,
            status: "pending",
          },
          {
            $set: { status: "expired" },
          }
        );

        return NextResponse.json(
          {
            success: false,
            message: "La invitación ya expiró.",
          },
          { status: 410 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: "La invitación ya no está pendiente.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Invitación revocada correctamente.",
      data: {
        id: invitation._id.toString(),
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        revokedAt: invitation.revokedAt,
      },
    });
  } catch (error) {
    console.error("[DELETE WORKSPACE INVITATION]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al revocar la invitación.",
      },
      { status: 500 }
    );
  }
}
