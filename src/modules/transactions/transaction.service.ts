
import mongoose, { Types } from "mongoose";

import { AccountModel } from "@/modules/accounts/account.model";
import { CategoryModel } from "@/modules/categories/category.model";
import { TransactionModel } from "@/modules/transactions/transaction.model";
import { LedgerEntryModel } from "@/modules/transactions/ledger-entry.model";

import { connectDB } from "@/lib/mongodb/connection";
import { getCurrencyFactor } from "@/lib/currency/currency";

type FinancialTransactionType = "income" | "expense";
type TransactionStatus = "pending" | "confirmed";

interface CreateTransferTransactionInput {
  workspaceId: string;
  userId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  amountMinor: number;
  destinationAmountMinor: number;
  date?: Date;
  fee?: {
    amountMinor: number;
    categoryId: string;
  } | null;
  notes?: string | null;
  status?: TransactionStatus;
  idempotencyKey?: string;
}

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

interface DeleteFinancialTransactionInput {
  workspaceId: string;
  userId: string;
  transactionId: string;
}

interface UpdateFinancialTransactionInput {
  workspaceId: string;
  userId: string;
  transactionId: string;
  accountId?: string;
  destinationAccountId?: string;
  description?: string;
  amountMinor?: number;
  destinationAmountMinor?: number;
  currency?: string;
  date?: Date;
  categoryId?: string | null;
  splits?: {
    categoryId: string;
    amountMinor: number;
  }[];
  fee?: {
    amountMinor: number;
    categoryId: string;
  } | null;
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


function calculateExchangeRate(
  sourceAmountMinor: number,
  sourceCurrency: string,
  destinationAmountMinor: number,
  destinationCurrency: string
): string {
  const precision = 18;
  const numerator =
    BigInt(destinationAmountMinor) *
    getCurrencyFactor(sourceCurrency) *
    10n ** BigInt(precision);
  const denominator =
    BigInt(sourceAmountMinor) * getCurrencyFactor(destinationCurrency);

  const scaledRate = (numerator + denominator / 2n) / denominator;
  const integerPart = scaledRate / 10n ** BigInt(precision);
  const decimalPart = (scaledRate % 10n ** BigInt(precision))
    .toString()
    .padStart(precision, "0")
    .replace(/0+$/, "");

  return decimalPart
    ? `${integerPart.toString()}.${decimalPart}`
    : integerPart.toString();
}

function isSameTransferRequest(
  existing: {
    type: string;
    accountId: Types.ObjectId;
    destinationAccountId: Types.ObjectId | null;
    description: string;
    amountMinor: number;
    currency: string;
    date: Date;
    exchange: {
      toCurrency: string;
      convertedAmountMinor: number;
    } | null;
    fee: {
      amountMinor: number;
      currency: string;
      categoryId: Types.ObjectId;
    } | null;
    notes: string | null;
    status: string;
  },
  input: CreateTransferTransactionInput,
  sourceCurrency: string,
  destinationCurrency: string
): boolean {
  const normalizedFee = input.fee ?? null;

  return (
    existing.type === "transfer" &&
    existing.accountId.toString() === input.sourceAccountId &&
    existing.destinationAccountId?.toString() === input.destinationAccountId &&
    existing.description === input.description.trim() &&
    existing.amountMinor === input.amountMinor &&
    existing.currency === sourceCurrency &&
    existing.exchange?.toCurrency ===
      (sourceCurrency === destinationCurrency ? undefined : destinationCurrency) &&
    (existing.exchange?.convertedAmountMinor ?? input.amountMinor) ===
      input.destinationAmountMinor &&
    (existing.fee?.amountMinor ?? null) ===
      (normalizedFee?.amountMinor ?? null) &&
    (existing.fee?.categoryId.toString() ?? null) ===
      (normalizedFee?.categoryId ?? null) &&
    (!input.date ||
      new Date(existing.date).getTime() === input.date.getTime()) &&
    (existing.notes ?? null) === (input.notes?.trim() || null) &&
    existing.status === (input.status ?? "confirmed")
  );
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



export async function createTransferTransaction(
  input: CreateTransferTransactionInput
) {
  const {
    workspaceId,
    userId,
    sourceAccountId,
    destinationAccountId,
    description,
    amountMinor,
    destinationAmountMinor,
    date = new Date(),
    fee = null,
    notes = null,
    status = "confirmed",
    idempotencyKey,
  } = input;

  if (
    !isValidObjectId(workspaceId) ||
    !isValidObjectId(userId) ||
    !isValidObjectId(sourceAccountId) ||
    !isValidObjectId(destinationAccountId)
  ) {
    fail("Los identificadores proporcionados no son válidos.");
  }

  if (sourceAccountId === destinationAccountId) {
    fail("La cuenta de origen y destino deben ser diferentes.");
  }

  if (
    typeof description !== "string" ||
    description.trim().length < 2 ||
    description.trim().length > 150
  ) {
    fail("La descripción debe tener entre 2 y 150 caracteres.");
  }

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    fail("El importe de origen debe ser un entero seguro mayor que cero.");
  }

  if (
    !Number.isSafeInteger(destinationAmountMinor) ||
    destinationAmountMinor <= 0
  ) {
    fail("El importe de destino debe ser un entero seguro mayor que cero.");
  }

  if (Number.isNaN(date.getTime())) {
    fail("La fecha de la transferencia no es válida.");
  }

  if (!["pending", "confirmed"].includes(status)) {
    fail("El estado de la transferencia no es válido.");
  }

  if (
    idempotencyKey !== undefined &&
    (typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.trim().length > 128)
  ) {
    fail("La clave de idempotencia no es válida.");
  }

  if (fee) {
    if (
      !Number.isSafeInteger(fee.amountMinor) ||
      fee.amountMinor <= 0 ||
      !isValidObjectId(fee.categoryId)
    ) {
      fail("Los datos de la comisión no son válidos.");
    }

    if (!Number.isSafeInteger(amountMinor + fee.amountMinor)) {
      fail("El débito total supera el límite permitido.");
    }
  }

  const normalizedKey = idempotencyKey?.trim();

  await connectDB();
  const session = await mongoose.startSession();

  let createdTransactionId: Types.ObjectId | null = null;
  let duplicate = false;

  try {
    await session.withTransaction(async () => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const userObjectId = new Types.ObjectId(userId);

      const sourceAccount = await AccountModel.findOne({
        _id: new Types.ObjectId(sourceAccountId),
        workspaceId: workspaceObjectId,
        status: "active",
        type: { $in: SUPPORTED_ACCOUNT_TYPES },
        $or: [{ visibility: "shared" }, { createdBy: userObjectId }],
      }).session(session);

      const destinationAccount = await AccountModel.findOne({
        _id: new Types.ObjectId(destinationAccountId),
        workspaceId: workspaceObjectId,
        status: "active",
        type: { $in: SUPPORTED_ACCOUNT_TYPES },
        $or: [{ visibility: "shared" }, { createdBy: userObjectId }],
      }).session(session);

      if (!sourceAccount || !destinationAccount) {
        fail(
          "Una de las cuentas no existe, no está disponible o no tienes acceso.",
          404
        );
      }

      const sourceCurrency = sourceAccount.currency.toUpperCase();
      const destinationCurrency = destinationAccount.currency.toUpperCase();

      if (
        sourceCurrency === destinationCurrency &&
        amountMinor !== destinationAmountMinor
      ) {
        fail(
          "Cuando las cuentas utilizan la misma moneda, los importes deben ser iguales."
        );
      }

      const exchange =
        sourceCurrency === destinationCurrency
          ? null
          : {
              fromCurrency: sourceCurrency,
              toCurrency: destinationCurrency,
              rate: calculateExchangeRate(
                amountMinor,
                sourceCurrency,
                destinationAmountMinor,
                destinationCurrency
              ),
              convertedAmountMinor: destinationAmountMinor,
            };

      if (normalizedKey) {
        const existing = await TransactionModel.findOne({
          workspaceId: workspaceObjectId,
          idempotencyKey: normalizedKey,
        }).session(session);

        if (existing) {
          if (
            !isSameTransferRequest(
              existing,
              input,
              sourceCurrency,
              destinationCurrency
            )
          ) {
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

      if (fee) {
        const feeCategory = await CategoryModel.findOne({
          _id: new Types.ObjectId(fee.categoryId),
          workspaceId: workspaceObjectId,
          type: "expense",
          status: "active",
        }).session(session);

        if (!feeCategory) {
          fail("La categoría de la comisión no existe o no es válida.");
        }
      }

      const [transaction] = await TransactionModel.create(
        [
          {
            workspaceId: workspaceObjectId,
            accountId: sourceAccount._id,
            destinationAccountId: destinationAccount._id,
            type: "transfer",
            description: description.trim(),
            date,
            amountMinor,
            currency: sourceCurrency,
            categoryId: null,
            splits: [],
            exchange,
            fee: fee
              ? {
                  amountMinor: fee.amountMinor,
                  currency: sourceCurrency,
                  categoryId: new Types.ObjectId(fee.categoryId),
                }
              : null,
            idempotencyKey: normalizedKey ?? null,
            notes: notes?.trim() || null,
            status,
            createdBy: userObjectId,
          },
        ],
        { session }
      );

      createdTransactionId = transaction._id;

      if (status === "confirmed") {
        const entries: {
          workspaceId: Types.ObjectId;
          transactionId: Types.ObjectId;
          accountId: Types.ObjectId;
          type: "transfer_out" | "transfer_in" | "fee";
          amountMinor: number;
          currency: string;
          effectiveAt: Date;
          reversalOf: null;
          createdBy: Types.ObjectId;
        }[] = [
          {
            workspaceId: workspaceObjectId,
            transactionId: transaction._id,
            accountId: sourceAccount._id,
            type: "transfer_out",
            amountMinor: -amountMinor,
            currency: sourceCurrency,
            effectiveAt: date,
            reversalOf: null,
            createdBy: userObjectId,
          },
          {
            workspaceId: workspaceObjectId,
            transactionId: transaction._id,
            accountId: destinationAccount._id,
            type: "transfer_in",
            amountMinor: destinationAmountMinor,
            currency: destinationCurrency,
            effectiveAt: date,
            reversalOf: null,
            createdBy: userObjectId,
          },
        ];

        if (fee) {
          entries.push({
            workspaceId: workspaceObjectId,
            transactionId: transaction._id,
            accountId: sourceAccount._id,
            type: "fee",
            amountMinor: -fee.amountMinor,
            currency: sourceCurrency,
            effectiveAt: date,
            reversalOf: null,
            createdBy: userObjectId,
          });
        }

        await LedgerEntryModel.create(entries, {
          session,
          ordered: true,
        });
      }
    });

    if (!createdTransactionId) {
      throw new Error("No se pudo crear la transferencia.");
    }

    const transaction = await TransactionModel.findById(
      createdTransactionId
    ).lean();

    if (!transaction) {
      throw new Error("No se pudo recuperar la transferencia.");
    }

    return { transaction, duplicate };
  } catch (error) {
    if (normalizedKey && isIdempotencyDuplicateKeyError(error)) {
      const existing = await TransactionModel.findOne({
        workspaceId: new Types.ObjectId(workspaceId),
        idempotencyKey: normalizedKey,
      });

      if (existing) {
        const [sourceAccount, destinationAccount] = await Promise.all([
          AccountModel.findById(sourceAccountId),
          AccountModel.findById(destinationAccountId),
        ]);

        if (
          sourceAccount &&
          destinationAccount &&
          isSameTransferRequest(
            existing,
            input,
            sourceAccount.currency,
            destinationAccount.currency
          )
        ) {
          return { transaction: existing, duplicate: true };
        }

        fail(
          "La clave de idempotencia ya fue utilizada con datos diferentes.",
          409
        );
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

      const transaction = await TransactionModel.findOne({
        _id: transactionObjectId,
        workspaceId: workspaceObjectId,
        deletedAt: null,
      }).session(session);

      if (!transaction) {
        fail("La transacción no existe.", 404);
      }

      if (transaction.status !== "pending") {
        fail(
          "La transacción no está pendiente y no puede confirmarse.",
          409
        );
      }

      if (
        transaction.type !== "income" &&
        transaction.type !== "expense" &&
        transaction.type !== "transfer"
      ) {
        fail("Este tipo de movimiento todavía no admite confirmación.", 409);
      }

      if (transaction.type === "transfer") {
        if (!transaction.destinationAccountId) {
          fail("La transferencia no tiene una cuenta de destino.");
        }

        const [sourceAccount, destinationAccount] = await Promise.all([
          AccountModel.findOne({
            _id: transaction.accountId,
            workspaceId: workspaceObjectId,
            status: "active",
            type: { $in: SUPPORTED_ACCOUNT_TYPES },
            currency: transaction.currency,
            $or: [{ visibility: "shared" }, { createdBy: userObjectId }],
          }).session(session),
          AccountModel.findOne({
            _id: transaction.destinationAccountId,
            workspaceId: workspaceObjectId,
            status: "active",
            type: { $in: SUPPORTED_ACCOUNT_TYPES },
            $or: [{ visibility: "shared" }, { createdBy: userObjectId }],
          }).session(session),
        ]);

        if (!sourceAccount || !destinationAccount) {
          fail(
            "La cuenta de origen o destino ya no está disponible.",
            409
          );
        }

        const destinationCurrency = destinationAccount.currency.toUpperCase();
        const destinationAmountMinor =
          transaction.exchange?.convertedAmountMinor ??
          transaction.amountMinor;

        if (
          sourceAccount.currency.toUpperCase() === destinationCurrency &&
          destinationAmountMinor !== transaction.amountMinor
        ) {
          fail("Los importes de la transferencia no son coherentes.");
        }

        if (
          sourceAccount.currency.toUpperCase() !== destinationCurrency &&
          (!transaction.exchange ||
            transaction.exchange.fromCurrency !== sourceAccount.currency.toUpperCase() ||
            transaction.exchange.toCurrency !== destinationCurrency)
        ) {
          fail("La conversión de moneda de la transferencia no es válida.");
        }

        if (transaction.fee) {
          const feeCategory = await CategoryModel.findOne({
            _id: transaction.fee.categoryId,
            workspaceId: workspaceObjectId,
            type: "expense",
            status: "active",
          }).session(session);

          if (!feeCategory) {
            fail("La categoría de la comisión ya no está disponible.", 409);
          }
        }

        const totalDebit =
          transaction.amountMinor + (transaction.fee?.amountMinor ?? 0);

        if (!Number.isSafeInteger(totalDebit)) {
          fail("El débito total de la transferencia supera el límite permitido.");
        }

        const updated = await TransactionModel.findOneAndUpdate(
          {
            _id: transactionObjectId,
            workspaceId: workspaceObjectId,
            status: "pending",
            deletedAt: null,
          },
          { $set: { status: "confirmed" } },
          { new: true, runValidators: true, session }
        );

        if (!updated) {
          fail("La transferencia dejó de estar pendiente.", 409);
        }

        const entries: {
          workspaceId: Types.ObjectId;
          transactionId: Types.ObjectId;
          accountId: Types.ObjectId;
          type: "transfer_out" | "transfer_in" | "fee";
          amountMinor: number;
          currency: string;
          effectiveAt: Date;
          reversalOf: null;
          createdBy: Types.ObjectId;
        }[] = [
          {
            workspaceId: workspaceObjectId,
            transactionId: transaction._id,
            accountId: transaction.accountId,
            type: "transfer_out",
            amountMinor: -transaction.amountMinor,
            currency: transaction.currency,
            effectiveAt: transaction.date,
            reversalOf: null,
            createdBy: userObjectId,
          },
          {
            workspaceId: workspaceObjectId,
            transactionId: transaction._id,
            accountId: transaction.destinationAccountId,
            type: "transfer_in",
            amountMinor: destinationAmountMinor,
            currency: destinationCurrency,
            effectiveAt: transaction.date,
            reversalOf: null,
            createdBy: userObjectId,
          },
        ];

        if (transaction.fee) {
          entries.push({
            workspaceId: workspaceObjectId,
            transactionId: transaction._id,
            accountId: transaction.accountId,
            type: "fee",
            amountMinor: -transaction.fee.amountMinor,
            currency: transaction.currency,
            effectiveAt: transaction.date,
            reversalOf: null,
            createdBy: userObjectId,
          });
        }

        await LedgerEntryModel.create(entries, { session });
        confirmedTransactionId = updated._id;
        return;
      }

      const account = await AccountModel.findOne({
        _id: transaction.accountId,
        workspaceId: workspaceObjectId,
        status: "active",
        type: { $in: SUPPORTED_ACCOUNT_TYPES },
        currency: transaction.currency,
        $or: [{ visibility: "shared" }, { createdBy: userObjectId }],
      }).session(session);

      if (!account) {
        fail("La cuenta ya no está disponible.", 409);
      }

      const updated = await TransactionModel.findOneAndUpdate(
        {
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
          status: "pending",
          deletedAt: null,
        },
        { $set: { status: "confirmed" } },
        { new: true, runValidators: true, session }
      );

      if (!updated) {
        fail("La transacción dejó de estar pendiente.", 409);
      }

      const signedAmount =
        transaction.type === "income"
          ? transaction.amountMinor
          : -transaction.amountMinor;

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

      confirmedTransactionId = updated._id;
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
          deletedAt: null,
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

/**
 * Elimina lógicamente un movimiento pendiente.
 *
 * No modifica el ledger: los movimientos pendientes no generan asientos.
 * Los movimientos confirmados o cancelados no se pueden eliminar.
 */
export async function deleteFinancialTransaction(
  input: DeleteFinancialTransactionInput
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
  let deletedTransactionId: Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const workspaceObjectId = new Types.ObjectId(workspaceId);
      const userObjectId = new Types.ObjectId(userId);
      const transactionObjectId = new Types.ObjectId(transactionId);

      const transaction = await TransactionModel.findOneAndUpdate(
        {
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
          status: "pending",
          deletedAt: null,
        },
        {
          $set: {
            deletedAt: new Date(),
            deletedBy: userObjectId,
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

        if (existing.deletedAt) {
          fail("La transacción ya fue eliminada.", 409);
        }

        fail(
          "Solo se pueden eliminar movimientos pendientes.",
          409
        );
      }

      deletedTransactionId = transaction._id;
    });

    if (!deletedTransactionId) {
      throw new Error("No se pudo eliminar la transacción.");
    }

    const transaction = await TransactionModel.findById(
      deletedTransactionId
    ).lean();

    if (!transaction) {
      throw new Error("No se pudo recuperar la transacción eliminada.");
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
    destinationAccountId,
    description,
    amountMinor,
    destinationAmountMinor,
    currency,
    date,
    categoryId,
    splits,
    fee,
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
    destinationAccountId !== undefined &&
    !isValidObjectId(destinationAccountId)
  ) {
    fail("El identificador de cuenta de destino no es válido.");
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
    destinationAmountMinor !== undefined &&
    (!Number.isSafeInteger(destinationAmountMinor) ||
      destinationAmountMinor <= 0)
  ) {
    fail("El importe de destino debe ser un entero seguro mayor que cero.");
  }

  if (
    currency !== undefined &&
    (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency))
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
    fee !== undefined &&
    fee !== null &&
    (
      !Number.isSafeInteger(fee.amountMinor) ||
      fee.amountMinor <= 0 ||
      !isValidObjectId(fee.categoryId)
    )
  ) {
    fail("Los datos de la comisión no son válidos.");
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
        deletedAt: null,
      }).session(session);

      if (!existing) {
        fail("La transacción no existe.", 404);
      }

      if (existing.status !== "pending") {
        fail("Solo se pueden editar movimientos pendientes.", 409);
      }

      const finalAccountId = accountId ?? existing.accountId.toString();
      const finalDescription =
        description !== undefined ? description.trim() : existing.description;
      const finalAmountMinor = amountMinor ?? existing.amountMinor;
      const finalDate = date ?? existing.date;
      const finalNotes =
        notes !== undefined ? notes?.trim() || null : existing.notes;

      // ------------------------------------------------------------
      // Transferencias pendientes
      // ------------------------------------------------------------
      if (existing.type === "transfer") {
        if (
          currency !== undefined ||
          categoryId !== undefined ||
          splits !== undefined
        ) {
          fail(
            "En una transferencia, la moneda depende de las cuentas y no se admiten categorías ni divisiones."
          );
        }

        const finalDestinationAccountId =
          destinationAccountId ??
          existing.destinationAccountId?.toString();

        if (!finalDestinationAccountId) {
          fail("La transferencia no tiene una cuenta de destino.");
        }

        if (finalAccountId === finalDestinationAccountId) {
          fail("La cuenta de origen y destino deben ser diferentes.");
        }

        const sourceAccount = await AccountModel.findOne({
          _id: new Types.ObjectId(finalAccountId),
          workspaceId: workspaceObjectId,
          status: "active",
          type: { $in: SUPPORTED_ACCOUNT_TYPES },
          $or: [
            { visibility: "shared" },
            { createdBy: userObjectId },
          ],
        }).session(session);

        const destinationAccount = await AccountModel.findOne({
          _id: new Types.ObjectId(finalDestinationAccountId),
          workspaceId: workspaceObjectId,
          status: "active",
          type: { $in: SUPPORTED_ACCOUNT_TYPES },
          $or: [
            { visibility: "shared" },
            { createdBy: userObjectId },
          ],
        }).session(session);

        if (!sourceAccount || !destinationAccount) {
          fail(
            "La cuenta de origen o destino no existe, no está disponible o no tienes acceso.",
            404
          );
        }

        const sourceCurrency = sourceAccount.currency.toUpperCase();
        const destinationCurrency =
          destinationAccount.currency.toUpperCase();

        const sourceAmountChanged =
          finalAmountMinor !== existing.amountMinor;
        const destinationAccountChanged =
          finalDestinationAccountId !==
          existing.destinationAccountId?.toString();
        const currencyPairChanged =
          sourceCurrency !== existing.currency ||
          destinationCurrency !==
            (existing.exchange?.toCurrency ?? existing.currency);

        let finalDestinationAmountMinor: number;

        if (destinationAmountMinor !== undefined) {
          finalDestinationAmountMinor = destinationAmountMinor;
        } else if (sourceCurrency === destinationCurrency) {
          finalDestinationAmountMinor = finalAmountMinor;
        } else if (
          !sourceAmountChanged &&
          !destinationAccountChanged &&
          !currencyPairChanged &&
          existing.exchange
        ) {
          finalDestinationAmountMinor =
            existing.exchange.convertedAmountMinor;
        } else {
          fail(
            "Debes proporcionar el importe de destino al cambiar el importe o las cuentas de una transferencia entre monedas diferentes."
          );
        }

        if (
          sourceCurrency === destinationCurrency &&
          finalAmountMinor !== finalDestinationAmountMinor
        ) {
          fail(
            "Cuando las cuentas utilizan la misma moneda, los importes deben ser iguales."
          );
        }

        const finalExchange =
          sourceCurrency === destinationCurrency
            ? null
            : {
                fromCurrency: sourceCurrency,
                toCurrency: destinationCurrency,
                rate: calculateExchangeRate(
                  finalAmountMinor,
                  sourceCurrency,
                  finalDestinationAmountMinor,
                  destinationCurrency
                ),
                convertedAmountMinor: finalDestinationAmountMinor,
              };

        const finalFee =
          fee !== undefined
            ? fee
            : existing.fee
              ? {
                  amountMinor: existing.fee.amountMinor,
                  categoryId: existing.fee.categoryId.toString(),
                }
              : null;

        if (finalFee) {
          if (
            !Number.isSafeInteger(finalAmountMinor + finalFee.amountMinor)
          ) {
            fail("El débito total de la transferencia supera el límite permitido.");
          }

          const feeCategory = await CategoryModel.findOne({
            _id: new Types.ObjectId(finalFee.categoryId),
            workspaceId: workspaceObjectId,
            type: "expense",
            status: "active",
          }).session(session);

          if (!feeCategory) {
            fail("La categoría de la comisión no existe o no es válida.");
          }
        }

        const updated = await TransactionModel.findOneAndUpdate(
          {
            _id: transactionObjectId,
            workspaceId: workspaceObjectId,
            type: "transfer",
            status: "pending",
            deletedAt: null,
          },
          {
            $set: {
              accountId: sourceAccount._id,
              destinationAccountId: destinationAccount._id,
              description: finalDescription,
              amountMinor: finalAmountMinor,
              currency: sourceCurrency,
              date: finalDate,
              exchange: finalExchange,
              fee: finalFee
                ? {
                    amountMinor: finalFee.amountMinor,
                    currency: sourceCurrency,
                    categoryId: new Types.ObjectId(finalFee.categoryId),
                  }
                : null,
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
            "La transferencia dejó de estar pendiente y no pudo actualizarse.",
            409
          );
        }

        updatedTransactionId = updated._id;
        return;
      }

      // ------------------------------------------------------------
      // Ingresos y gastos pendientes
      // ------------------------------------------------------------
      if (existing.type !== "income" && existing.type !== "expense") {
        fail("Este tipo de movimiento no admite esta operación.", 409);
      }

      if (
        destinationAccountId !== undefined ||
        destinationAmountMinor !== undefined ||
        fee !== undefined
      ) {
        fail(
          "Los campos de cuenta de destino, conversión y comisión solo se permiten en transferencias."
        );
      }

      const finalCurrency =
        currency !== undefined ? currency.toUpperCase() : existing.currency;

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
          : existing.splits.map((split: any) => ({
              categoryId: split.categoryId.toString(),
              amountMinor: split.amountMinor,
            }));

      if (!finalCategoryId && finalSplits.length === 0) {
        fail("El movimiento debe tener una categoría o divisiones.");
      }

      if (finalCategoryId && finalSplits.length > 0) {
        fail("Utiliza una categoría principal o divisiones, no ambas.");
      }

      if (finalSplits.length > 0) {
        const categoryIds = finalSplits.map((split) => split.categoryId);

        if (new Set(categoryIds).size !== categoryIds.length) {
          fail("No puedes repetir categorías en las divisiones.");
        }

        const total = finalSplits.reduce(
          (sum, split) => sum + split.amountMinor,
          0
        );

        if (!Number.isSafeInteger(total) || total !== finalAmountMinor) {
          fail("La suma de las categorías debe coincidir con el importe.");
        }
      }

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

      if (finalCategoryId) {
        const category = await CategoryModel.findOne({
          _id: new Types.ObjectId(finalCategoryId),
          workspaceId: workspaceObjectId,
          type: existing.type,
          status: "active",
        }).session(session);

        if (!category) {
          fail("La categoría no existe o no corresponde al movimiento.");
        }
      }

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
          fail("Una o más categorías de las divisiones no son válidas.");
        }
      }

      const updated = await TransactionModel.findOneAndUpdate(
        {
          _id: transactionObjectId,
          workspaceId: workspaceObjectId,
          status: "pending",
          type: { $in: ["income", "expense"] },
          deletedAt: null,
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

