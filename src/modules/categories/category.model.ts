
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
  }
);

// Evitar que una categoría sea su propia categoría padre.
categorySchema.pre("validate", function () {
  if (
    this.parentId &&
    this._id &&
    this.parentId.equals(this._id)
  ) {
    this.invalidate(
      "parentId",
      "Una categoría no puede ser su propia categoría padre."
    );
  }
});

// Consultar categorías por tipo y estado.
categorySchema.index({
  workspaceId: 1,
  type: 1,
  status: 1,
  name: 1,
});

// Consultar subcategorías de una categoría.
categorySchema.index({
  workspaceId: 1,
  parentId: 1,
});

// Consultar categorías creadas por un usuario.
categorySchema.index({
  workspaceId: 1,
  createdBy: 1,
});

export type Category = InferSchemaType<
  typeof categorySchema
>;

export const CategoryModel =
  models.Category ??
  model("Category", categorySchema);
