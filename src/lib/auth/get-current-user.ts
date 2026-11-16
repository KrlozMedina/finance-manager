
import "server-only";

import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb/connection";
import { UserModel } from "@/modules/users/user.model";

export async function getCurrentUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  await connectDB();

  const user = await UserModel.findById(session.user.id)
    .select("_id name email avatar preferences status")
    .lean();

  if (!user || user.status !== "active") {
    return null;
  }

  return user;
}
