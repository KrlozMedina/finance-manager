
import mongoose, {
  InferSchemaType,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const loanPaymentSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
    },

    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      unique: true,
    },

    principalMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "El abono a capital debe ser un entero seguro.",
      },
    },

    interestMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Los intereses deben ser un entero seguro.",
      },
    },

    otherChargesMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Los otros cargos deben ser enteros seguros.",
      },
    },

    paymentDate: {
      type: Date,
      required: true,
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
  }
);

// Al menos uno de los conceptos debe tener un valor mayor que cero.
loanPaymentSchema.pre("validate", function () {
  const total =
    this.principalMinor +
    this.interestMinor +
    this.otherChargesMinor;

  if (total <= 0) {
    this.invalidate(
      "principalMinor",
      "El pago debe contener al menos un concepto mayor que cero."
    );
  }
});

// Índices para consultas e historial de pagos.
loanPaymentSchema.index({
  workspaceId: 1,
  loanId: 1,
  paymentDate: -1,
});

loanPaymentSchema.index({
  workspaceId: 1,
  createdBy: 1,
});

export type LoanPaymentDocument = InferSchemaType<
  typeof loanPaymentSchema
>;

export type LoanPayment = LoanPaymentDocument & {
  _id: Types.ObjectId;
};

const LoanPaymentModel =
  models.LoanPayment ||
  model("LoanPayment", loanPaymentSchema);

export default LoanPaymentModel;
