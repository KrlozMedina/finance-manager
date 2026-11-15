
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const recurringRuleSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    type: {
      type: String,
      enum: ["income", "expense", "transfer"],
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
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

    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    destinationAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "yearly"],
      required: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      default: null,
    },

    nextExecution: {
      type: Date,
      required: true,
    },

    timezone: {
      type: String,
      required: true,
      default: "America/Bogota",
    },

    requiresConfirmation: {
      type: Boolean,
      default: true,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "paused", "completed", "cancelled"],
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
    collection: "recurringRules",
  },
);

recurringRuleSchema.index({
  workspaceId: 1,
  nextExecution: 1,
  status: 1,
});

recurringRuleSchema.index({
  workspaceId: 1,
  createdBy: 1,
});

export type RecurringRule = InferSchemaType<
  typeof recurringRuleSchema
>;

export const RecurringRuleModel =
  models.RecurringRule ??
  model("RecurringRule", recurringRuleSchema);
