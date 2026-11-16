
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const userPreferencesSchema = new Schema(
  {
    locale: {
      type: String,
      default: "es-CO",
    },

    timezone: {
      type: String,
      default: "America/Bogota",
    },

    defaultCurrency: {
      type: String,
      uppercase: true,
      match: /^[A-Z]{3}$/,
      default: "COP",
    },

    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
  },
  {
    _id: false,
  }
);

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Introduce un correo electrónico válido.",
      ],
    },

    avatar: {
      type: String,
      default: null,
    },

    preferences: {
      type: userPreferencesSchema,
      default: () => ({}),
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "users",
  }
);

export type User = InferSchemaType<typeof userSchema>;

export const UserModel =
  models.User ?? model("User", userSchema);
