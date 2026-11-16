
import { NextResponse } from "next/server";

import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { connectDB } from "@/lib/mongodb/connection";
import { WorkspaceModel } from "@/modules/workspaces/workspace.model";

import mongoose from "mongoose";
import { cookies } from "next/headers";

import { InvitationModel } from "@/modules/workspaces/invitation.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";

interface RouteContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  const { workspaceId } = await params;

  const access = await requireWorkspacePermission({
    workspaceId,
    permission: "workspace:read",
  });

  if (!access.authorized) {
    return NextResponse.json(
      {
        success: false,
        message:
          access.reason === "UNAUTHORIZED"
            ? "No tienes acceso a este workspace."
            : "No tienes permisos para consultar este workspace.",
      },
      {
        status:
          access.reason === "UNAUTHORIZED" ? 401 : 403,
      }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: access.workspace._id.toString(),
      name: access.workspace.name,
      type: access.workspace.type,
      defaultCurrency: access.workspace.defaultCurrency,
      settings: access.workspace.settings,
      role: access.membership.role,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  try {
    const { workspaceId } = await params;

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "workspace:update",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message:
            access.reason === "UNAUTHORIZED"
              ? "No tienes acceso a este workspace."
              : "No tienes permisos para modificar este workspace.",
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

    const data = body as Record<string, unknown>;
    const allowedFields = [
      "name",
      "defaultCurrency",
      "settings",
    ];

    const unknownFields = Object.keys(data).filter(
      (field) => !allowedFields.includes(field)
    );

    if (unknownFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Campos no permitidos: ${unknownFields.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes proporcionar al menos un campo para actualizar.",
        },
        { status: 400 }
      );
    }

    // Validar nombre.
    let name: string | undefined;

    if (data.name !== undefined) {
      if (
        typeof data.name !== "string" ||
        data.name.trim().length < 2 ||
        data.name.trim().length > 100
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "El nombre debe tener entre 2 y 100 caracteres.",
          },
          { status: 400 }
        );
      }

      name = data.name.trim();
    }

    // Validar moneda.
    let defaultCurrency: string | undefined;

    if (data.defaultCurrency !== undefined) {
      if (
        typeof data.defaultCurrency !== "string" ||
        !/^[A-Za-z]{3}$/.test(data.defaultCurrency)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "La moneda debe tener un código de tres letras.",
          },
          { status: 400 }
        );
      }

      defaultCurrency = data.defaultCurrency.toUpperCase();
    }

    // Validar configuración.
    let timezone: string | undefined;
    let allowMemberInvites: boolean | undefined;

    if (data.settings !== undefined) {
      if (
        typeof data.settings !== "object" ||
        data.settings === null ||
        Array.isArray(data.settings)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "La configuración no es válida.",
          },
          { status: 400 }
        );
      }

      const settings = data.settings as Record<string, unknown>;

      const allowedSettings = [
        "timezone",
        "allowMemberInvites",
      ];

      const unknownSettings = Object.keys(settings).filter(
        (field) => !allowedSettings.includes(field)
      );

      if (unknownSettings.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: `Configuraciones no permitidas: ${unknownSettings.join(", ")}`,
          },
          { status: 400 }
        );
      }

      if (Object.keys(settings).length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Debes proporcionar una configuración para actualizar.",
          },
          { status: 400 }
        );
      }

      if (settings.timezone !== undefined) {
        if (
          typeof settings.timezone !== "string" ||
          settings.timezone.trim().length === 0
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "La zona horaria no es válida.",
            },
            { status: 400 }
          );
        }

        try {
          new Intl.DateTimeFormat("en-US", {
            timeZone: settings.timezone,
          }).format();
        } catch {
          return NextResponse.json(
            {
              success: false,
              message: "La zona horaria indicada no existe.",
            },
            { status: 400 }
          );
        }

        timezone = settings.timezone;
      }

      if (settings.allowMemberInvites !== undefined) {
        if (typeof settings.allowMemberInvites !== "boolean") {
          return NextResponse.json(
            {
              success: false,
              message: "allowMemberInvites debe ser booleano.",
            },
            { status: 400 }
          );
        }

        allowMemberInvites = settings.allowMemberInvites;
      }
    }

    await connectDB();

    const workspace = await WorkspaceModel.findById(workspaceId);

    if (!workspace) {
      return NextResponse.json(
        {
          success: false,
          message: "No se encontró el workspace.",
        },
        { status: 404 }
      );
    }

    if (name !== undefined) {
      workspace.name = name;
    }

    if (defaultCurrency !== undefined) {
      workspace.defaultCurrency = defaultCurrency;
    }

    if (timezone !== undefined) {
      workspace.set("settings.timezone", timezone);
    }

    if (allowMemberInvites !== undefined) {
      workspace.set(
        "settings.allowMemberInvites",
        allowMemberInvites
      );
    }

    await workspace.save();

    return NextResponse.json({
      success: true,
      message: "Workspace actualizado correctamente.",
      data: {
        id: workspace._id.toString(),
        name: workspace.name,
        defaultCurrency: workspace.defaultCurrency,
        settings: workspace.settings,
      },
    });
  } catch (error) {
    console.error("[WORKSPACE PATCH]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al actualizar el workspace.",
      },
      { status: 500 }
    );
  }
}


