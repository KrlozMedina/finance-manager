
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb/connection";
import { UserModel } from "@/modules/users/user.model";
import { AuthAccountModel } from "@/modules/users/auth-account.model";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [Google],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async signIn({ user, account }) {
      if (
        account?.provider !== "google" ||
        !account.providerAccountId ||
        !user.email
      ) {
        return false;
      }

      await connectDB();

      const email = user.email.toLowerCase().trim();

      // Buscar una identidad de Google ya registrada.
      const existingAccount = await AuthAccountModel.findOne({
        provider: "google",
        providerAccountId: account.providerAccountId,
      });

      if (existingAccount) {
        const existingUser = await UserModel.findById(
          existingAccount.userId
        );

        return existingUser?.status === "active";
      }

      // No vincular automáticamente una cuenta existente
      // solamente porque coincida el correo.
      const existingUser = await UserModel.findOne({ email });

      if (existingUser) {
        return false;
      }

      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          // Segunda comprobación para reducir conflictos
          // si llegan dos inicios de sesión simultáneos.
          const accountExists = await AuthAccountModel.findOne({
            provider: "google",
            providerAccountId: account.providerAccountId,
          }).session(session);

          if (accountExists) {
            const linkedUser = await UserModel.findById(
              accountExists.userId
            ).session(session);

            if (linkedUser?.status !== "active") {
              throw new Error("USER_NOT_ACTIVE");
            }

            return;
          }

          const emailExists = await UserModel.findOne({
            email,
          }).session(session);

          if (emailExists) {
            throw new Error("EMAIL_ALREADY_REGISTERED");
          }

          const [newUser] = await UserModel.create(
            [
              {
                name: user.name?.trim() || email.split("@")[0],
                email,
                avatar: user.image ?? null,
                status: "active",
              },
            ],
            { session }
          );

          await AuthAccountModel.create(
            [
              {
                userId: newUser._id,
                provider: "google",
                providerAccountId: account.providerAccountId,
              },
            ],
            { session }
          );
        });

        return true;
      } catch (error) {
        // Si otra petición creó la identidad simultáneamente,
        // recuperar el vínculo que ya existe.
        const mongoError = error as { code?: number };

        if (mongoError.code === 11000) {
          const linkedAccount = await AuthAccountModel.findOne({
            provider: "google",
            providerAccountId: account.providerAccountId,
          });

          if (linkedAccount) {
            const linkedUser = await UserModel.findById(
              linkedAccount.userId
            );

            return linkedUser?.status === "active";
          }
        }

        throw error;
      } finally {
        await session.endSession();
      }
    },

    async jwt({ token, account }) {
      const jwtToken = token as typeof token & {
        userId?: string;
      };

      if (account?.provider === "google") {
        await connectDB();

        const linkedAccount = await AuthAccountModel.findOne({
          provider: "google",
          providerAccountId: account.providerAccountId,
        });

        if (linkedAccount) {
          jwtToken.userId = linkedAccount.userId.toString();
        }
      }

      return jwtToken;
    },

    async session({ session, token }) {
      const jwtToken = token as typeof token & {
        userId?: string;
      };

      if (jwtToken.userId) {
        session.user.id = jwtToken.userId;
      }

      return session;
    },
  },
});
