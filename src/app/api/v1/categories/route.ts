
import { NextResponse } from "next/server";

import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";

import {
  CategoryServiceError,
  createCategory,
  getCategories,
} from "@/modules/categories/category.service";


// GET: consultar categorías del workspace activo.
export async function GET(request: Request) {
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

    const authorization = await requireWorkspacePermission({
      workspaceId,
      permission: "categories:read",
    });

    if (!authorization.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permisos para consultar categorías.",
        },
        {
          status:
            authorization.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeArchivedParam = searchParams.get("includeArchived");

    if (
      includeArchivedParam !== null &&
      includeArchivedParam !== "true" &&
      includeArchivedParam !== "false"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El parámetro includeArchived no es válido.",
        },
        { status: 400 }
      );
    }

    const categories = await getCategories({
      workspaceId,
      includeArchived: includeArchivedParam === "true",
    });

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("[GET /api/v1/categories]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al consultar las categorías.",
      },
      { status: 500 }
    );
  }
}

// POST: crear una categoría personalizada.
export async function POST(request: Request) {
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

    const authorization = await requireWorkspacePermission({
      workspaceId,
      permission: "categories:create",
    });

    if (!authorization.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permisos para crear categorías.",
        },
        {
          status:
            authorization.reason === "UNAUTHORIZED" ? 401 : 403,
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

    const {
      name,
      type,
      parentId,
      icon,
      color,
    } = body as Record<string, unknown>;

    if (typeof name !== "string") {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre de la categoría es obligatorio.",
        },
        { status: 400 }
      );
    }

    if (type !== "income" && type !== "expense") {
      return NextResponse.json(
        {
          success: false,
          message: "El tipo debe ser income o expense.",
        },
        { status: 400 }
      );
    }

    if (
      parentId !== undefined &&
      parentId !== null &&
      typeof parentId !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El identificador de la categoría padre no es válido.",
        },
        { status: 400 }
      );
    }

    if (icon !== undefined && typeof icon !== "string") {
      return NextResponse.json(
        {
          success: false,
          message: "El icono debe ser un texto.",
        },
        { status: 400 }
      );
    }

    if (color !== undefined && typeof color !== "string") {
      return NextResponse.json(
        {
          success: false,
          message: "El color debe ser un texto.",
        },
        { status: 400 }
      );
    }

    if (
      typeof icon === "string" &&
      icon.length > 50
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El icono no puede superar los 50 caracteres.",
        },
        { status: 400 }
      );
    }

    if (
      typeof color === "string" &&
      !/^#[0-9A-Fa-f]{6}$/.test(color)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El color debe tener formato hexadecimal #RRGGBB.",
        },
        { status: 400 }
      );
    }

    const category = await createCategory({
      workspaceId,
      userId: activeWorkspace.user._id.toString(),
      name,
      type,
      parentId: parentId as string | null | undefined,
      icon: icon as string | undefined,
      color: color as string | undefined,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Categoría creada correctamente.",
        data: {
          id: category._id.toString(),
          name: category.name,
          type: category.type,
          parentId: category.parentId?.toString() ?? null,
          icon: category.icon,
          color: category.color,
          status: category.status,
          createdAt: category.createdAt,
        },
      },
      { status: 201 }
    );
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

    console.error("[POST /api/v1/categories]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al crear la categoría.",
      },
      { status: 500 }
    );
  }
}


interface UpdateCategoryBody {
  name?: string;
  icon?: string;
  color?: string;
  status?: "active" | "archived";
}