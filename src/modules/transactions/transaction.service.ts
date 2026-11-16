
import mongoose, { Types } from "mongoose";

import { AccountModel } from "@/modules/accounts/account.model";
import { CategoryModel } from "@/modules/categories/category.model";
import { TransactionModel } from "@/modules/transactions/transaction.model";
import { LedgerEntryModel } from "@/modules/transactions/ledger-entry.model";

import { connectDB } from "@/lib/mongodb/connection";

type FinancialTransactionType = "income" | "expense";
type TransactionStatus = "pending" | "confirmed";

interface CreateFinancialTransactionInput {
  workspaceId: string;
  userId: string;
  accountId: string;
  type: FinancialTransactionType;
  description: string;
  amountMinor: number;
  currency: string;
  date?: Date;
  categoryId?: string | null;
  splits?: {
    categoryId: string;
    amountMinor: number;
  }[];
  notes?: string | null;
  status?: TransactionStatus;
  idempotencyKey?: string;
}

interface ServiceErrorOptions {
  status: number;
}

export class TransactionServiceError extends Error {
  status: number;

  constructor(message: string, options: ServiceErrorOptions) {
    super(message);
    this.name = "TransactionServiceError";
    this.status = options.status;
  }
}

const SUPPORTED_ACCOUNT_TYPES = [
  "bank",
  "savings",
  "cash",
  "digital_wallet",
] as const;

function fail(message: string, status = 400): never {
  throw new TransactionServiceError(message, { status });
}

function isValidObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

