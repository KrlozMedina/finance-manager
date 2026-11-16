
import {
  InferSchemaType,
  Schema,
  model,
  models,
} from "mongoose";

const authAccountSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      required: true,
      enum: ["google", "credentials"],
    },

    providerAccountId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "auth_accounts",
  }
);

// Una identidad de un proveedor solo puede pertenecer
// a un usuario interno.
authAccountSchema.index(
  {
    provider: 1,
    providerAccountId: 1,
  },
  {
    unique: true,
    name: "unique_provider_account",
  }
);

// Evita vincular dos veces la misma identidad
// del mismo proveedor al mismo usuario.
authAccountSchema.index(
  {
    userId: 1,
    provider: 1,
  },
  {
    unique: true,
    name: "unique_user_provider",
  }
);

export type AuthAccount = InferSchemaType<
  typeof authAccountSchema
>;

export const AuthAccountModel =
  models.AuthAccount ??
  model("AuthAccount", authAccountSchema);
