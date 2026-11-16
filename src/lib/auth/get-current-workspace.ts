
import "server-only";

import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb/connection";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { WorkspaceModel } from "@/modules/workspaces/workspace.model";
import { MembershipModel } from "@/modules/workspaces/membership.model";

export async function getCurrentWorkspace(workspaceId: string) {
  const user = await getCurrentUser();

  if (!user || !mongoose.isValidObjectId(workspaceId)) {
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
    workspace,
    membership,
    user,
  };
}
