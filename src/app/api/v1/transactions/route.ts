
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getActiveWorkspace } from "@/lib/auth/get-active-workspace";
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission";
import { connectDB } from "@/lib/mongodb/connection";

import { TransactionModel } from "@/modules/transactions/transaction.model";
import {
  createFinancialTransaction,
  createTransferTransaction,
  TransactionServiceError,
} from "@/modules/transactions/transaction.service";
import { AccountModel } from "@/modules/accounts/account.model";


// GET: consultar movimientos del workspace.
export async function GET(request: Request) {
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
      permission: "transactions:read",
    });

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, message: "No tienes permiso para consultar movimientos." },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const accountId = searchParams.get("accountId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const allowedTypes = [
      "income",
      "expense",
      "transfer",
      "loan_disbursement",
      "loan_repayment",
      "debt_payment",
      "adjustment",
    ];

    if (type && !allowedTypes.includes(type)) {
      return NextResponse.json(
        { success: false, message: "El tipo de movimiento no es válido." },
        { status: 400 }
      );
    }

    if (
      status &&
      !["pending", "confirmed", "cancelled"].includes(status)
    ) {
      return NextResponse.json(
        { success: false, message: "El estado no es válido." },
        { status: 400 }
      );
    }

    if (accountId && !/^[a-f\d]{24}$/i.test(accountId)) {
      return NextResponse.json(
        { success: false, message: "El identificador de cuenta no es válido." },
        { status: 400 }
      );
    }

    const dateFilter: Record<string, Date> = {};

    if (startDate) {
      const date = new Date(startDate);

      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, message: "La fecha inicial no es válida." },
          { status: 400 }
        );
      }

      dateFilter.$gte = date;
    }

    if (endDate) {
      const date = new Date(endDate);

      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, message: "La fecha final no es válida." },
          { status: 400 }
        );
      }

      dateFilter.$lte = date;
    }

    if (
      dateFilter.$gte &&
      dateFilter.$lte &&
      dateFilter.$gte > dateFilter.$lte
    ) {
      return NextResponse.json(
        { success: false, message: "El rango de fechas no es válido." },
        { status: 400 }
      );
    }

    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") ?? "1", 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20
      )
    );

    // Obtener las cuentas visibles para el usuario.
    // Incluye archivadas para conservar el acceso al historial.
    const accessibleAccounts = await AccountModel.find({
      workspaceId,
      $or: [
        { visibility: "shared" },
        { createdBy: user._id },
      ],
    })
      .select("_id")
      .lean();

    const accessibleAccountIds = accessibleAccounts.map(
      (account) => account._id
    );

    const filters: Record<string, unknown> = {
      workspaceId,
      // Excluye movimientos eliminados; también incluye documentos antiguos
      // que todavía no tengan el campo deletedAt.
      deletedAt: null,
      accountId: { $in: accessibleAccountIds },
      $or: [
        { destinationAccountId: null },
        { destinationAccountId: { $in: accessibleAccountIds } },
      ],
    };

    if (type) filters.type = type;
    if (status) filters.status = status;

    if (accountId) {
      if (
        !accessibleAccountIds.some(
          (id) => id.toString() === accountId
        )
      ) {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }

      filters.$and = [
        {
          $or: [
            { accountId },
            { destinationAccountId: accountId },
          ],
        },
      ];
    }

    if (startDate || endDate) {
      filters.date = dateFilter;
    }

    if (type) filters.type = type;
    if (status) filters.status = status;

    if (accountId) {
      filters.$or = [
        { accountId },
        { destinationAccountId: accountId },
      ];
    }

    if (startDate || endDate) {
      filters.date = dateFilter;
    }

    await connectDB();

    const [transactions, total] = await Promise.all([
      TransactionModel.find(filters)
        .populate("accountId", "name type currency")
        .populate("destinationAccountId", "name type currency")
        .populate("categoryId", "name type icon color")
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      TransactionModel.countDocuments(filters),
    ]);

    return NextResponse.json({
      success: true,
      data: transactions.map((transaction) => ({
        ...transaction,
        id: transaction._id.toString(),
        workspaceId: transaction.workspaceId.toString(),
        createdBy: transaction.createdBy.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[GET /api/v1/transactions]", error);

    return NextResponse.json(
      { success: false, message: "Error al consultar los movimientos." },
      { status: 500 }
    );
  }
}

// POST: crear ingreso, gasto o transferencia.
export async function POST(request: Request) {
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
      permission: "transactions:create",
    });

    if (!access.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: "No tienes permiso para crear movimientos.",
        },
        {
          status: access.reason === "UNAUTHORIZED" ? 401 : 403,
        }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "El cuerpo de la petición no es válido." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const isTransfer = data.type === "transfer";

    const allowedFields = isTransfer
      ? [
          "type",
          "sourceAccountId",
          "destinationAccountId",
          "description",
          "amountMinor",
          "destinationAmountMinor",
          "date",
          "fee",
          "notes",
          "status",
          "idempotencyKey",
        ]
      : [
          "accountId",
          "type",
          "description",
          "amountMinor",
          "currency",
          "date",
          "categoryId",
          "splits",
          "notes",
          "status",
          "idempotencyKey",
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

    if (
      data.status !== undefined &&
      !["pending", "confirmed"].includes(data.status as string)
    ) {
      return NextResponse.json(
        { success: false, message: "El estado no es válido." },
        { status: 400 }
      );
    }

    if (
      data.date !== undefined &&
      (typeof data.date !== "string" ||
        Number.isNaN(new Date(data.date).getTime()))
    ) {
      return NextResponse.json(
        { success: false, message: "La fecha no es válida." },
        { status: 400 }
      );
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

    if (
      data.idempotencyKey !== undefined &&
      typeof data.idempotencyKey !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "La clave de idempotencia no es válida." },
        { status: 400 }
      );
    }

    const date =
      typeof data.date === "string" ? new Date(data.date) : undefined;

    // Crear transferencia.
    if (isTransfer) {
      const isValidObjectId = (value: unknown): value is string =>
        typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

      if (
        !isValidObjectId(data.sourceAccountId) ||
        !isValidObjectId(data.destinationAccountId)
      ) {
        return NextResponse.json(
          { success: false, message: "Los identificadores de cuenta no son válidos." },
          { status: 400 }
        );
      }

      if (
        typeof data.description !== "string" ||
        data.description.trim().length < 2
      ) {
        return NextResponse.json(
          { success: false, message: "La descripción es obligatoria." },
          { status: 400 }
        );
      }

      if (
        typeof data.amountMinor !== "number" ||
        !Number.isSafeInteger(data.amountMinor) ||
        data.amountMinor <= 0
      ) {
        return NextResponse.json(
          { success: false, message: "El importe de origen no es válido." },
          { status: 400 }
        );
      }

      if (
        typeof data.destinationAmountMinor !== "number" ||
        !Number.isSafeInteger(data.destinationAmountMinor) ||
        data.destinationAmountMinor <= 0
      ) {
        return NextResponse.json(
          { success: false, message: "El importe de destino no es válido." },
          { status: 400 }
        );
      }

      let fee:
        | { amountMinor: number; categoryId: string }
        | null
        | undefined;

      if (data.fee !== undefined && data.fee !== null) {
        if (
          typeof data.fee !== "object" ||
          Array.isArray(data.fee)
        ) {
          return NextResponse.json(
            { success: false, message: "La comisión no es válida." },
            { status: 400 }
          );
        }

        const feeData = data.fee as Record<string, unknown>;

        const invalidFeeFields = Object.keys(feeData).filter(
          (field) => !["amountMinor", "categoryId"].includes(field)
        );

        if (invalidFeeFields.length > 0) {
          return NextResponse.json(
            { success: false, message: "La comisión contiene campos no permitidos." },
            { status: 400 }
          );
        }

        if (
          typeof feeData.amountMinor !== "number" ||
          !Number.isSafeInteger(feeData.amountMinor) ||
          feeData.amountMinor <= 0 ||
          !isValidObjectId(feeData.categoryId)
        ) {
          return NextResponse.json(
            { success: false, message: "Los datos de la comisión no son válidos." },
            { status: 400 }
          );
        }

        fee = {
          amountMinor: feeData.amountMinor,
          categoryId: feeData.categoryId,
        };
      }

      const result = await createTransferTransaction({
        workspaceId,
        userId: user._id.toString(),
        sourceAccountId: data.sourceAccountId,
        destinationAccountId: data.destinationAccountId,
        description: data.description,
        amountMinor: data.amountMinor,
        destinationAmountMinor: data.destinationAmountMinor,
        date,
        fee,
        notes: data.notes as string | null | undefined,
        status: data.status as "pending" | "confirmed" | undefined,
        idempotencyKey: data.idempotencyKey as string | undefined,
      });

      return NextResponse.json(
        {
          success: true,
          message: result.duplicate
            ? "La transferencia ya había sido registrada."
            : "Transferencia registrada correctamente.",
          data: {
            ...result.transaction,
            id: result.transaction._id.toString(),
          },
          duplicate: result.duplicate,
        },
        { status: result.duplicate ? 200 : 201 }
      );
    }

    // Crear ingreso o gasto.
    if (!["income", "expense"].includes(data.type as string)) {
      return NextResponse.json(
        {
          success: false,
          message: "El tipo de movimiento no es válido.",
        },
        { status: 400 }
      );
    }

    if (
      typeof data.accountId !== "string" ||
      !/^[a-f\d]{24}$/i.test(data.accountId)
    ) {
      return NextResponse.json(
        { success: false, message: "La cuenta no es válida." },
        { status: 400 }
      );
    }

    if (
      typeof data.description !== "string" ||
      data.description.trim().length < 2
    ) {
      return NextResponse.json(
        { success: false, message: "La descripción es obligatoria." },
        { status: 400 }
      );
    }

    if (
      typeof data.amountMinor !== "number" ||
      !Number.isSafeInteger(data.amountMinor) ||
      data.amountMinor <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "El importe no es válido." },
        { status: 400 }
      );
    }

    if (typeof data.currency !== "string") {
      return NextResponse.json(
        { success: false, message: "La moneda es obligatoria." },
        { status: 400 }
      );
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
      (
        !Array.isArray(data.splits) ||
        data.splits.some(
          (split) =>
            !split ||
            typeof split !== "object" ||
            typeof split.categoryId !== "string" ||
            typeof split.amountMinor !== "number" ||
            !Number.isSafeInteger(split.amountMinor)
        )
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Las divisiones por categoría no son válidas." },
        { status: 400 }
      );
    }

    const result = await createFinancialTransaction({
      workspaceId,
      userId: user._id.toString(),
      accountId: data.accountId,
      type: data.type as "income" | "expense",
      description: data.description,
      amountMinor: data.amountMinor,
      currency: data.currency,
      date,
      categoryId: data.categoryId as string | null | undefined,
      splits: data.splits as
        | { categoryId: string; amountMinor: number }[]
        | undefined,
      notes: data.notes as string | null | undefined,
      status: data.status as "pending" | "confirmed" | undefined,
      idempotencyKey: data.idempotencyKey as string | undefined,
    });

    return NextResponse.json(
      {
        success: true,
        message: result.duplicate
          ? "El movimiento ya había sido registrado."
          : "Movimiento registrado correctamente.",
        data: {
          ...result.transaction,
          id: result.transaction._id.toString(),
        },
        duplicate: result.duplicate,
      },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof TransactionServiceError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error("[POST /api/v1/transactions]", error);

    return NextResponse.json(
      { success: false, message: "Error al registrar el movimiento." },
      { status: 500 }
    );
  }
}

