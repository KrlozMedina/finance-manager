
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const categorySchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },

    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
    },

    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    icon: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "circle-dollar-sign",
    },

    color: {
      type: String,
      match: /^#[0-9A-Fa-f]{6}$/,
      default: "#64748b",
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      required: true,
      default: "active",
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
    collection: "categories",
  },
);

// Consultar categorías de un workspace.
categorySchema.index({
  workspaceId: 1,
  type: 1,
  status: 1,
});

// Consultar subcategorías.
categorySchema.index({
  workspaceId: 1,
  parentId: 1,
});

export type Category = InferSchemaType<
  typeof categorySchema
>;

export const CategoryModel =
  models.Category ??
  model("Category", categorySchema);
