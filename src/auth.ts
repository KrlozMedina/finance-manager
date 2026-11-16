
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb/connection";

import { UserModel } from "@/modules/users/user.model";
import { AuthAccountModel } from "@/modules/users/auth-account.model";
import { WorkspaceModel } from "@/modules/workspaces/workspace.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

/**
 * Garantiza que un usuario tenga un workspace personal
 * y una membresía activa con rol OWNER.
 *
 * Debe ejecutarse dentro de una transacción.
 */
async function ensurePersonalWorkspace(
  userId: mongoose.Types.ObjectId,
  userName: string,
  session: mongoose.ClientSession
) {
  let workspace = await WorkspaceModel.findOne({
    createdBy: userId,
    type: "personal",
  }).session(session);

  if (!workspace) {
    const [newWorkspace] = await WorkspaceModel.create(
      [
        {
          name: `Finanzas de ${userName}`,
          type: "personal",
          defaultCurrency: "COP",
          createdBy: userId,
        },
      ],
      { session }
    );

    workspace = newWorkspace;
  }

  const membership = await MembershipModel.findOne({
    workspaceId: workspace._id,
    userId,
  }).session(session);

  if (!membership) {
    await MembershipModel.create(
      [
        {
          workspaceId: workspace._id,
          userId,
          role: "OWNER",
          status: "active",
          joinedAt: new Date(),
        },
      ],
      { session }
    );
  } else if (
    membership.role !== "OWNER" ||
    membership.status !== "active"
  ) {
    throw new Error("INVALID_PERSONAL_WORKSPACE_MEMBERSHIP");
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
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          // Comprobar si la identidad de Google ya existe.
          const existingAccount = await AuthAccountModel.findOne({
            provider: "google",
            providerAccountId: account.providerAccountId,
          }).session(session);

          if (existingAccount) {
            const existingUser = await UserModel.findById(
              existingAccount.userId
            ).session(session);

            if (!existingUser || existingUser.status !== "active") {
              throw new Error("USER_NOT_ACTIVE");
            }

            // También provisiona usuarios creados anteriormente
            // que todavía no tengan workspace.
            await ensurePersonalWorkspace(
              existingUser._id,
              existingUser.name,
              session
            );

            return;
          }

          // No vincular automáticamente cuentas por coincidencia
          // de correo electrónico.
          const existingUser = await UserModel.findOne({
            email,
          }).session(session);

          if (existingUser) {
            throw new Error("EMAIL_ALREADY_REGISTERED");
          }

          // Crear usuario interno.
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

          // Vincular identidad de Google.
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

          // Crear workspace personal y membresía OWNER.
          await ensurePersonalWorkspace(
            newUser._id,
            newUser.name,
            session
          );
        });

        return true;
      } catch (error) {
        const mongoError = error as { code?: number };

        // Manejar una posible creación simultánea.
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
