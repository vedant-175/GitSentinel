/**
 * Role-Based Access Control (RBAC) Module - GitSentinel Phase 7
 * Server-side enforcement with granular permissions across roles.
 */

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  REVIEWER: 'REVIEWER',
  VIEWER: 'VIEWER',
} as const;

export type RoleType = (typeof Role)[keyof typeof Role];

export const Permission = {
  // Repository
  REPOSITORY_CONNECT: 'repository:connect',
  REPOSITORY_DISCONNECT: 'repository:disconnect',
  REPOSITORY_VIEW: 'repository:view',

  // Configuration & Organization Policies
  CONFIG_UPDATE: 'config:update',
  CONFIG_VIEW: 'config:view',
  POLICY_UPDATE: 'policy:update',
  POLICY_VIEW: 'policy:view',

  // Reviews
  REVIEW_TRIGGER: 'review:trigger',
  REVIEW_RERUN: 'review:rerun',
  REVIEW_RETRY: 'review:retry',
  REVIEW_VIEW: 'review:view',
  SARIF_EXPORT: 'sarif:export',

  // Issues & Feedback
  ISSUE_DISMISS: 'issue:dismiss',
  ISSUE_REOPEN: 'issue:reopen',
  ISSUE_FIX: 'issue:fix',
  ISSUE_VIEW: 'issue:view',
  FEEDBACK_SUBMIT: 'feedback:submit',

  // Audit Logs & Organization Management
  AUDIT_VIEW: 'audit:view',
  MEMBER_MANAGE: 'member:manage',
} as const;

export type PermissionType = (typeof Permission)[keyof typeof Permission];

export const ALL_ROLES: RoleType[] = [Role.OWNER, Role.ADMIN, Role.REVIEWER, Role.VIEWER];

export const ALL_PERMISSIONS: PermissionType[] = Object.values(Permission);

/**
 * Deterministic Permission Matrix:
 * - OWNER: Full control (all operations, repo disconnect, ownership/member management)
 * - ADMIN: Configuration, policies, audit logs, reviews, issues, member management (cannot disconnect repo)
 * - REVIEWER: Trigger/rerun reviews, dismiss/reopen/fix issues, view repositories, view reviews
 * - VIEWER: Read-only access to repositories, reviews, issues, and SARIF exports
 */
export const ROLE_PERMISSIONS: Record<RoleType, Set<PermissionType>> = {
  [Role.OWNER]: new Set([
    Permission.REPOSITORY_CONNECT,
    Permission.REPOSITORY_DISCONNECT,
    Permission.REPOSITORY_VIEW,
    Permission.CONFIG_UPDATE,
    Permission.CONFIG_VIEW,
    Permission.POLICY_UPDATE,
    Permission.POLICY_VIEW,
    Permission.REVIEW_TRIGGER,
    Permission.REVIEW_RERUN,
    Permission.REVIEW_RETRY,
    Permission.REVIEW_VIEW,
    Permission.SARIF_EXPORT,
    Permission.ISSUE_DISMISS,
    Permission.ISSUE_REOPEN,
    Permission.ISSUE_FIX,
    Permission.ISSUE_VIEW,
    Permission.FEEDBACK_SUBMIT,
    Permission.AUDIT_VIEW,
    Permission.MEMBER_MANAGE,
  ]),

  [Role.ADMIN]: new Set([
    Permission.REPOSITORY_CONNECT,
    Permission.REPOSITORY_VIEW,
    Permission.CONFIG_UPDATE,
    Permission.CONFIG_VIEW,
    Permission.POLICY_UPDATE,
    Permission.POLICY_VIEW,
    Permission.REVIEW_TRIGGER,
    Permission.REVIEW_RERUN,
    Permission.REVIEW_RETRY,
    Permission.REVIEW_VIEW,
    Permission.SARIF_EXPORT,
    Permission.ISSUE_DISMISS,
    Permission.ISSUE_REOPEN,
    Permission.ISSUE_FIX,
    Permission.ISSUE_VIEW,
    Permission.FEEDBACK_SUBMIT,
    Permission.AUDIT_VIEW,
    Permission.MEMBER_MANAGE,
  ]),

  [Role.REVIEWER]: new Set([
    Permission.REPOSITORY_VIEW,
    Permission.CONFIG_VIEW,
    Permission.POLICY_VIEW,
    Permission.REVIEW_TRIGGER,
    Permission.REVIEW_RERUN,
    Permission.REVIEW_RETRY,
    Permission.REVIEW_VIEW,
    Permission.SARIF_EXPORT,
    Permission.ISSUE_DISMISS,
    Permission.ISSUE_REOPEN,
    Permission.ISSUE_FIX,
    Permission.ISSUE_VIEW,
    Permission.FEEDBACK_SUBMIT,
  ]),

  [Role.VIEWER]: new Set([
    Permission.REPOSITORY_VIEW,
    Permission.CONFIG_VIEW,
    Permission.POLICY_VIEW,
    Permission.REVIEW_VIEW,
    Permission.SARIF_EXPORT,
    Permission.ISSUE_VIEW,
  ]),
};

/**
 * Checks whether a given role is granted a specific permission.
 */
export function hasPermission(role: string | null | undefined, permission: PermissionType): boolean {
  if (!role) return false;
  const normalizedRole = role.toUpperCase() as RoleType;
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  if (!permissions) return false;
  return permissions.has(permission);
}

export class RbacForbiddenError extends Error {
  public readonly requiredPermission: PermissionType;
  public readonly currentRole: string;

  constructor(permission: PermissionType, currentRole: string) {
    super(`Access Denied: Role "${currentRole}" lacks required permission "${permission}"`);
    this.name = 'RbacForbiddenError';
    this.requiredPermission = permission;
    this.currentRole = currentRole;
  }
}

/**
 * Asserts that a role has the specified permission, throwing RbacForbiddenError if denied.
 */
export function assertPermission(role: string | null | undefined, permission: PermissionType): void {
  const effectiveRole = (role || 'ANONYMOUS').toUpperCase();
  if (!hasPermission(effectiveRole, permission)) {
    throw new RbacForbiddenError(permission, effectiveRole);
  }
}

/**
 * Validates and normalizes role string to RoleType
 */
export function normalizeRole(roleStr: string | null | undefined): RoleType {
  if (!roleStr) return Role.VIEWER;
  const upper = roleStr.toUpperCase();
  if (upper in Role) {
    return upper as RoleType;
  }
  return Role.VIEWER;
}
