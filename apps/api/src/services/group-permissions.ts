import type { GroupRole } from './groups';

export interface GroupPermissions {
  canAddExpenses: boolean;
  canEditOwnExpenses: boolean;
  canEditAllExpenses: boolean;
  canDeleteExpenses: boolean;
  canApproveExpenses: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canViewReports: boolean;
  canExportData: boolean;
  canManageSettings: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<GroupRole, GroupPermissions> = {
  owner: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: true,
  },
  admin: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: false,
  },
  member: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
  viewer: {
    canAddExpenses: false,
    canEditOwnExpenses: false,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
};

function isGroupRole(value: unknown): value is GroupRole {
  return typeof value === 'string' && Object.hasOwn(DEFAULT_ROLE_PERMISSIONS, value);
}

/**
 * Permissions of a `groupMembers` document. Older documents have no
 * `permissions` map (or a partial one), so anything missing comes from the
 * member's role; an unknown role gets the viewer defaults.
 */
export function resolveMemberPermissions(
  member: Record<string, unknown> | undefined,
): GroupPermissions {
  const defaults = isGroupRole(member?.role)
    ? DEFAULT_ROLE_PERMISSIONS[member.role]
    : DEFAULT_ROLE_PERMISSIONS.viewer;
  const stored = member?.permissions;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { ...defaults };
  }
  const resolved = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof GroupPermissions>) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === 'boolean') resolved[key] = value;
  }
  return resolved;
}
