
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";

import { CategoryModel } from "@/modules/categories/category.model";
import { createDefaultCategories } from "@/modules/categories/category.defaults";

import { connectDB } from "@/lib/mongodb/connection";

// POST: inicializar categorías predeterminadas en un workspace existente.
export async function POST() {
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
      permission: "workspace:update",
    });

    if (!authorization.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permisos para inicializar este workspace.",
        },
        {
          status:
            authorization.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    await connectDB();

    const session = await mongoose.startSession();

    let alreadyInitialized = false;

    try {
      await session.withTransaction(async () => {
        const existingCategories = await CategoryModel.countDocuments({
          workspaceId: activeWorkspace.workspace._id,
        }).session(session);

        if (existingCategories > 0) {
          alreadyInitialized = true;
          return;
        }

        await createDefaultCategories({
          workspaceId: activeWorkspace.workspace._id,
          userId: activeWorkspace.user._id,
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    if (alreadyInitialized) {
      return NextResponse.json(
        {
          success: false,
          message:
            "El workspace ya tiene categorías. No se realizaron cambios.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Categorías predeterminadas creadas correctamente.",
        data: {
          workspaceId,
          total: 41,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/v1/categories/initialize]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al inicializar las categorías.",
      },
      { status: 500 }
    );
  }
}
