
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

interface ConfirmFinancialTransactionInput {
  workspaceId: string;
  userId: string;
  transactionId: string;
}

interface CancelFinancialTransactionInput {
  workspaceId: string;
  userId: string;
  transactionId: string;
}

interface UpdateFinancialTransactionInput {
  workspaceId: string;
  userId: string;
  transactionId: string;
  accountId?: string;
  description?: string;
  amountMinor?: number;
  currency?: string;
  date?: Date;
  categoryId?: string | null;
  splits?: {
    categoryId: string;
    amountMinor: number;
  }[];
  notes?: string | null;
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


function isIdempotencyDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const mongoError = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
  };

  return (
    mongoError.code === 11000 &&
    mongoError.keyPattern?.workspaceId === 1 &&
    mongoError.keyPattern?.idempotencyKey === 1
  );
}

function isSameTransactionRequest(
  existing: {
    accountId: Types.ObjectId;
    type: string;
    description: string;
    amountMinor: number;
    currency: string;
    date: Date;
    categoryId: Types.ObjectId | null;
    splits: {
      categoryId: Types.ObjectId;
      amountMinor: number;
    }[];
    notes: string | null;
    status: string;
  },
  input: CreateFinancialTransactionInput
): boolean {
  const existingSplits = existing.splits
    .map((split) => ({
      categoryId: split.categoryId.toString(),
      amountMinor: split.amountMinor,
    }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId));

  const inputSplits = (input.splits ?? [])
    .map((split) => ({
      categoryId: split.categoryId,
      amountMinor: split.amountMinor,
    }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId));

  return (
    existing.accountId.toString() === input.accountId &&
    existing.type === input.type &&
    existing.description === input.description.trim() &&
    existing.amountMinor === input.amountMinor &&
    existing.currency === input.currency.toUpperCase() &&
    (!input.date ||
      new Date(existing.date).getTime() === input.date.getTime()) &&
    (existing.categoryId?.toString() ?? null) ===
      (input.categoryId ?? null) &&
    JSON.stringify(existingSplits) === JSON.stringify(inputSplits) &&
    (existing.notes ?? null) === (input.notes?.trim() || null) &&
    existing.status === (input.status ?? "confirmed")
  );
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


  // Validar categoría principal.
  if (categoryId && !isValidObjectId(categoryId)) {
    fail("El identificador de categoría no es válido.");
  }

  // Exigir una categoría principal o divisiones.
  if (!categoryId && splits.length === 0) {
    fail("El movimiento debe tener una categoría o divisiones.");
  }

  // No permitir categoría principal y divisiones simultáneamente.
  if (categoryId && splits.length > 0) {
    fail("Utiliza una categoría principal o divisiones, no ambas.");
  }

  // Validar divisiones.
  if (splits.length > 0) {
    if (!Array.isArray(splits)) {
      fail("Las divisiones por categoría no son válidas.");
    }

    if (
      splits.some(
        (split) =>
          !split ||
          typeof split.categoryId !== "string" ||
          !isValidObjectId(split.categoryId)
      )
    ) {
      fail("Una o más categorías de las divisiones no son válidas.");
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

    const categoryIds = splits.map((split) => split.categoryId);

    if (new Set(categoryIds).size !== categoryIds.length) {
      fail("No puedes repetir categorías en las divisiones.");
    }

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
          if (!isSameTransactionRequest(existing, input)) {
            fail(
              "La clave de idempotencia ya fue utilizada con datos diferentes.",
              409
            );
          }

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


  } catch (error) {
    // Una solicitud concurrente pudo registrar primero la misma clave.
    if (
      normalizedKey &&
      isIdempotencyDuplicateKeyError(error)
    ) {
      const existing = await TransactionModel.findOne({
        workspaceId: new Types.ObjectId(workspaceId),
        idempotencyKey: normalizedKey,
      });

      if (existing) {
        if (!isSameTransactionRequest(existing, input)) {
          fail(
            "La clave de idempotencia ya fue utilizada con datos diferentes.",
            409
          );
        }

        return {
          transaction: existing,
          duplicate: true,
        };
      }
    }

    throw error;
  } finally {
    await session.endSession();
  }
}


export async function confirmFinancialTransaction(
  input: ConfirmFinancialTransactionInput
) {
  const { workspaceId, userId, transactionId } = input;

  // Validar identificadores.
  if (
    !isValidObjectId(workspaceId) ||
    !isValidObjectId(userId) ||
    !isValidObjectId(transactionId)
  ) {
    fail("Los identificadores proporcionados no son válidos.");
  }

  await connectDB();

  const session = await mongoose.startSession();

  let confirmedTransactionId: Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const transactionObjectId = new Types.ObjectId(transactionId);
      const userObjectId = new Types.ObjectId(userId);

      // Confirmar únicamente si el movimiento está pendiente.
      const transaction = await TransactionModel.findOneAndUpdate(
        {
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
          status: "pending",
        },
        {
          $set: {
            status: "confirmed",
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!transaction) {
        const existing = await TransactionModel.findOne({
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
        }).session(session);

        if (!existing) {
          fail("La transacción no existe.", 404);
        }

        fail(
          "La transacción no está pendiente y no puede confirmarse.",
          409
        );
      }

      // Calcular el importe contable.
      const signedAmount =
        transaction.type === "income"
          ? transaction.amountMinor
          : -transaction.amountMinor;

      // Crear el registro contable.
      await LedgerEntryModel.create(
        [
          {
            workspaceId: workspaceObjectId,
            transactionId: transaction._id,
            accountId: transaction.accountId,
            type: "transaction",
            amountMinor: signedAmount,
            currency: transaction.currency,
            effectiveAt: transaction.date,
            reversalOf: null,
            createdBy: userObjectId,
          },
        ],
        { session }
      );

      confirmedTransactionId = transaction._id;
    });

    if (!confirmedTransactionId) {
      throw new Error("No se pudo confirmar la transacción.");
    }

    const transaction = await TransactionModel.findById(
      confirmedTransactionId
    ).lean();

    if (!transaction) {
      throw new Error("No se pudo recuperar la transacción confirmada.");
    }

    return { transaction };
  } finally {
    await session.endSession();
  }
}


