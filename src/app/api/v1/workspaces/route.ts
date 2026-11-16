
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { connectDB } from "@/lib/mongodb/connection";

import { MembershipModel } from "@/modules/workspaces/membership.model";
import { WorkspaceModel } from "@/modules/workspaces/workspace.model";

export async function GET() {
  try {
    // 1. Obtener usuario autenticado.
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

    // 2. Consultar membresías activas del usuario.
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

    // 3. Obtener únicamente los workspaces asociados.
    const workspaceIds = memberships.map(
      (membership) => membership.workspaceId
    );

    const workspaces = await WorkspaceModel.find({
      _id: { $in: workspaceIds },
    })
      .select("name type defaultCurrency settings createdAt updatedAt")
      .sort({ createdAt: 1 })
      .lean();

    // 4. Asociar cada workspace con su membresía.
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

      // Ignorar membresías cuyo workspace ya no existe.
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
