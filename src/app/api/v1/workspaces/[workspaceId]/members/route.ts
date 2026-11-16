
import { NextResponse } from "next/server";

import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";

import { MembershipModel } from "@/modules/workspaces/membership.model";
import { UserModel } from "@/modules/users/user.model";

interface RouteContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  try {
    const { workspaceId } = await params;

    // 1. Validar acceso al workspace.
    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "members:read",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para consultar los miembros.",
        },
        {
          status:
            access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    // 2. Validar paginación.
    const { searchParams } = new URL(request.url);

    const requestedPage = Number(
      searchParams.get("page") ?? DEFAULT_PAGE
    );

    const requestedLimit = Number(
      searchParams.get("limit") ?? DEFAULT_LIMIT
    );

    if (
      !Number.isInteger(requestedPage) ||
      requestedPage < 1 ||
      !Number.isInteger(requestedLimit) ||
      requestedLimit < 1
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Los parámetros de paginación no son válidos.",
        },
        { status: 400 }
      );
    }

    const page = requestedPage;
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const skip = (page - 1) * limit;

    // 3. Consultar membresías del workspace.
    const [memberships, total] = await Promise.all([
      MembershipModel.find({
        workspaceId,
      })
        .select("userId role status joinedAt createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      MembershipModel.countDocuments({
        workspaceId,
      }),
    ]);

    if (memberships.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // 4. Consultar perfiles de los miembros.
    const userIds = memberships.map(
      (membership) => membership.userId
    );

    const users = await UserModel.find({
      _id: { $in: userIds },
    })
      .select("name email avatar status")
      .lean();

    const userMap = new Map(
      users.map((user) => [
        user._id.toString(),
        user,
      ])
    );

    // 5. Combinar información de usuario y membresía.
    const data = memberships.flatMap((membership) => {
      const user = userMap.get(
        membership.userId.toString()
      );

      if (!user) {
        return [];
      }

      return [
        {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          userStatus: user.status,
          role: membership.role,
          membershipStatus: membership.status,
          joinedAt: membership.joinedAt,
          createdAt: membership.createdAt,
        },
      ];
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(
      "[GET /api/v1/workspaces/:workspaceId/members]",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Error al consultar los miembros del workspace.",
      },
      { status: 500 }
    );
  }
}