export async function DELETE(
  _request: Request,
  { params }: RouteContext
) {
  const session = await mongoose.startSession();

  try {
    const { workspaceId } = await params;

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "workspace:delete",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message:
            access.reason === "UNAUTHORIZED"
              ? "No tienes acceso a este workspace."
              : "No tienes permisos para eliminar este workspace.",
        },
        {
          status:
            access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    if (access.workspace.type === "personal") {
      return NextResponse.json(
        {
          success: false,
          message: "No se permite eliminar un workspace personal.",
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const ownerId = access.user._id;

    await session.withTransaction(async () => {
      // Verificar nuevamente que el usuario siga siendo OWNER.
      const ownerMembership = await MembershipModel.findOne({
        workspaceId,
        userId: ownerId,
        role: "OWNER",
        status: "active",
      }).session(session);

      if (!ownerMembership) {
        throw new Error("OWNER_NOT_FOUND");
      }

      // Eliminación lógica.
      const workspace = await WorkspaceModel.findOneAndUpdate(
        {
          _id: workspaceId,
          type: "shared",
          deletedAt: null,
        },
        {
          $set: { deletedAt: now },
        },
        {
          new: true,
          session,
        }
      );

      if (!workspace) {
        throw new Error("WORKSPACE_NOT_FOUND");
      }

      // Revocar invitaciones pendientes.
      await InvitationModel.updateMany(
        {
          workspaceId,
          status: "pending",
        },
        {
          $set: {
            status: "revoked",
            revokedAt: now,
          },
        },
        { session }
      );
    });

    // Eliminar cookie si este workspace estaba seleccionado.
    const cookieStore = await cookies();

    if (
      cookieStore.get("fm_active_workspace")?.value === workspaceId
    ) {
      cookieStore.delete("fm_active_workspace");
    }

    return NextResponse.json({
      success: true,
      message: "Workspace eliminado correctamente.",
      data: {
        workspaceId,
        deletedAt: now,
      },
    });
  } catch (error) {
    console.error("[WORKSPACE DELETE]", error);

    if (error instanceof Error) {
      if (error.message === "OWNER_NOT_FOUND") {
        return NextResponse.json(
          {
            success: false,
            message: "Solo el propietario actual puede eliminar el workspace.",
          },
          { status: 403 }
        );
      }

      if (error.message === "WORKSPACE_NOT_FOUND") {
        return NextResponse.json(
          {
            success: false,
            message: "El workspace no existe o ya fue eliminado.",
          },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: "Error al eliminar el workspace.",
      },
      { status: 500 }
    );
  } finally {
    await session.endSession();
  }
}
