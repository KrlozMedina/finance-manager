
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
      validate: {
        validator: (value: number | null) =>
          value === null || Number.isSafeInteger(value),
        message: "El límite de crédito debe ser un entero seguro.",
      },
    },

    cutoffDay: {
      type: Number,
      min: 1,
      max: 31,
      default: null,
      validate: Number.isSafeInteger,
    },

    paymentDay: {
      type: Number,
      min: 1,
      max: 31,
      default: null,
      validate: Number.isSafeInteger,
    },
  },
  {
    _id: false,
  }
);

const accountSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
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
      min: 0,
      validate: {
        validator: (value: number) =>
          Number.isSafeInteger(value),
        message: "El saldo inicial debe ser un entero seguro.",
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
  }
);

// Consultar cuentas activas o archivadas.
accountSchema.index({
  workspaceId: 1,
  status: 1,
});

// Filtrar cuentas por tipo.
accountSchema.index({
  workspaceId: 1,
  type: 1,
});

// Consultar cuentas de un usuario creador.
accountSchema.index({
  workspaceId: 1,
  createdBy: 1,
});

export type Account = InferSchemaType<typeof accountSchema>;

export const AccountModel =
  models.Account ?? model("Account", accountSchema);
