
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const transactionSplitSchema = new Schema(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "El importe de la categoría debe ser un entero seguro.",
      },
    },
  },
  {
    _id: false,
  }
);

const transactionExchangeSchema = new Schema(
  {
    fromCurrency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    toCurrency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    rate: {
      type: String,
      required: true,
      match: /^\d+(\.\d+)?$/,
    },

    convertedAmountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "El importe convertido debe ser un entero seguro.",
      },
    },
  },
  {
    _id: false,
  }
);

const transactionSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    // Cuenta afectada o cuenta de origen.
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    // Exclusivamente para transferencias.
    destinationAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    type: {
      type: String,
      enum: [
        "income",
        "expense",
        "transfer",
        "loan_disbursement",
        "loan_repayment",
        "debt_payment",
        "adjustment",
      ],
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    date: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Para transferencias representa el importe de origen.
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "El importe debe ser un entero seguro.",
      },
    },

    // Para transferencias representa la moneda de origen.
    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    splits: {
      type: [transactionSplitSchema],
      default: [],
    },

    exchange: {
      type: transactionExchangeSchema,
      default: null,
    },

    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      required: true,
      default: "pending",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "transactions",
  }
);

// Validaciones de integridad de la operación.

transactionSchema.pre("validate", function () {
  // Ingresos y gastos deben tener una categoría principal
  // o divisiones, pero nunca ambas opciones.
  if (this.type === "income" || this.type === "expense") {
    const hasCategory = Boolean(this.categoryId);
    const hasSplits = this.splits.length > 0;

    if (!hasCategory && !hasSplits) {
      this.invalidate(
        "categoryId",
        "Los ingresos y gastos deben tener una categoría o divisiones."
      );
    }

    if (hasCategory && hasSplits) {
      this.invalidate(
        "categoryId",
        "Utiliza una categoría principal o divisiones, no ambas."
      );
    }
  }

  // Validar divisiones por categoría.
  if (this.splits.length > 0) {
    const splitTotal = this.splits.reduce(
      (total, split) => total + split.amountMinor,
      0
    );

    if (
      !Number.isSafeInteger(splitTotal) ||
      splitTotal !== this.amountMinor
    ) {
      this.invalidate(
        "splits",
        "La suma de las categorías debe coincidir con el importe total."
      );
    }
  }

  // Validar cuenta de destino.
  if (this.type === "transfer") {
    if (!this.destinationAccountId) {
      this.invalidate(
        "destinationAccountId",
        "Una transferencia requiere una cuenta de destino."
      );
    }

    if (
      this.destinationAccountId &&
      this.accountId &&
      this.destinationAccountId.equals(this.accountId)
    ) {
      this.invalidate(
        "destinationAccountId",
        "La cuenta de origen y destino deben ser diferentes."
      );
    }

    if (this.categoryId || this.splits.length > 0) {
      this.invalidate(
        "categoryId",
        "Las transferencias no deben tener categorías."
      );
    }
  } else {
    if (this.destinationAccountId) {
      this.invalidate(
        "destinationAccountId",
        "Solo las transferencias pueden tener una cuenta de destino."
      );
    }

    if (this.exchange) {
      this.invalidate(
        "exchange",
        "La conversión de moneda solo aplica a transferencias."
      );
    }
  }

  // Validar conversión de moneda.
  if (this.exchange) {
    if (
      this.exchange.fromCurrency === this.exchange.toCurrency
    ) {
      this.invalidate(
        "exchange",
        "Las monedas de origen y destino deben ser diferentes."
      );
    }

    if (this.exchange.fromCurrency !== this.currency) {
      this.invalidate(
        "exchange.fromCurrency",
        "La moneda de origen debe coincidir con la moneda de la transacción."
      );
    }

    const rate = Number(this.exchange.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      this.invalidate(
        "exchange.rate",
        "La tasa de cambio debe ser mayor que cero."
      );
    }
  }
});

// Historial de transacciones.
transactionSchema.index({
  workspaceId: 1,
  date: -1,
});

// Filtrar por tipo y estado.
transactionSchema.index({
  workspaceId: 1,
  type: 1,
  status: 1,
});

// Consultar movimientos por categoría.
transactionSchema.index({
  workspaceId: 1,
  categoryId: 1,
  date: -1,
});

// Consultar movimientos por cuenta.
transactionSchema.index({
  workspaceId: 1,
  accountId: 1,
  date: -1,
});

// Consultar transferencias recibidas.
transactionSchema.index({
  workspaceId: 1,
  destinationAccountId: 1,
  date: -1,
});

// Evitar solicitudes duplicadas dentro del workspace.
transactionSchema.index(
  {
    workspaceId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);

export type Transaction = InferSchemaType<
  typeof transactionSchema
>;

export const TransactionModel =
  models.Transaction ??
  model("Transaction", transactionSchema);
