
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
      required: true,
    },

    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    amountMinor: {
      type: Number,
      required: true,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value) && value !== 0,
        message: "Amount must be a non-zero safe integer",
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
  },
);

// Consultar movimientos de una cuenta por fecha.
ledgerEntrySchema.index({
  accountId: 1,
  effectiveAt: -1,
});

// Consultar todos los movimientos de una transacción.
ledgerEntrySchema.index({
  transactionId: 1,
});

// Consultar movimientos de una cuenta dentro de un workspace.
ledgerEntrySchema.index({
  workspaceId: 1,
  accountId: 1,
  effectiveAt: -1,
});

export type LedgerEntry = InferSchemaType<
  typeof ledgerEntrySchema
>;

export const LedgerEntryModel =
  models.LedgerEntry ??
  model("LedgerEntry", ledgerEntrySchema);
