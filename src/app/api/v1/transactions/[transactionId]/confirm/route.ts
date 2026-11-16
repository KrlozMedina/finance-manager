
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";

import {
  confirmFinancialTransaction,
  TransactionServiceError,
} from "@/modules/transactions/transaction.service";

interface RouteContext {
  params: Promise<{
    transactionId: string;
  }>;
}

// POST: confirmar un movimiento pendiente.
export async function POST(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Debes iniciar sesión." },
        { status: 401 }
      );
    }

    const active = await getActiveWorkspace();

    if (!active) {
      return NextResponse.json(
        { success: false, message: "No tienes un workspace activo." },
        { status: 404 }
      );
    }

    const workspaceId = active.workspace._id.toString();

    const access = await requireWorkspacePermission({
      workspaceId,
      permission: "transactions:update",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para confirmar movimientos.",
        },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const { transactionId } = await params;

    if (!/^[a-f\d]{24}$/i.test(transactionId)) {
      return NextResponse.json(
        {
          success: false,
          message: "El identificador del movimiento no es válido.",
        },
        { status: 400 }
      );
    }

    const result = await confirmFinancialTransaction({
      workspaceId,
      userId: user._id.toString(),
      transactionId,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Movimiento confirmado correctamente.",
        data: {
          ...result.transaction,
          id: result.transaction._id.toString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof TransactionServiceError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error("[POST /api/v1/transactions/[transactionId]/confirm]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error al confirmar el movimiento.",
      },
      { status: 500 }
    );
  }
}
