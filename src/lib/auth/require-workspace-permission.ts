
import "server-only";

import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import {
  hasPermission,
  type Permission,
} from "@/lib/auth/permissions";

interface RequireWorkspacePermissionOptions {
  workspaceId: string;
  permission: Permission;
}

export async function requireWorkspacePermission({
  workspaceId,
  permission,
}: RequireWorkspacePermissionOptions) {
  const context = await getCurrentWorkspace(workspaceId);

  if (!context) {
    return {
      authorized: false as const,
      reason: "UNAUTHORIZED" as const,
    };
  }

  const allowed = hasPermission(
    context.membership.role,
    permission
  );

  if (!allowed) {
    return {
      authorized: false as const,
      reason: "FORBIDDEN" as const,
    };
  }

  return {
    authorized: true as const,
    ...context,
  };
}
