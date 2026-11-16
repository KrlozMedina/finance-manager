
import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import {
  CategoryServiceError,
  updateCategory,
} from "@/modules/categories/category.service";

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import type { Permission } from "@/lib/auth/permissions";

interface UpdateCategoryBody {
  name?: string;
  icon?: string;
  color?: string;
  status?: "active" | "archived";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  try {
    const activeWorkspace = await getActiveWorkspace();

    if (!activeWorkspace) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes un workspace activo.",
        },
        { status: 400 }
      );
    }

    const workspaceId = activeWorkspace.workspace._id.toString();

    const { categoryId } = await params;

    if (!mongoose.isValidObjectId(categoryId)) {
      return NextResponse.json(
        {
          success: false,
          message: "El identificador de la categoría no es válido.",
        },
        { status: 400 }
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

    const allowedFields = ["name", "icon", "color", "status"];
    const bodyFields = Object.keys(body);

    if (
      bodyFields.length === 0 ||
      bodyFields.some((field) => !allowedFields.includes(field))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Los campos enviados no son válidos.",
        },
        { status: 400 }
      );
    }

    const data = body as UpdateCategoryBody;

    if (
      data.name !== undefined &&
      typeof data.name !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre debe ser un texto.",
        },
        { status: 400 }
      );
    }

    if (
      data.icon !== undefined &&
      typeof data.icon !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El icono debe ser un texto.",
        },
        { status: 400 }
      );
    }

    if (
      data.color !== undefined &&
      typeof data.color !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El color debe ser un texto.",
        },
        { status: 400 }
      );
    }

    if (
      data.status !== undefined &&
      data.status !== "active" &&
      data.status !== "archived"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El estado debe ser active o archived.",
        },
        { status: 400 }
      );
    }

    const requiresUpdatePermission =
      data.name !== undefined ||
      data.icon !== undefined ||
      data.color !== undefined;

    const requiredPermissions: Permission[] = [];

    if (requiresUpdatePermission) {
      requiredPermissions.push("categories:update");
    }

    if (data.status !== undefined) {
      requiredPermissions.push("categories:archive");
    }

    for (const permission of requiredPermissions) {
      const authorization = await requireWorkspacePermission({
        workspaceId,
        permission,
      });

      if (!authorization.authorized) {
        return NextResponse.json(
          {
            success: false,
            message:
              permission === "categories:archive"
                ? "No tienes permisos para archivar o reactivar categorías."
                : "No tienes permisos para actualizar categorías.",
          },
          {
            status:
              authorization.reason === "UNAUTHORIZED" ? 401 : 403,
          }
        );
      }
    }

    const category = await updateCategory({
      workspaceId,
      categoryId,
      ...data,
    });

    return NextResponse.json({
      success: true,
      message: "Categoría actualizada correctamente.",
      data: {
        id: category._id.toString(),
        name: category.name,
        type: category.type,
        parentId: category.parentId?.toString() ?? null,
        icon: category.icon,
        color: category.color,
        status: category.status,
        updatedAt: category.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof CategoryServiceError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: error.statusCode }
      );
    }

    console.error("[PATCH /api/v1/categories]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al actualizar la categoría.",
      },
      { status: 500 }
    );
  }
}
