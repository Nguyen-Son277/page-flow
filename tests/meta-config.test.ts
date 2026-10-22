import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ db: { appSetting: { findUnique: vi.fn().mockResolvedValue(null) } } }));

import { getMetaConfig, MetaConfigError } from '../src/lib/meta';
import { invalidateRuntimeConfigCache } from '../src/lib/runtime-config';

beforeEach(() => {
  invalidateRuntimeConfigCache();
});

// No persisted runtime settings: these cases verify the environment fallback.

const configKeys = ['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'APP_URL'] as const;
const original = Object.fromEntries(configKeys.map(key => [key, process.env[key]]));

afterEach(() => {
  for (const key of configKeys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Meta OAuth configuration', () => {
  it('trims values and normalizes the app origin', async () => {
    process.env.META_APP_ID = '  app-id ';
    process.env.META_APP_SECRET = ' app-secret ';
    process.env.META_GRAPH_VERSION = ' v21.0 ';
    process.env.APP_URL = ' https://example.test/ ';

    await expect(getMetaConfig()).resolves.toEqual({ appId: 'app-id', appSecret: 'app-secret', graphVersion: 'v21.0', appUrl: 'https://example.test' });
  });

  it('reports all missing required values', async () => {
    for (const key of configKeys) delete process.env[key];

    await expect(getMetaConfig()).rejects.toThrowError(new MetaConfigError('Chưa cấu hình Meta App phía máy chủ: thiếu META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION'));
  });

  it('rejects unsupported graph versions', async () => {
    process.env.META_APP_ID = 'app-id';
    process.env.META_APP_SECRET = 'app-secret';
    process.env.META_GRAPH_VERSION = '21.0';
    process.env.APP_URL = 'https://example.test';

    await expect(getMetaConfig()).rejects.toThrow('metaGraphVersion phải có dạng vN.N');
  });

  it('rejects app URLs with a path or non-web protocol', async () => {
    process.env.META_APP_ID = 'app-id';
    process.env.META_APP_SECRET = 'app-secret';
    process.env.META_GRAPH_VERSION = 'v21.0';
    process.env.APP_URL = 'https://example.test/page-flow';
    await expect(getMetaConfig()).rejects.toThrow('APP_URL phải là URL gốc');

    process.env.APP_URL = 'ftp://example.test';
    await expect(getMetaConfig()).rejects.toThrow('APP_URL phải là URL gốc');
  });
});
