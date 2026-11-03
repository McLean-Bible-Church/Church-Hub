// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@church/nextjs-auth', () => ({ auth: vi.fn() }));
vi.mock('@church/database/neon', () => ({ checkAppPermission: vi.fn() }));

import { auth } from '@church/nextjs-auth';
import { checkAppPermission } from '@church/database/neon';
import { permissionAllows, requireApiAppAccess } from './apiAuth';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockCheck = checkAppPermission as unknown as ReturnType<typeof vi.fn>;

const DENIED = {
  hasAccess: false,
  canView: false,
  canEdit: false,
  canDelete: false,
  reason: 'denied',
};
const VIEW = { hasAccess: true, canView: true, canEdit: false, canDelete: false, reason: 'role' };
const EDIT = { hasAccess: true, canView: true, canEdit: true, canDelete: false, reason: 'role' };
const FULL = { hasAccess: true, canView: true, canEdit: true, canDelete: true, reason: 'admin' };

function session(overrides: Record<string, unknown> = {}) {
  return {
    userId: '123',
    contactId: '456',
    email: 'user@example.org',
    roles: ['Kids Volunteers'],
    isAdmin: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockAuth.mockReset();
  mockCheck.mockReset();
});

describe('permissionAllows', () => {
  it('maps levels to flags and denies by default', () => {
    expect(permissionAllows(VIEW as never, 'view')).toBe(true);
    expect(permissionAllows(VIEW as never, 'edit')).toBe(false);
    expect(permissionAllows(EDIT as never, 'edit')).toBe(true);
    expect(permissionAllows(EDIT as never, 'delete')).toBe(false);
    expect(permissionAllows(FULL as never, 'delete')).toBe(true);
    expect(permissionAllows(DENIED as never, 'view')).toBe(false);
    expect(permissionAllows(null, 'view')).toBe(false);
    expect(permissionAllows(undefined, 'view')).toBe(false);
    // hasAccess=false wins even if a flag is (inconsistently) true
    expect(permissionAllows({ ...VIEW, hasAccess: false } as never, 'view')).toBe(false);
    expect(permissionAllows(FULL as never, 'bogus' as never)).toBe(false);
  });
});

describe('requireApiAppAccess', () => {
  it('returns 401 with no session and never checks permissions', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await requireApiAppAccess('people-search', 'view');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('returns 401 when reading the session throws', async () => {
    mockAuth.mockRejectedValue(new Error('boom'));
    const r = await requireApiAppAccess('people-search');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it('returns 403 for a signed-in user with no grant (any MP login is not enough)', async () => {
    mockAuth.mockResolvedValue(session());
    mockCheck.mockResolvedValue(DENIED);
    const r = await requireApiAppAccess('people-search', 'view');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it('denies a user with no roles (no "TEMP WORKAROUND" fail-open)', async () => {
    mockAuth.mockResolvedValue(session({ roles: [], email: '' }));
    mockCheck.mockResolvedValue(DENIED);
    const r = await requireApiAppAccess('counter', 'view');
    expect(r.ok).toBe(false);
    expect(mockCheck).toHaveBeenCalledWith('counter', [], null, false);
  });

  it('grants view to a user whose role has view', async () => {
    mockAuth.mockResolvedValue(session());
    mockCheck.mockResolvedValue(VIEW);
    const r = await requireApiAppAccess('people-search', 'view');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe(123);
      expect(r.appKey).toBe('people-search');
    }
    expect(mockCheck).toHaveBeenCalledWith(
      'people-search',
      ['Kids Volunteers'],
      'user@example.org',
      false
    );
  });

  it('denies edit to a view-only user', async () => {
    mockAuth.mockResolvedValue(session());
    mockCheck.mockResolvedValue(VIEW);
    const r = await requireApiAppAccess('room-manager', 'edit');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it('denies delete to an edit-only user', async () => {
    mockAuth.mockResolvedValue(session());
    mockCheck.mockResolvedValue(EDIT);
    const r = await requireApiAppAccess('counter', 'delete');
    expect(r.ok).toBe(false);
  });

  it('grants admins (via checkAppPermission admin branch)', async () => {
    mockAuth.mockResolvedValue(session({ isAdmin: true, roles: [] }));
    mockCheck.mockResolvedValue(FULL);
    const r = await requireApiAppAccess('counter', 'delete');
    expect(r.ok).toBe(true);
    expect(mockCheck).toHaveBeenCalledWith('counter', [], 'user@example.org', true);
  });

  it('only treats isAdmin === true as admin', async () => {
    mockAuth.mockResolvedValue(session({ isAdmin: 'true' }));
    mockCheck.mockResolvedValue(DENIED);
    await requireApiAppAccess('counter');
    expect(mockCheck).toHaveBeenCalledWith('counter', expect.any(Array), expect.anything(), false);
  });

  it('requires a valid numeric userId for writes', async () => {
    mockCheck.mockResolvedValue(FULL);
    for (const userId of [undefined, '', 'abc', '12abc', '0', '-1']) {
      mockAuth.mockResolvedValue(session({ userId }));
      const r = await requireApiAppAccess('counter', 'edit');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    }
  });

  it('allows reads without a userId', async () => {
    mockAuth.mockResolvedValue(session({ userId: undefined }));
    mockCheck.mockResolvedValue(VIEW);
    const r = await requireApiAppAccess('counter', 'view');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBeNull();
  });

  it('fails closed (500) when the permission store errors', async () => {
    mockAuth.mockResolvedValue(session());
    mockCheck.mockRejectedValue(new Error('neon down'));
    const r = await requireApiAppAccess('people-search', 'view');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(500);
  });

  it('accepts any one of several app keys', async () => {
    mockAuth.mockResolvedValue(session());
    mockCheck.mockImplementation(async (key: string) => (key === 'room-manager' ? VIEW : DENIED));
    const r = await requireApiAppAccess(['counter', 'room-manager'], 'view');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.appKey).toBe('room-manager');
  });

  it('denies when none of several app keys grant access', async () => {
    mockAuth.mockResolvedValue(session());
    mockCheck.mockResolvedValue(DENIED);
    const r = await requireApiAppAccess(['counter', 'room-manager'], 'view');
    expect(r.ok).toBe(false);
    expect(mockCheck).toHaveBeenCalledTimes(2);
  });
});
