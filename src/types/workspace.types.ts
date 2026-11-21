
export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export type WorkspaceType = "personal" | "shared";

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  defaultCurrency: string;
  settings: {
    timezone: string;
    allowMemberInvites: boolean;
  };
  role: WorkspaceRole;
  joinedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}