export async function cancelFinancialTransaction(
  input: CancelFinancialTransactionInput
) {
  const { workspaceId, userId, transactionId } = input;

  if (
    !isValidObjectId(workspaceId) ||
    !isValidObjectId(userId) ||
    !isValidObjectId(transactionId)
  ) {
    fail("Los identificadores proporcionados no son válidos.");
  }

  await connectDB();

  const session = await mongoose.startSession();

  try {
    let cancelledTransactionId: Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const transactionObjectId = new Types.ObjectId(transactionId);

      const transaction = await TransactionModel.findOneAndUpdate(
        {
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
          status: "pending",
        },
        {
          $set: { status: "cancelled" },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!transaction) {
        const existing = await TransactionModel.findOne({
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
        }).session(session);

        if (!existing) {
          fail("La transacción no existe.", 404);
        }

        fail(
          "La transacción no está pendiente y no puede cancelarse.",
          409
        );
      }

      cancelledTransactionId = transaction._id;
    });

    if (!cancelledTransactionId) {
      throw new Error("No se pudo cancelar la transacción.");
    }

    const transaction = await TransactionModel.findById(
      cancelledTransactionId
    ).lean();

    if (!transaction) {
      throw new Error("No se pudo recuperar la transacción cancelada.");
    }

    return { transaction };
  } finally {
    await session.endSession();
  }
}

