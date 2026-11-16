
export type MembershipRole =
  | "OWNER"
  | "ADMIN"
  | "EDITOR"
  | "VIEWER";

export type Permission =
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:transfer"
  | "members:read"
  | "members:invite"
  | "members:update"
  | "members:remove"
  | "accounts:read"
  | "accounts:create"
  | "accounts:update"
  | "accounts:archive"
  | "transactions:read"
  | "transactions:create"
  | "transactions:update"
  | "transactions:cancel"
  | "budgets:read"
  | "budgets:create"
  | "budgets:update"
  | "budgets:delete"
  | "loans:read"
  | "loans:create"
  | "loans:update";

const ROLE_PERMISSIONS = {
  OWNER: [
    "workspace:read",
    "workspace:update",
    "workspace:delete",
    "workspace:transfer",

    "members:read",
    "members:invite",
    "members:update",
    "members:remove",

    "accounts:read",
    "accounts:create",
    "accounts:update",
    "accounts:archive",

    "transactions:read",
    "transactions:create",
    "transactions:update",
    "transactions:cancel",

    "budgets:read",
    "budgets:create",
    "budgets:update",
    "budgets:delete",

    "loans:read",
    "loans:create",
    "loans:update",
  ],

  ADMIN: [
    "workspace:read",
    "workspace:update",

    "members:read",
    "members:invite",
    "members:update",
    "members:remove",

    "accounts:read",
    "accounts:create",
    "accounts:update",
    "accounts:archive",

    "transactions:read",
    "transactions:create",
    "transactions:update",
    "transactions:cancel",

    "budgets:read",
    "budgets:create",
    "budgets:update",
    "budgets:delete",

    "loans:read",
    "loans:create",
    "loans:update",
  ],

  EDITOR: [
    "workspace:read",
    "members:read",

    "accounts:read",
    "accounts:create",
    "accounts:update",

    "transactions:read",
    "transactions:create",
    "transactions:update",

    "budgets:read",
    "budgets:create",
    "budgets:update",

    "loans:read",
    "loans:create",
    "loans:update",
  ],

  VIEWER: [
    "workspace:read",
    "members:read",
    "accounts:read",
    "transactions:read",
    "budgets:read",
    "loans:read",
  ],
} as const satisfies Record<MembershipRole, readonly Permission[]>;

/**
 * Comprueba si un rol tiene un permiso determinado.
 */
export function hasPermission(
  role: MembershipRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role].includes(
    permission as never
  );
}

/**
 * Devuelve todos los permisos de un rol.
 */
export function getRolePermissions(
  role: MembershipRole
): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
