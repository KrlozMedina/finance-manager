
import { NextResponse } from "next/server";

import { getAccountBalances } from "@/modules/accounts/account-balance.service";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";

// GET: consultar saldos de las cuentas activas del workspace.
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Debes iniciar sesión.",
        },
        { status: 401 }
      );
    }

    const active = await getActiveWorkspace();

    if (!active) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes un workspace activo.",
        },
        { status: 404 }
      );
    }

    const workspaceId = active.workspace._id.toString();

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "accounts:read",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para consultar los saldos.",
        },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const balances = await getAccountBalances({
      workspaceId,
      userId: user._id.toString(),
    });

    return NextResponse.json({
      success: true,
      data: balances,
    });
  } catch (error) {
    console.error("[GET /api/v1/accounts/balances]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al consultar los saldos de las cuentas.",
      },
      { status: 500 }
    );
  }
}
