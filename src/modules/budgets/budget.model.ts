
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const budgetSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "Budget amount must be a safe integer",
      },
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
      default: "COP",
    },

    period: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true,
      default: "monthly",
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      default: null,
    },

    alertThresholds: {
      type: [
        {
          type: Number,
          min: 1,
          max: 100,
        },
      ],
      default: [80, 100],
      validate: {
        validator: (values: number[]) =>
          values.every(Number.isInteger) &&
          new Set(values).size === values.length,
        message: "Alert thresholds must be unique integers",
      },
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      required: true,
      default: "active",
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
    collection: "budgets",
  },
);

budgetSchema.index({
  workspaceId: 1,
  categoryId: 1,
  status: 1,
});

budgetSchema.index({
  workspaceId: 1,
  startDate: 1,
  endDate: 1,
});

export type Budget = InferSchemaType<
  typeof budgetSchema
>;

export const BudgetModel =
  models.Budget ??
  model("Budget", budgetSchema);
