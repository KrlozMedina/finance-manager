
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const loanSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    type: {
      type: String,
      enum: ["payable", "receivable"],
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    counterparty: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    principalMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "Principal must be a safe integer",
      },
    },

    outstandingPrincipalMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "Outstanding principal must be a safe integer",
      },
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    interestRate: {
      type: String,
      default: "0",
      match: /^\d+(\.\d+)?$/,
    },

    startDate: {
      type: Date,
      required: true,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "paid", "overdue", "cancelled"],
      default: "active",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
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
    collection: "loans",
  },
);

loanSchema.index({
  workspaceId: 1,
  status: 1,
});

loanSchema.index({
  workspaceId: 1,
  type: 1,
});

export type Loan = InferSchemaType<typeof loanSchema>;

export const LoanModel =
  models.Loan ?? model("Loan", loanSchema);