export async function createFinancialTransaction(
  input: CreateFinancialTransactionInput
) {
  const {
    workspaceId,
    userId,
    accountId,
    type,
    description,
    amountMinor,
    currency,
    date = new Date(),
    categoryId = null,
    splits = [],
    notes = null,
    status = "confirmed",
    idempotencyKey,
  } = input;

  // Validaciones básicas.
  if (
    !isValidObjectId(workspaceId) ||
    !isValidObjectId(userId) ||
    !isValidObjectId(accountId)
  ) {
    fail("Los identificadores proporcionados no son válidos.");
  }

  if (!["income", "expense"].includes(type)) {
    fail("El tipo de movimiento no es válido.");
  }

  if (
    typeof description !== "string" ||
    description.trim().length < 2 ||
    description.trim().length > 150
  ) {
    fail("La descripción debe tener entre 2 y 150 caracteres.");
  }

  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    fail("El importe debe ser un entero seguro mayor que cero.");
  }

  if (
    typeof currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(currency)
  ) {
    fail("El código de moneda no es válido.");
  }

  if (Number.isNaN(date.getTime())) {
    fail("La fecha del movimiento no es válida.");
  }

  if (!["pending", "confirmed"].includes(status)) {
    fail("El estado del movimiento no es válido.");
  }

  if (
    idempotencyKey !== undefined &&
    (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.trim().length > 128
    )
  ) {
    fail("La clave de idempotencia no es válida.");
  }

  if (categoryId && !isValidObjectId(categoryId)) {
    fail("El identificador de categoría no es válido.");
  }

  // No permitir categoría principal y divisiones simultáneamente.
  if (categoryId && splits.length > 0) {
    fail("Utiliza una categoría principal o divisiones, no ambas.");
  }

  // Validar divisiones.
  if (splits.length > 0) {
    const total = splits.reduce(
      (sum, split) => sum + split.amountMinor,
      0
    );

    if (
      !Number.isSafeInteger(total) ||
      total !== amountMinor
    ) {
      fail("La suma de las categorías debe coincidir con el importe.");
    }

    const categoryIds = splits.map((split) => split.categoryId);

    if (
      categoryIds.some((id) => !isValidObjectId(id)) ||
      new Set(categoryIds).size !== categoryIds.length
    ) {
      fail("Las categorías de las divisiones no son válidas o están repetidas.");
    }

    if (
      splits.some(
        (split) =>
          !Number.isSafeInteger(split.amountMinor) ||
          split.amountMinor <= 0
      )
    ) {
      fail("Los importes de las divisiones deben ser enteros positivos.");
    }
  }

  const normalizedCurrency = currency.toUpperCase();
  const normalizedKey = idempotencyKey?.trim();

  await connectDB();

  // La conexión ya debe estar inicializada por connectDB
  // antes de invocar este servicio.
  const session = await mongoose.startSession();

  let createdTransactionId: Types.ObjectId | null = null;
  let duplicate = false;

  try {
    await session.withTransaction(async () => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const userObjectId = new Types.ObjectId(userId);
      const accountObjectId = new Types.ObjectId(accountId);

      // Idempotencia.
      if (normalizedKey) {
        const existing = await TransactionModel.findOne({
          workspaceId: workspaceObjectId,
          idempotencyKey: normalizedKey,
        }).session(session);

        if (existing) {
          createdTransactionId = existing._id;
          duplicate = true;
          return;
        }
      }

      // Validar cuenta y visibilidad.
      const account = await AccountModel.findOne({
        _id: accountObjectId,
        workspaceId: workspaceObjectId,
        status: "active",
        type: { $in: SUPPORTED_ACCOUNT_TYPES },
        currency: normalizedCurrency,
        $or: [
          { visibility: "shared" },
          { createdBy: userObjectId },
        ],
      }).session(session);

      if (!account) {
        fail(
          "La cuenta no existe, no está disponible o su moneda no coincide.",
          404
        );
      }

      // Validar categoría principal.
      if (categoryId) {
        const category = await CategoryModel.findOne({
          _id: new Types.ObjectId(categoryId),
          workspaceId: workspaceObjectId,
          type,
          status: "active",
        }).session(session);

        if (!category) {
          fail("La categoría no existe o no corresponde al movimiento.");
        }
      }

      // Validar categorías de las divisiones.
      if (splits.length > 0) {
        const categories = await CategoryModel.find({
          _id: {
            $in: splits.map(
              (split) => new Types.ObjectId(split.categoryId)
            ),
          },
          workspaceId: workspaceObjectId,
          type,
          status: "active",
        }).session(session);

        if (categories.length !== splits.length) {
          fail("Una o más categorías de las divisiones no son válidas.");
        }
      }

      // Crear transacción.
      const [transaction] = await TransactionModel.create(
        [
          {
            workspaceId: workspaceObjectId,
            accountId: accountObjectId,
            destinationAccountId: null,
            type,
            description: description.trim(),
            date,
            amountMinor,
            currency: normalizedCurrency,
            categoryId: categoryId
              ? new Types.ObjectId(categoryId)
              : null,
            splits: splits.map((split) => ({
              categoryId: new Types.ObjectId(split.categoryId),
              amountMinor: split.amountMinor,
            })),
            exchange: null,
            idempotencyKey: normalizedKey ?? null,
            notes: notes?.trim() || null,
            status,
            createdBy: userObjectId,
          },
        ],
        { session }
      );

      createdTransactionId = transaction._id;

      // Los movimientos pendientes no afectan el ledger.
      if (status === "confirmed") {
        const signedAmount =
          type === "income" ? amountMinor : -amountMinor;

        await LedgerEntryModel.create(
          [
            {
              workspaceId: workspaceObjectId,
              transactionId: transaction._id,
              accountId: accountObjectId,
              type: "transaction",
              amountMinor: signedAmount,
              currency: normalizedCurrency,
              effectiveAt: date,
              reversalOf: null,
              createdBy: userObjectId,
            },
          ],
          { session }
        );
      }
    });

    if (!createdTransactionId) {
      throw new Error("No se pudo crear la transacción.");
    }

    const transaction = await TransactionModel.findById(
      createdTransactionId
    ).lean();

    if (!transaction) {
      throw new Error("No se pudo recuperar la transacción.");
    }

    return {
      transaction,
      duplicate,
    };
  } finally {
    await session.endSession();
  }
}
