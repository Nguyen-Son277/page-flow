import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getRuntimeConfig: vi.fn(),
  userFindMany: vi.fn(),
  outboundCount: vi.fn(),
  webhookFindMany: vi.fn(),
  pageFindMany: vi.fn(),
  auditFindMany: vi.fn(),
}));

vi.mock('../src/lib/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/auth')>();
  return { ...actual, requireAdmin: mocks.requireAdmin };
});
vi.mock('../src/lib/runtime-config', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/runtime-config')>();
  return { ...actual, getRuntimeConfig: mocks.getRuntimeConfig, saveRuntimeConfig: vi.fn() };
});
vi.mock('../src/lib/db', () => ({
  db: {
    user: { findMany: mocks.userFindMany },
    outboundJob: { count: mocks.outboundCount },
    webhookEvent: { findMany: mocks.webhookFindMany },
    page: { findMany: mocks.pageFindMany },
    auditLog: { findMany: mocks.auditFindMany },
  },
}));
vi.mock('../src/lib/reconciliation', () => ({
  dismissFailedSend: vi.fn(),
  listFailedSends: vi.fn().mockResolvedValue([]),
  retryFailedSend: vi.fn(),
}));
vi.mock('../src/lib/accounts', () => ({ createMember: vi.fn(), deleteMember: vi.fn(), resetMemberPassword: vi.fn() }));

import { GET } from '../src/app/api/settings/route';

const runtime = {
  appUrl: 'http://localhost:3000',
  metaAppId: '123',
  metaAppSecret: 'meta-secret-that-must-not-leak',
  metaVerifyToken: 'verify-secret-that-must-not-leak',
  metaGraphVersion: 'v21.0',
  metaSendEnabled: false,
  aiChatBaseUrl: 'https://llm.example/v1',
  aiChatModel: 'chat-model',
  aiChatApiKey: 'llm-secret-that-must-not-leak',
  aiEmbeddingBaseUrl: 'https://embed.example/v1',
  aiEmbeddingModel: 'embedding-model',
  aiEmbeddingApiKey: 'embedding-secret-that-must-not-leak',
  aiEmbeddingDimensions: 1536,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  mocks.userFindMany.mockResolvedValue([]);
  mocks.outboundCount.mockResolvedValue(0);
  mocks.webhookFindMany.mockResolvedValue([]);
  mocks.pageFindMany.mockResolvedValue([]);
  mocks.auditFindMany.mockResolvedValue([]);
});

describe('GET /api/settings server errors', () => {
  it('returns safe settings when AppSetting is absent and runtime falls back to environment', async () => {
    mocks.getRuntimeConfig.mockResolvedValue({ ...runtime, metaAppSecret: '', metaVerifyToken: '', aiChatApiKey: '', aiEmbeddingApiKey: '' });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.text();
    const parsed = JSON.parse(body);
    expect(parsed.metaAppId).toBe('123');
    expect(parsed.metaConfigured).toBe(false);
    expect(parsed.hasMetaAppSecret).toBe(false);
    expect(parsed.hasAiChatApiKey).toBe(false);
    expect(body).not.toContain('meta-secret-that-must-not-leak');
    expect(body).not.toContain('llm-secret-that-must-not-leak');
  });

  it('maps decrypt/configuration failures to a generic 500 without exposing details', async () => {
    mocks.getRuntimeConfig.mockRejectedValue(new Error('decrypt failed: meta-secret-that-must-not-leak'));

    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toBe(JSON.stringify({ error: 'Không thể xử lý yêu cầu. Kiểm tra cấu hình và dịch vụ.' }));
    expect(body).not.toContain('decrypt failed');
    expect(body).not.toContain('meta-secret-that-must-not-leak');
  });
});

// The DB layer is intentionally mocked: these tests target route-level error mapping
// and redaction, while runtime-config.test.ts covers AppSetting absence/decryption.
// Queue, audit and failed-send collections are initialized to empty results so the
// route reaches the response path without requiring PostgreSQL or Redis.

