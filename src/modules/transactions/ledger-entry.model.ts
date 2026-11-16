
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const ledgerEntrySchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },

    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    type: {
      type: String,
      enum: ["opening", "transaction", "adjustment", "reversal"],
      required: true,
    },

    amountMinor: {
      type: Number,
      required: true,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value) && value !== 0,
        message: "El importe debe ser un entero seguro distinto de cero.",
      },
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    effectiveAt: {
      type: Date,
      required: true,
    },

    reversalOf: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
      default: null,
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
    collection: "ledgerEntries",
  }
);

// Validaciones de coherencia según el tipo de entrada.
ledgerEntrySchema.pre("validate", function () {
  if (this.type === "opening") {
    if (this.transactionId || this.reversalOf) {
      this.invalidate(
        "type",
        "Una entrada de apertura no puede tener transacción ni reverso."
      );
    }
  }

  if (
    ["transaction", "adjustment"].includes(this.type) &&
    (!this.transactionId || this.reversalOf)
  ) {
    this.invalidate(
      "transactionId",
      "Esta entrada requiere una transacción y no puede ser un reverso."
    );
  }

  if (this.type === "reversal") {
    if (!this.transactionId || !this.reversalOf) {
      this.invalidate(
        "reversalOf",
        "Un reverso requiere una transacción y una entrada original."
      );
    }
  }
});

// Historial de movimientos por cuenta.
ledgerEntrySchema.index({
  accountId: 1,
  effectiveAt: -1,
});

// Una transacción solo puede generar un movimiento contable original.
ledgerEntrySchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "transaction",
    },
  }
);

// Movimientos por workspace, cuenta y fecha.
ledgerEntrySchema.index({
  workspaceId: 1,
  accountId: 1,
  effectiveAt: -1,
});

// Una cuenta solo puede tener una entrada de apertura.
ledgerEntrySchema.index(
  { accountId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "opening",
    },
  }
);

// Una entrada original solo puede tener un reverso completo.
ledgerEntrySchema.index(
  { reversalOf: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "reversal",
    },
  }
);

export type LedgerEntry = InferSchemaType<
  typeof ledgerEntrySchema
>;

export const LedgerEntryModel =
  models.LedgerEntry ??
  model("LedgerEntry", ledgerEntrySchema);
