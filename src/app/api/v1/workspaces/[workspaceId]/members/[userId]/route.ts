
import mongoose, { Types } from "mongoose";
import { NextResponse } from "next/server";

import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { MembershipModel } from "@/modules/workspaces/membership.model";

interface RouteContext {
  params: Promise<{
    workspaceId: string;
    userId: string;
  }>;
}

type AssignableRole = "ADMIN" | "EDITOR" | "VIEWER";
type UpdateResult =
  | { success: true; role: AssignableRole }
  | { success: false; status: number; message: string };

const ASSIGNABLE_ROLES: AssignableRole[] = [
  "ADMIN",
  "EDITOR",
  "VIEWER",
];

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  const session = await mongoose.startSession();

  try {
    const { workspaceId, userId } = await params;

    if (!Types.ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: "ID de usuario inválido." },
        { status: 400 }
      );
    }

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "members:update",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message:
            access.reason === "UNAUTHORIZED"
              ? "No autorizado."
              : "No tienes permisos para modificar miembros.",
        },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const body = await request.json().catch(() => null);
    const newRole = body?.role as AssignableRole | undefined;

    if (!newRole || !ASSIGNABLE_ROLES.includes(newRole)) {
      return NextResponse.json(
        {
          success: false,
          message: "El rol indicado no es válido.",
        },
        { status: 400 }
      );
    }

    const actorId = access.user._id.toString();

    const result = await session.withTransaction<UpdateResult>(async () => {
      const actorMembership = await MembershipModel.findOne({
        workspaceId,
        userId: actorId,
        status: "active",
      }).session(session);

      if (!actorMembership) {
        return {
          success: false,
          status: 403,
          message: "No tienes una membresía activa.",
        };
      }

      const actorRole = actorMembership.role;

      if (actorRole !== "OWNER" && actorRole !== "ADMIN") {
        return {
          success: false,
          status: 403,
          message: "No tienes permisos para modificar miembros.",
        };
      }

      const targetMembership = await MembershipModel.findOne({
        workspaceId,
        userId,
      }).session(session);

      if (!targetMembership) {
        return {
          success: false,
          status: 404,
          message: "No se encontró el miembro.",
        };
      }

      if (targetMembership.role === "OWNER") {
        return {
          success: false,
          status: 403,
          message: "No puedes modificar el rol del propietario.",
        };
      }

      if (
        actorRole === "ADMIN" &&
        (targetMembership.role === "ADMIN" || newRole === "ADMIN")
      ) {
        return {
          success: false,
          status: 403,
          message: "Un administrador solo puede gestionar roles EDITOR y VIEWER.",
        };
      }

      targetMembership.role = newRole;
      await targetMembership.save({ session });

      return {
        success: true,
        role: targetMembership.role as AssignableRole,
      };
    });

    if (!result) {
      return NextResponse.json(
        { success: false, message: "No se pudo actualizar el miembro." },
        { status: 500 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Rol actualizado correctamente.",
      data: {
        userId,
        role: result.role,
      },
    });
  } catch (error) {
    console.error("[WORKSPACE MEMBERS PATCH]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error interno al actualizar el rol.",
      },
      { status: 500 }
    );
  } finally {
    await session.endSession();
  }
}


export async function DELETE(
  _request: Request,
  { params }: RouteContext
) {
  const session = await mongoose.startSession();

  try {
    const { workspaceId, userId } = await params;

    if (!Types.ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: "ID de usuario inválido." },
        { status: 400 }
      );
    }

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "members:remove",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message:
            access.reason === "UNAUTHORIZED"
              ? "No autorizado."
              : "No tienes permisos para retirar miembros.",
        },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const actorId = access.user._id.toString();

    if (actorId === userId) {
      return NextResponse.json(
        {
          success: false,
          message: "No puedes retirarte a ti mismo desde este endpoint.",
        },
        { status: 400 }
      );
    }

    const result = await session.withTransaction<
      | { success: true }
      | { success: false; status: number; message: string }
    >(async () => {
      const actorMembership = await MembershipModel.findOne({
        workspaceId,
        userId: actorId,
        status: "active",
      }).session(session);

      if (
        !actorMembership ||
        !["OWNER", "ADMIN"].includes(actorMembership.role)
      ) {
        return {
          success: false,
          status: 403,
          message: "No tienes permisos para retirar miembros.",
        };
      }

      const targetMembership = await MembershipModel.findOne({
        workspaceId,
        userId,
      }).session(session);

      if (!targetMembership) {
        return {
          success: false,
          status: 404,
          message: "No se encontró el miembro.",
        };
      }

      if (targetMembership.role === "OWNER") {
        return {
          success: false,
          status: 403,
          message: "No puedes retirar al propietario del workspace.",
        };
      }

      if (
        actorMembership.role === "ADMIN" &&
        targetMembership.role === "ADMIN"
      ) {
        return {
          success: false,
          status: 403,
          message: "Un administrador no puede retirar a otro administrador.",
        };
      }

      if (targetMembership.status === "suspended") {
        return {
          success: false,
          status: 409,
          message: "El miembro ya se encuentra suspendido.",
        };
      }

      targetMembership.status = "suspended";
      await targetMembership.save({ session });

      return { success: true };
    });

    if (!result) {
      return NextResponse.json(
        { success: false, message: "No se pudo retirar al miembro." },
        { status: 500 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Miembro retirado correctamente.",
      data: { userId, status: "suspended" },
    });
  } catch (error) {
    console.error("[WORKSPACE MEMBERS DELETE]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error interno al retirar al miembro.",
      },
      { status: 500 }
    );
  } finally {
    await session.endSession();
  }
}
