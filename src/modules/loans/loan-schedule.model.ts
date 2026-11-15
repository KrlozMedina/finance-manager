
import mongoose, {
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
      validate: Number.isSafeInteger,
    },

    interestMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isSafeInteger,
    },

    otherChargesMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isSafeInteger,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
      ],
      default: "pending",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
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

// Evita cuotas duplicadas dentro del mismo préstamo.
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

// Consultas del calendario de vencimientos.
loanScheduleSchema.index({
  workspaceId: 1,
  dueDate: 1,
  status: 1,
});

// Consulta del cronograma de un préstamo.
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
  models.LoanSchedule ||
  model("LoanSchedule", loanScheduleSchema);

export default LoanScheduleModel;
