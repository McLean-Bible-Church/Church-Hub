// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getToken = vi.hoisted(() => vi.fn());
vi.mock('next-auth/jwt', () => ({ getToken }));
vi.mock('@church/database/central/services/tenant', () => ({
  getTenantBySlug: vi.fn(),
  getTenantByDomain: vi.fn(),
}));

import { middleware } from './middleware';

function req(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    headers: { host: 'localhost:3000' },
  });
}

beforeEach(() => getToken.mockReset());

describe('middleware API protection', () => {
  it('returns 401 JSON for API routes without a session token', async () => {
    getToken.mockResolvedValue(null);
    for (const path of [
      '/api/people-search/search?q=a',
      '/api/room-manager/update',
      '/api/counter/events?date=2026-11-03',
      '/api',
    ]) {
      const res = await middleware(req(path));
      expect(res.status).toBe(401);
    }
  });

  it('lets NextAuth endpoints through without a token', async () => {
    getToken.mockResolvedValue(null);
    const res = await middleware(req('/api/auth/session'));
    expect(res.status).toBe(200);
    expect(getToken).not.toHaveBeenCalled();
  });

  it('does not treat look-alike prefixes as public', async () => {
    getToken.mockResolvedValue(null);
    const res = await middleware(req('/api/authx/anything'));
    expect(res.status).toBe(401);
  });

  it('passes API requests with a token through to the route handler', async () => {
    getToken.mockResolvedValue({ sub: 'abc' });
    const res = await middleware(req('/api/people-search/search?q=a'));
    expect(res.status).toBe(200);
  });

  it('still redirects pages to /signin', async () => {
    getToken.mockResolvedValue(null);
    const res = await middleware(req('/people/search'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/signin');
  });
});
