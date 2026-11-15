
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
        validator: Number.isSafeInteger,
        message: "El capital inicial debe ser un entero seguro.",
      },
    },

    outstandingPrincipalMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "El capital pendiente debe ser un entero seguro.",
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
      required: true,
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
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "paid", "cancelled"],
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
  }
);

// El capital pendiente nunca puede superar el capital inicial.
loanSchema.pre("validate", function () {
  if (
    Number.isSafeInteger(this.principalMinor) &&
    Number.isSafeInteger(this.outstandingPrincipalMinor) &&
    this.outstandingPrincipalMinor > this.principalMinor
  ) {
    this.invalidate(
      "outstandingPrincipalMinor",
      "El capital pendiente no puede superar el capital inicial."
    );
  }

  if (
    this.dueDate &&
    this.dueDate < this.startDate
  ) {
    this.invalidate(
      "dueDate",
      "La fecha de vencimiento no puede ser anterior a la fecha de inicio."
    );
  }

  if (
    this.status === "paid" &&
    this.outstandingPrincipalMinor !== 0
  ) {
    this.invalidate(
      "status",
      "Un préstamo pagado debe tener capital pendiente igual a cero."
    );
  }
});

// Consultar préstamos por estado.
loanSchema.index({
  workspaceId: 1,
  status: 1,
});

// Consultar préstamos por tipo.
loanSchema.index({
  workspaceId: 1,
  type: 1,
});

// Consultar préstamos asociados a una cuenta.
loanSchema.index({
  workspaceId: 1,
  accountId: 1,
});

export type Loan = InferSchemaType<typeof loanSchema>;

export const LoanModel =
  models.Loan ?? model("Loan", loanSchema);
