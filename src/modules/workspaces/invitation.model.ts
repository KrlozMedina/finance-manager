
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const invitationSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    role: {
      type: String,
      enum: ["ADMIN", "EDITOR", "VIEWER"],
      required: true,
      default: "VIEWER",
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "expired"],
      required: true,
      default: "pending",
    },

    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "invitations",
  }
);

// Evitar invitaciones pendientes duplicadas
// para el mismo correo dentro del workspace.
invitationSchema.index(
  {
    workspaceId: 1,
    email: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "pending",
    },
    name: "unique_pending_workspace_invitation",
  }
);

// Consultar invitaciones de un workspace.
invitationSchema.index({
  workspaceId: 1,
  status: 1,
  createdAt: -1,
});

// Consultar invitaciones por correo.
invitationSchema.index({
  email: 1,
  status: 1,
});

// Consultar invitaciones pendientes por expiración.
invitationSchema.index({
  expiresAt: 1,
  status: 1,
});

export type Invitation = InferSchemaType<
  typeof invitationSchema
>;

export const InvitationModel =
  models.Invitation ??
  model("Invitation", invitationSchema);
