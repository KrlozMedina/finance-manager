
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const accountDetailsSchema = new Schema(
  {
    last4: {
      type: String,
      match: /^\d{4}$/,
      default: null,
    },

    creditLimitMinor: {
      type: Number,
      min: 0,
      default: null,
    },

    cutoffDay: {
      type: Number,
      min: 1,
      max: 31,
      default: null,
    },

    paymentDay: {
      type: Number,
      min: 1,
      max: 31,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const accountSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    institution: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    type: {
      type: String,
      enum: [
        "bank",
        "savings",
        "cash",
        "digital_wallet",
        "credit_card",
        "loan_liability",
        "loan_receivable",
      ],
      required: true,
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
      default: "COP",
    },

    initialBalanceMinor: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "Initial balance must be a safe integer",
      },
    },

    openingDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    visibility: {
      type: String,
      enum: ["private", "shared"],
      required: true,
      default: "shared",
    },

    details: {
      type: accountDetailsSchema,
      default: () => ({}),
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
    collection: "accounts",
  },
);

accountSchema.index({
  workspaceId: 1,
  status: 1,
});

accountSchema.index({
  workspaceId: 1,
  type: 1,
});

export type Account = InferSchemaType<
  typeof accountSchema
>;

export const AccountModel =
  models.Account ??
  model("Account", accountSchema);
