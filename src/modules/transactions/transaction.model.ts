
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

  if (this.exchange) {
    if (
      this.exchange.fromCurrency ===
      this.exchange.toCurrency
    ) {
      this.invalidate(
        "exchange",
        "Las monedas de origen y destino deben ser diferentes."
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
