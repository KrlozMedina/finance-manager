
import {
  InferSchemaType,
  Schema,
  model,
  models,
  Types,
} from "mongoose";

const workspaceSettingsSchema = new Schema(
  {
    timezone: {
      type: String,
      default: "America/Bogota",
    },

    allowMemberInvites: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  },
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
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "workspaces",
  },
);

workspaceSchema.index({ createdBy: 1 });
workspaceSchema.index({ type: 1 });

export type Workspace = InferSchemaType<
  typeof workspaceSchema
>;

export const WorkspaceModel =
  models.Workspace ??
  model("Workspace", workspaceSchema);
