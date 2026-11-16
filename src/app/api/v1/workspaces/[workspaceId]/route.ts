
import { NextResponse } from "next/server";

import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";

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
