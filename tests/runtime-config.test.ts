import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt, decrypt } from '../src/lib/security';
const store = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('../src/lib/db', () => ({ db: { appSetting: store } }));
import { getRuntimeConfig, invalidateRuntimeConfigCache, redactRuntimeConfig, saveRuntimeConfig } from '../src/lib/runtime-config';

const originalEnv = { ...process.env };
const emptyRow = () => ({
  id: 'singleton', metaAppId: null, metaGraphVersion: null,
  metaAppSecretEncrypted: null, metaVerifyTokenEncrypted: null,
  metaSendEnabled: false, aiChatBaseUrl: null, aiChatModel: null,
  aiChatApiKeyEncrypted: null, aiEmbeddingBaseUrl: null,
  aiEmbeddingModel: null, aiEmbeddingApiKeyEncrypted: null,
  aiEmbeddingDimensions: null, updatedAt: new Date(),
});

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
  process.env.META_APP_ID = 'env-app';
  process.env.META_APP_SECRET = 'env-secret';
  process.env.AI_API_KEY = 'env-ai-key';
  process.env.AI_BASE_URL = 'https://provider.test/v1';
  process.env.AI_CHAT_MODEL = 'chat-test';
  process.env.AI_EMBEDDING_DIMENSIONS = '1536';
  process.env.META_GRAPH_VERSION = 'v21.0';
  invalidateRuntimeConfigCache();
  vi.clearAllMocks();
});
afterEach(() => {
  process.env = { ...originalEnv };
  invalidateRuntimeConfigCache();
});

describe('runtime configuration', () => {
  it('uses environment fallback and caches a defensive snapshot', async () => {
    store.findUnique.mockResolvedValue(null);
    const config = await getRuntimeConfig();
    expect(config.metaAppId).toBe('env-app');
    expect(config.aiChatApiKey).toBe('env-ai-key');
    expect(config.aiEmbeddingBaseUrl).toBe('https://provider.test/v1');
    config.metaAppId = 'mutated';
    expect((await getRuntimeConfig()).metaAppId).toBe('env-app');
    expect(store.findUnique).toHaveBeenCalledTimes(1);
  });

  it('decrypts DB secrets and redacts them for external responses', async () => {
    store.findUnique.mockResolvedValue({ ...emptyRow(), metaAppId: 'db-app', metaAppSecretEncrypted: encrypt('db-secret') });
    const config = await getRuntimeConfig();
    expect(config.metaAppId).toBe('db-app');
    expect(config.metaAppSecret).toBe('db-secret');
    expect(JSON.stringify(redactRuntimeConfig(config))).not.toContain('db-secret');
    expect(redactRuntimeConfig(config).hasMetaAppSecret).toBe(true);
  });

  it('encrypts new secrets, preserves blank secrets, and invalidates the cached snapshot', async () => {
    store.findUnique.mockResolvedValue({ ...emptyRow(), metaAppSecretEncrypted: encrypt('existing') });
    store.upsert.mockImplementation(async ({ create, update }) => ({ ...emptyRow(), ...create, ...update }));
    await getRuntimeConfig();
    const saved = await saveRuntimeConfig({ metaAppSecret: '', aiChatApiKey: 'new-key', metaAppId: 'new-app' });
    const args = store.upsert.mock.calls[0][0];
    expect(args.update.metaAppSecretEncrypted).toBeUndefined();
    expect(args.update.aiChatApiKeyEncrypted).not.toBe('new-key');
    expect(decrypt(args.update.aiChatApiKeyEncrypted)).toBe('new-key');
    expect(saved.metaAppId).toBe('new-app');
    expect((await getRuntimeConfig()).metaAppId).toBe('new-app');
  });

  it('does not hide DB failures behind environment fallback', async () => {
    store.findUnique.mockRejectedValue(new Error('schema unavailable'));
    await expect(getRuntimeConfig()).rejects.toThrow('schema unavailable');
  });

  it('rejects invalid URLs and graph versions before saving', async () => {
    store.findUnique.mockResolvedValue(null);
    await expect(saveRuntimeConfig({ aiChatBaseUrl: 'file:///tmp/key' })).rejects.toThrow('http hoặc https');
    await expect(saveRuntimeConfig({ metaGraphVersion: '21' })).rejects.toThrow('vN.N');
    expect(store.upsert).not.toHaveBeenCalled();
  });
});
