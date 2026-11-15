
import {
  InferSchemaType,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const loanScheduleSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
    },

    installmentNumber: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "El número de cuota debe ser un entero seguro.",
      },
    },

    dueDate: {
      type: Date,
      required: true,
    },

    principalMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "El capital debe ser un entero seguro.",
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
        message: "Los cargos deben ser enteros seguros.",
      },
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
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
    collection: "loanSchedules",
  }
);

// Una cuota debe tener al menos un importe programado.
loanScheduleSchema.pre("validate", function () {
  const total =
    this.principalMinor +
    this.interestMinor +
    this.otherChargesMinor;

  if (!Number.isSafeInteger(total) || total <= 0) {
    this.invalidate(
      "principalMinor",
      "La cuota debe tener un importe programado mayor que cero."
    );
  }
});

// Evita números de cuota duplicados dentro del préstamo.
loanScheduleSchema.index(
  {
    workspaceId: 1,
    loanId: 1,
    installmentNumber: 1,
  },
  {
    unique: true,
  }
);

// Consultar vencimientos de un workspace.
loanScheduleSchema.index({
  workspaceId: 1,
  dueDate: 1,
});

// Consultar cronograma de un préstamo.
loanScheduleSchema.index({
  loanId: 1,
  dueDate: 1,
});

export type LoanScheduleDocument = InferSchemaType<
  typeof loanScheduleSchema
>;

export type LoanSchedule = LoanScheduleDocument & {
  _id: Types.ObjectId;
};

const LoanScheduleModel =
  models.LoanSchedule ??
  model("LoanSchedule", loanScheduleSchema);

export default LoanScheduleModel;
