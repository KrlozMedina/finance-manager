
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const workspaceSettingsSchema = new Schema(
  {
    timezone: {
      type: String,
      required: true,
      default: "America/Bogota",
    },

    allowMemberInvites: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const workspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    type: {
      type: String,
      enum: ["personal", "shared"],
      required: true,
      default: "personal",
    },

    defaultCurrency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
      default: "COP",
    },

    settings: {
      type: workspaceSettingsSchema,
      default: () => ({}),
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "workspaces",
  }
);

// Consultar workspaces creados por un usuario.
workspaceSchema.index({
  createdBy: 1,
});

// Garantizar un único workspace personal por usuario.
workspaceSchema.index(
  {
    createdBy: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: "personal",
    },
    name: "unique_personal_workspace_per_user",
  }
);

export type Workspace = InferSchemaType<
  typeof workspaceSchema
>;

export const WorkspaceModel =
  models.Workspace ??
  model("Workspace", workspaceSchema);
