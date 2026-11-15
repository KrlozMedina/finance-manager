
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
  },
);

// Un usuario solo puede tener una membresía por workspace.
membershipSchema.index(
  { workspaceId: 1, userId: 1 },
  { unique: true },
);

// Consultas de miembros activos de un workspace.
membershipSchema.index({
  workspaceId: 1,
  status: 1,
});

// Consultar los workspaces de un usuario.
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
