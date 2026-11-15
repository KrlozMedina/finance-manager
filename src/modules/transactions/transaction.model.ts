
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
        message: "Split amount must be a safe integer",
      },
    },
  },
  {
    _id: false,
  },
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
        message: "Converted amount must be a safe integer",
      },
    },
  },
  {
    _id: false,
  },
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
        message: "Amount must be a safe integer",
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
  },
);

transactionSchema.index({
  workspaceId: 1,
  date: -1,
});

transactionSchema.index({
  workspaceId: 1,
  type: 1,
  status: 1,
});

transactionSchema.index({
  workspaceId: 1,
  categoryId: 1,
  date: -1,
});

export type Transaction = InferSchemaType<
  typeof transactionSchema
>;

export const TransactionModel =
  models.Transaction ??
  model("Transaction", transactionSchema);
