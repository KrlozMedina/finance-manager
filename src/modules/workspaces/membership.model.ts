
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const membershipSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["OWNER", "ADMIN", "EDITOR", "VIEWER"],
      required: true,
      default: "VIEWER",
    },

    status: {
      type: String,
      enum: ["invited", "active", "suspended"],
      required: true,
      default: "invited",
    },

    joinedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "memberships",
  }
);

// Validar coherencia entre estado y fecha de ingreso.
membershipSchema.pre("validate", function () {
  if (this.status === "active" && !this.joinedAt) {
    this.invalidate(
      "joinedAt",
      "Una membresía activa debe tener fecha de ingreso."
    );
  }

  if (this.status === "invited" && this.joinedAt) {
    this.invalidate(
      "joinedAt",
      "Una invitación pendiente no debe tener fecha de ingreso."
    );
  }

  if (this.role === "OWNER" && this.status !== "active") {
    this.invalidate(
      "status",
      "El propietario debe tener una membresía activa."
    );
  }
});

// Un usuario solo puede tener una membresía por workspace.
membershipSchema.index(
  {
    workspaceId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

// Cada workspace puede tener como máximo un propietario.
membershipSchema.index(
  {
    workspaceId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      role: "OWNER",
    },
    name: "unique_workspace_owner",
  }
);

// Consultar miembros de un workspace por estado.
membershipSchema.index({
  workspaceId: 1,
  status: 1,
});

// Consultar workspaces de un usuario.
membershipSchema.index({
  userId: 1,
  status: 1,
});

export type Membership = InferSchemaType<
  typeof membershipSchema
>;

export const MembershipModel =
  models.Membership ??
  model("Membership", membershipSchema);
