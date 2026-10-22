import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// The route only needs an authenticated admin and the OAuth-state write. Mocking
// those dependencies keeps these configuration/redirect tests independent of a
// running database while still exercising the route's real error handling.
vi.mock('../src/lib/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/auth')>();
  return { ...actual, requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-test-id', role: 'ADMIN' }) };
});
vi.mock('../src/lib/db', () => ({
  db: {
    appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    oAuthState: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { db } from '../src/lib/db';
import { invalidateRuntimeConfigCache } from '../src/lib/runtime-config';
import { GET } from '../src/app/api/meta/connect/route';

const configKeys = ['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'APP_URL'] as const;
const originalEnv = Object.fromEntries(configKeys.map(key => [key, process.env[key]]));

describe('/api/meta/connect', () => {
  beforeEach(() => {
    invalidateRuntimeConfigCache();
    for (const key of configKeys) delete process.env[key];
    vi.mocked(db.oAuthState.create).mockClear();
  });

  afterAll(() => {
    for (const key of configKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns a client error naming every missing Meta setting', async () => {
    const response = await GET(new Request('http://localhost:3000/api/meta/connect'));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('META_APP_ID');
    expect(body.error).toContain('META_APP_SECRET');
    expect(body.error).toContain('META_GRAPH_VERSION');
    expect(db.oAuthState.create).not.toHaveBeenCalled();
  });

  it('redirects to Meta OAuth with the normalized callback and persisted state', async () => {
    process.env.META_APP_ID = ' app-id ';
    process.env.META_APP_SECRET = ' app-secret ';
    process.env.META_GRAPH_VERSION = ' v21.0 ';
    process.env.APP_URL = ' https://app.example.test/ ';

    const response = await GET(new Request('http://localhost:3000/api/meta/connect'));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('https://www.facebook.com');
    expect(location.pathname).toBe('/v21.0/dialog/oauth');
    expect(location.searchParams.get('client_id')).toBe('app-id');
    expect(location.searchParams.get('redirect_uri')).toBe('https://app.example.test/api/meta/callback');
    expect(location.searchParams.get('scope')).toBe('pages_show_list,pages_messaging,pages_manage_metadata');
    expect(location.searchParams.get('response_type')).toBe('code');

    const state = location.searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(db.oAuthState.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.oAuthState.create).mock.calls[0][0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({ id: state, userId: 'admin-test-id' }),
    }));
  });
});

// Assumptions: route authentication succeeds for an admin (mocked above),
// OAuth-state persistence succeeds, and Response.redirect uses its 302 default status.
// The tests intentionally verify the externally visible redirect/query contract,
// not Meta's network behavior or Prisma's implementation.
