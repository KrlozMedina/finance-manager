import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";

import {
  deleteFinancialTransaction,
  updateFinancialTransaction,
  TransactionServiceError,
} from "@/modules/transactions/transaction.service";

interface RouteContext {
  params: Promise<{
    transactionId: string;
  }>;
}

interface FeePayload {
  amountMinor: number;
  categoryId: string;
}

// PATCH: actualizar un movimiento pendiente.
export async function PATCH(
  request: Request,
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
          message: "No tienes permiso para actualizar movimientos.",
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

    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "El cuerpo de la petición no es válido." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const allowedFields = [
      "accountId",
      "destinationAccountId",
      "description",
      "amountMinor",
      "destinationAmountMinor",
      "currency",
      "date",
      "categoryId",
      "splits",
      "fee",
      "notes",
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

    const stringFields = [
      "accountId",
      "destinationAccountId",
      "description",
      "currency",
    ] as const;

    for (const field of stringFields) {
      if (data[field] !== undefined && typeof data[field] !== "string") {
        return NextResponse.json(
          {
            success: false,
            message:
              field === "accountId"
                ? "La cuenta no es válida."
                : field === "destinationAccountId"
                  ? "La cuenta de destino no es válida."
                  : field === "description"
                    ? "La descripción no es válida."
                    : "La moneda no es válida.",
          },
          { status: 400 }
        );
      }
    }

    for (const field of ["amountMinor", "destinationAmountMinor"] as const) {
      if (data[field] !== undefined && typeof data[field] !== "number") {
        return NextResponse.json(
          {
            success: false,
            message:
              field === "amountMinor"
                ? "El importe no es válido."
                : "El importe de destino no es válido.",
          },
          { status: 400 }
        );
      }
    }

    let date: Date | undefined;

    if (data.date !== undefined) {
      if (typeof data.date !== "string") {
        return NextResponse.json(
          { success: false, message: "La fecha no es válida." },
          { status: 400 }
        );
      }

      date = new Date(data.date);

      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, message: "La fecha no es válida." },
          { status: 400 }
        );
      }
    }

    if (
      data.categoryId !== undefined &&
      data.categoryId !== null &&
      typeof data.categoryId !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "La categoría no es válida." },
        { status: 400 }
      );
    }

    if (
      data.splits !== undefined &&
      (!Array.isArray(data.splits) ||
        data.splits.some(
          (split: unknown) =>
            !split ||
            typeof split !== "object" ||
            Array.isArray(split) ||
            typeof (split as Record<string, unknown>).categoryId !== "string" ||
            typeof (split as Record<string, unknown>).amountMinor !== "number"
        ))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Las divisiones por categoría no son válidas.",
        },
        { status: 400 }
      );
    }

    let fee: FeePayload | null | undefined;

    if (data.fee === null) {
      fee = null;
    } else if (data.fee !== undefined) {
      if (
        typeof data.fee !== "object" ||
        Array.isArray(data.fee) ||
        typeof (data.fee as Record<string, unknown>).amountMinor !== "number" ||
        typeof (data.fee as Record<string, unknown>).categoryId !== "string"
      ) {
        return NextResponse.json(
          { success: false, message: "La comisión no es válida." },
          { status: 400 }
        );
      }

      fee = {
        amountMinor: (data.fee as Record<string, number | string>).amountMinor as number,
        categoryId: (data.fee as Record<string, number | string>).categoryId as string,
      };
    }

    if (
      data.notes !== undefined &&
      data.notes !== null &&
      typeof data.notes !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Las notas no son válidas." },
        { status: 400 }
      );
    }

    const result = await updateFinancialTransaction({
      workspaceId,
      userId: user._id.toString(),
      transactionId,
      accountId: data.accountId as string | undefined,
      destinationAccountId: data.destinationAccountId as string | undefined,
      description: data.description as string | undefined,
      amountMinor: data.amountMinor as number | undefined,
      destinationAmountMinor: data.destinationAmountMinor as number | undefined,
      currency: data.currency as string | undefined,
      date,
      categoryId: data.categoryId as string | null | undefined,
      splits: data.splits as
        | { categoryId: string; amountMinor: number }[]
        | undefined,
      fee,
      notes: data.notes as string | null | undefined,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Movimiento actualizado correctamente.",
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

    console.error("[PATCH /api/v1/transactions/[transactionId]]", error);

    return NextResponse.json(
      { success: false, message: "Error al actualizar el movimiento." },
      { status: 500 }
    );
  }
}

// DELETE: eliminación lógica de un movimiento pendiente.
export async function DELETE(
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
      permission: "transactions:delete",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para eliminar movimientos.",
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

    const result = await deleteFinancialTransaction({
      workspaceId,
      userId: user._id.toString(),
      transactionId,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Movimiento eliminado correctamente.",
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

    console.error("[DELETE /api/v1/transactions/[transactionId]]", error);

    return NextResponse.json(
      { success: false, message: "Error al eliminar el movimiento." },
      { status: 500 }
    );
  }
}
