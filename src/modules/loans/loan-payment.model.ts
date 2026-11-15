
import {
  InferSchemaType,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const loanPaymentAllocationSchema = new Schema(
  {
    scheduleId: {
      type: Schema.Types.ObjectId,
      ref: "LoanSchedule",
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
  },
  {
    _id: false,
  }
);

const loanPaymentSchema = new Schema(
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

    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      unique: true,
    },

    allocations: {
      type: [loanPaymentAllocationSchema],
      required: true,
      validate: {
        validator: (allocations: unknown[]) =>
          Array.isArray(allocations) && allocations.length > 0,
        message: "El pago debe tener al menos una asignación.",
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
    collection: "loanPayments",
  }
);

loanPaymentSchema.pre("validate", function () {
  if (!this.allocations?.length) return;

  const scheduleIds = this.allocations.map((allocation) =>
    allocation.scheduleId.toString()
  );

  if (new Set(scheduleIds).size !== scheduleIds.length) {
    this.invalidate(
      "allocations",
      "No puedes asignar dos veces el mismo pago a una cuota."
    );
  }

  for (const allocation of this.allocations) {
    const total =
      allocation.principalMinor +
      allocation.interestMinor +
      allocation.otherChargesMinor;

    if (!Number.isSafeInteger(total) || total <= 0) {
      this.invalidate(
        "allocations",
        "Cada asignación debe tener un importe válido mayor que cero."
      );
      break;
    }
  }
});

loanPaymentSchema.index({
  workspaceId: 1,
  loanId: 1,
  paymentDate: -1,
});

loanPaymentSchema.index({
  workspaceId: 1,
  "allocations.scheduleId": 1,
});

export type LoanPaymentDocument = InferSchemaType<
  typeof loanPaymentSchema
>;

export type LoanPayment = LoanPaymentDocument & {
  _id: Types.ObjectId;
};

const LoanPaymentModel =
  models.LoanPayment ??
  model("LoanPayment", loanPaymentSchema);

export default LoanPaymentModel;
