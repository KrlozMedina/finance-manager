
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { connectDB } from "@/lib/mongodb/connection";

import { MembershipModel } from "@/modules/workspaces/membership.model";
import { WorkspaceModel } from "@/modules/workspaces/workspace.model";

import { createDefaultCategories } from "@/modules/categories/category.defaults";

// GET: listar workspaces del usuario.
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes iniciar sesión para consultar tus workspaces.",
        },
        { status: 401 }
      );
    }

    await connectDB();

    const memberships = await MembershipModel.find({
      userId: user._id,
      status: "active",
    })
      .select("workspaceId role joinedAt createdAt")
      .sort({ createdAt: 1 })
      .lean();

    if (memberships.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const workspaceIds = memberships.map(
      (membership) => membership.workspaceId
    );

    const workspaces = await WorkspaceModel.find({
      _id: { $in: workspaceIds },
      deletedAt: null,
    })
      .select("name type defaultCurrency settings createdAt updatedAt")
      .sort({ createdAt: 1 })
      .lean();


    const workspaceMap = new Map(
      workspaces.map((workspace) => [
        workspace._id.toString(),
        workspace,
      ])
    );

    const data = memberships.flatMap((membership) => {
      const workspace = workspaceMap.get(
        membership.workspaceId.toString()
      );

      if (!workspace) {
        return [];
      }

      return [
        {
          id: workspace._id.toString(),
          name: workspace.name,
          type: workspace.type,
          defaultCurrency: workspace.defaultCurrency,
          settings: workspace.settings,
          role: membership.role,
          joinedAt: membership.joinedAt,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        },
      ];
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[GET /api/v1/workspaces]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al consultar los workspaces.",
      },
      { status: 500 }
    );
  }
}

// POST: crear workspace compartido.
export async function POST(request: Request) {
  try {
    // 1. Obtener usuario autenticado.
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes iniciar sesión para crear un workspace.",
        },
        { status: 401 }
      );
    }

    // 2. Validar cuerpo de la petición.
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

    const { name, defaultCurrency } = body as {
      name?: unknown;
      defaultCurrency?: unknown;
    };

    if (typeof name !== "string") {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre del workspace es obligatorio.",
        },
        { status: 400 }
      );
    }

    const normalizedName = name.trim();

    if (
      normalizedName.length < 2 ||
      normalizedName.length > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre debe tener entre 2 y 100 caracteres.",
        },
        { status: 400 }
      );
    }

    const currency =
      defaultCurrency === undefined ? "COP" : defaultCurrency;

    if (
      typeof currency !== "string" ||
      !/^[A-Z]{3}$/.test(currency.toUpperCase())
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "La moneda debe tener un código válido de tres letras.",
        },
        { status: 400 }
      );
    }

    await connectDB();

    // 3. Crear workspace y membresía en una transacción.
    const session = await mongoose.startSession();

    let createdWorkspaceId: mongoose.Types.ObjectId | null = null;

    try {
      await session.withTransaction(async () => {
        const [workspace] = await WorkspaceModel.create(
          [
            {
              name: normalizedName,
              type: "shared",
              defaultCurrency: currency.toUpperCase(),
              settings: {
                timezone: "America/Bogota",
                allowMemberInvites: false,
              },
              createdBy: user._id,
            },
          ],
          { session }
        );

        await MembershipModel.create(
          [
            {
              workspaceId: workspace._id,
              userId: user._id,
              role: "OWNER",
              status: "active",
              joinedAt: new Date(),
            },
          ],
          { session }
        );

        await createDefaultCategories({
          workspaceId: workspace._id,
          userId: user._id,
          session,
        });

        createdWorkspaceId = workspace._id;
      });
    } finally {
      await session.endSession();
    }

    if (!createdWorkspaceId) {
      throw new Error("No se pudo crear el workspace.");
    }

    // 4. Recuperar workspace creado.
    const workspace = await WorkspaceModel.findById(
      createdWorkspaceId
    ).lean();

    if (!workspace) {
      throw new Error("No se pudo recuperar el workspace creado.");
    }

    return NextResponse.json(
      {
        success: true,
        message: "Workspace compartido creado correctamente.",
        data: {
          id: workspace._id.toString(),
          name: workspace.name,
          type: workspace.type,
          defaultCurrency: workspace.defaultCurrency,
          settings: workspace.settings,
          role: "OWNER",
          createdAt: workspace.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/v1/workspaces]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al crear el workspace compartido.",
      },
      { status: 500 }
    );
  }
}