export async function updateFinancialTransaction(
  input: UpdateFinancialTransactionInput
) {
  const {
    workspaceId,
    userId,
    transactionId,
    accountId,
    description,
    amountMinor,
    currency,
    date,
    categoryId,
    splits,
    notes,
  } = input;

  if (
    !isValidObjectId(workspaceId) ||
    !isValidObjectId(userId) ||
    !isValidObjectId(transactionId)
  ) {
    fail("Los identificadores proporcionados no son válidos.");
  }

  if (accountId !== undefined && !isValidObjectId(accountId)) {
    fail("El identificador de cuenta no es válido.");
  }

  if (
    description !== undefined &&
    (
      typeof description !== "string" ||
      description.trim().length < 2 ||
      description.trim().length > 150
    )
  ) {
    fail("La descripción debe tener entre 2 y 150 caracteres.");
  }

  if (
    amountMinor !== undefined &&
    (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
  ) {
    fail("El importe debe ser un entero seguro mayor que cero.");
  }

  if (
    currency !== undefined &&
    (
      typeof currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(currency)
    )
  ) {
    fail("El código de moneda no es válido.");
  }

  if (date !== undefined && Number.isNaN(date.getTime())) {
    fail("La fecha del movimiento no es válida.");
  }

  if (
    categoryId !== undefined &&
    categoryId !== null &&
    !isValidObjectId(categoryId)
  ) {
    fail("El identificador de categoría no es válido.");
  }

  if (splits !== undefined && !Array.isArray(splits)) {
    fail("Las divisiones por categoría no son válidas.");
  }

  if (
    splits?.some(
      (split) =>
        !split ||
        typeof split.categoryId !== "string" ||
        !isValidObjectId(split.categoryId) ||
        !Number.isSafeInteger(split.amountMinor) ||
        split.amountMinor <= 0
    )
  ) {
    fail("Una o más divisiones por categoría no son válidas.");
  }

  if (
    notes !== undefined &&
    notes !== null &&
    typeof notes !== "string"
  ) {
    fail("Las notas no son válidas.");
  }

  await connectDB();

  const session = await mongoose.startSession();

  let updatedTransactionId: Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const userObjectId = new Types.ObjectId(userId);
      const transactionObjectId = new Types.ObjectId(transactionId);

      const existing = await TransactionModel.findOne({
        _id: transactionObjectId,
        workspaceId: workspaceObjectId,
      }).session(session);

      if (!existing) {
        fail("La transacción no existe.", 404);
      }

      if (existing.status !== "pending") {
        fail(
          "Solo se pueden editar movimientos pendientes.",
          409
        );
      }

      if (
        existing.type !== "income" &&
        existing.type !== "expense"
      ) {
        fail(
          "Este tipo de movimiento no admite esta operación.",
          409
        );
      }

      const finalAccountId =
        accountId ?? existing.accountId.toString();

      const finalDescription =
        description !== undefined
          ? description.trim()
          : existing.description;

      const finalAmountMinor =
        amountMinor ?? existing.amountMinor;

      const finalCurrency =
        currency !== undefined
          ? currency.toUpperCase()
          : existing.currency;

      const finalDate = date ?? existing.date;

      const finalCategoryId =
        categoryId !== undefined
          ? categoryId
          : existing.categoryId?.toString() ?? null;

      const finalSplits: {
        categoryId: string;
        amountMinor: number;
      }[] =
        splits !== undefined
          ? splits
          : existing.splits.map((split:any) => ({
              categoryId: split.categoryId.toString(),
              amountMinor: split.amountMinor,
            }));

      const finalNotes =
        notes !== undefined
          ? notes?.trim() || null
          : existing.notes;

      // Validar categoría principal y divisiones.
      if (!finalCategoryId && finalSplits.length === 0) {
        fail(
          "El movimiento debe tener una categoría o divisiones."
        );
      }

      if (finalCategoryId && finalSplits.length > 0) {
        fail(
          "Utiliza una categoría principal o divisiones, no ambas."
        );
      }

      if (finalSplits.length > 0) {
        const categoryIds = finalSplits.map(
          (split) => split.categoryId
        );

        if (new Set(categoryIds).size !== categoryIds.length) {
          fail("No puedes repetir categorías en las divisiones.");
        }

        const total = finalSplits.reduce(
          (sum, split) => sum + split.amountMinor,
          0
        );

        if (
          !Number.isSafeInteger(total) ||
          total !== finalAmountMinor
        ) {
          fail(
            "La suma de las categorías debe coincidir con el importe."
          );
        }
      }

      // Validar cuenta y visibilidad.
      const account = await AccountModel.findOne({
        _id: new Types.ObjectId(finalAccountId),
        workspaceId: workspaceObjectId,
        status: "active",
        type: { $in: SUPPORTED_ACCOUNT_TYPES },
        currency: finalCurrency,
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
      if (finalCategoryId) {
        const category = await CategoryModel.findOne({
          _id: new Types.ObjectId(finalCategoryId),
          workspaceId: workspaceObjectId,
          type: existing.type,
          status: "active",
        }).session(session);

        if (!category) {
          fail(
            "La categoría no existe o no corresponde al movimiento."
          );
        }
      }

      // Validar categorías de las divisiones.
      if (finalSplits.length > 0) {
        const categories = await CategoryModel.find({
          _id: {
            $in: finalSplits.map(
              (split) => new Types.ObjectId(split.categoryId)
            ),
          },
          workspaceId: workspaceObjectId,
          type: existing.type,
          status: "active",
        }).session(session);

        if (categories.length !== finalSplits.length) {
          fail(
            "Una o más categorías de las divisiones no son válidas."
          );
        }
      }

      // Actualizar únicamente si continúa pendiente.
      const updated = await TransactionModel.findOneAndUpdate(
        {
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
          status: "pending",
        },
        {
          $set: {
            accountId: new Types.ObjectId(finalAccountId),
            description: finalDescription,
            amountMinor: finalAmountMinor,
            currency: finalCurrency,
            date: finalDate,
            categoryId: finalCategoryId
              ? new Types.ObjectId(finalCategoryId)
              : null,
            splits: finalSplits.map((split) => ({
              categoryId: new Types.ObjectId(split.categoryId),
              amountMinor: split.amountMinor,
            })),
            notes: finalNotes,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updated) {
        fail(
          "El movimiento dejó de estar pendiente y no pudo actualizarse.",
          409
        );
      }

      updatedTransactionId = updated._id;
    });

    if (!updatedTransactionId) {
      throw new Error("No se pudo actualizar la transacción.");
    }

    const transaction = await TransactionModel.findById(
      updatedTransactionId
    ).lean();

    if (!transaction) {
      throw new Error("No se pudo recuperar la transacción actualizada.");
    }

    return { transaction };
  } finally {
    await session.endSession();
  }
}
