
import "server-only";

import { cookies } from "next/headers";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb/connection";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { WorkspaceModel } from "@/modules/workspaces/workspace.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";

const ACTIVE_WORKSPACE_COOKIE = "fm_active_workspace";

export async function getActiveWorkspace() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const cookieStore = await cookies();

  const workspaceId = cookieStore.get(
    ACTIVE_WORKSPACE_COOKIE
  )?.value;

  if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) {
    return null;
  }

  await connectDB();

  const membership = await MembershipModel.findOne({
    workspaceId,
    userId: user._id,
    status: "active",
  }).lean();

  if (!membership) {
    return null;
  }

  const workspace = await WorkspaceModel.findOne({
    _id: workspaceId,
    deletedAt: null,
  }).lean();

  if (!workspace) {
    return null;
  }

  return {
    user,
    workspace,
    membership,
    role: membership.role,
  };
}
