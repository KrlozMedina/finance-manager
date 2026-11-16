
import "server-only";

import { cookies } from "next/headers";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb/connection";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { WorkspaceModel } from "@/modules/workspaces/workspace.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";

const ACTIVE_WORKSPACE_COOKIE = "fm_active_workspace";

export async function getActiveWorkspace() {
  // 1. Obtener usuario autenticado.
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  // 2. Leer workspace seleccionado.
  const cookieStore = await cookies();

  const workspaceId = cookieStore.get(
    ACTIVE_WORKSPACE_COOKIE
  )?.value;

  if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) {
    return null;
  }

  await connectDB();

  // 3. Comprobar membresía activa.
  const membership = await MembershipModel.findOne({
    workspaceId,
    userId: user._id,
    status: "active",
  }).lean();

  if (!membership) {
    return null;
  }

  // 4. Obtener workspace.
  const workspace = await WorkspaceModel.findById(
    workspaceId
  ).lean();

  if (!workspace) {
    return null;
  }

  // 5. Devolver contexto completo.
  return {
    user,
    workspace,
    membership,
    role: membership.role,
  };
}
