import { NextResponse } from 'next/server';
import { auth, type Session } from '@church/nextjs-auth';
import { checkAppPermission, type PermissionResult } from '@church/database/neon';

/**
 * Server-side authorization for API route handlers.
 *
 * Every MinistryPlatform call made by these routes runs under the full-access
 * client-credentials token, so the user's own MP rights are NOT applied. The app
 * permission model (Neon `app_permissions`: role / email → canView / canEdit /
 * canDelete, admins get everything) is the only thing standing between a signed-in
 * user and church-wide data. Every handler that touches MP data must call
 * `requireApiAppAccess` first. Deny by default: no session, no matching grant, an
 * unknown/inactive app, or a failed permission lookup all result in a denial.
 */

/** App keys as registered in the Neon `applications` table. */
export type ApiAppKey = 'counter' | 'room-manager' | 'people-search';

export type AccessLevel = 'view' | 'edit' | 'delete';

export type ApiAccessGranted = {
  ok: true;
  session: Session;
  permission: PermissionResult;
  appKey: ApiAppKey;
  /** MP User_ID for `$userId` audit logging; always a positive integer for edit/delete. */
  userId: number | null;
};

export type ApiAccessDenied = {
  ok: false;
  response: NextResponse;
};

export type ApiAccessResult = ApiAccessGranted | ApiAccessDenied;

/** Pure check: does a permission result satisfy the required level? */
export function permissionAllows(
  permission: PermissionResult | null | undefined,
  level: AccessLevel
): boolean {
  if (!permission || permission.hasAccess !== true) return false;
  switch (level) {
    case 'view':
      return permission.canView === true;
    case 'edit':
      return permission.canEdit === true;
    case 'delete':
      return permission.canDelete === true;
    default:
      return false;
  }
}

function parseUserId(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const str = String(value).trim();
  if (!/^\d{1,10}$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function deny(status: 401 | 403 | 500, error: string): ApiAccessDenied {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * Require the signed-in user to hold `level` access on at least one of `appKeys`.
 *
 * @example
 * ```ts
 * const access = await requireApiAppAccess('people-search', 'view');
 * if (!access.ok) return access.response;
 * ```
 */
export async function requireApiAppAccess(
  appKeys: ApiAppKey | readonly ApiAppKey[],
  level: AccessLevel = 'view'
): Promise<ApiAccessResult> {
  let session: Session | null;
  try {
    session = await auth();
  } catch (error) {
    console.error('Authorization: failed to read session:', error);
    return deny(401, 'Unauthorized');
  }

  if (!session) {
    return deny(401, 'Unauthorized');
  }

  const userId = parseUserId(session.userId);

  // Writes are audited against $userId in MP; refuse them without a valid one.
  if (level !== 'view' && userId === null) {
    return deny(401, 'Unauthorized');
  }

  const keys: readonly ApiAppKey[] = Array.isArray(appKeys) ? appKeys : [appKeys as ApiAppKey];
  const roles = Array.isArray(session.roles)
    ? session.roles.filter((r): r is string => typeof r === 'string')
    : [];
  const email = typeof session.email === 'string' && session.email ? session.email : null;
  const isAdmin = session.isAdmin === true;

  for (const appKey of keys) {
    let permission: PermissionResult;
    try {
      permission = await checkAppPermission(appKey, roles, email, isAdmin);
    } catch (error) {
      // Fail closed: never grant access because the permission store is unavailable.
      console.error(`Authorization: permission check failed for ${appKey}:`, error);
      return deny(500, 'Permission check failed');
    }

    if (permissionAllows(permission, level)) {
      return { ok: true, session, permission, appKey, userId };
    }
  }

  return deny(403, 'Forbidden');
}
