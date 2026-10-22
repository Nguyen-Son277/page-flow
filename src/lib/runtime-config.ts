import { db } from './db';
import { decrypt, encrypt } from './security';

export type RuntimeConfig = {
  appUrl: string;
  metaAppId: string;
  metaAppSecret: string;
  metaVerifyToken: string;
  metaGraphVersion: string;
  metaSendEnabled: boolean;
  aiChatBaseUrl: string;
  aiChatModel: string;
  aiChatApiKey: string;
  aiEmbeddingBaseUrl: string;
  aiEmbeddingModel: string;
  aiEmbeddingApiKey: string;
  aiEmbeddingDimensions: number;
};

export type RuntimeConfigInput = Partial<RuntimeConfig>;

/** Safe, operator-facing configuration errors; crypto details are never exposed. */
export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

const CRYPTO_READ_ERROR = 'Không thể đọc cấu hình tích hợp đã mã hóa. Kiểm tra TOKEN_ENCRYPTION_KEY trên máy chủ.';
const CRYPTO_WRITE_ERROR = 'Không thể mã hóa cấu hình tích hợp. Kiểm tra TOKEN_ENCRYPTION_KEY trên máy chủ.';
const SINGLETON_ID = 'singleton';
const DEFAULT_AI_URL = 'https://api.openai.com/v1';
const DEFAULT_DIMENSIONS = 1536;
let cached: RuntimeConfig | undefined;
let cacheLoaded = false;
let cachedAt = 0;
const CACHE_TTL_MS = 2000;

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function decrypted(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decrypt(value);
  } catch {
    throw new RuntimeConfigError(CRYPTO_READ_ERROR);
  }
}

function validateUrl(value: string, field: string): string {
  if (!value) return '';
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${field} phải là URL hợp lệ`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${field} phải dùng http hoặc https`);
  return value.replace(/\/$/, '');
}

function validate(config: RuntimeConfig): RuntimeConfig {
  config.appUrl = validateUrl(config.appUrl, 'appUrl');
  config.aiChatBaseUrl = validateUrl(config.aiChatBaseUrl, 'aiChatBaseUrl');
  config.aiEmbeddingBaseUrl = validateUrl(config.aiEmbeddingBaseUrl, 'aiEmbeddingBaseUrl');
  if (config.metaGraphVersion && !/^v\d+\.\d+$/.test(config.metaGraphVersion)) throw new Error('metaGraphVersion phải có dạng vN.N');
  if (!Number.isInteger(config.aiEmbeddingDimensions) || config.aiEmbeddingDimensions <= 0) throw new Error('aiEmbeddingDimensions phải là số nguyên dương');
  return config;
}

function fromRow(row: {
  metaAppId: string | null;
  metaGraphVersion: string | null;
  metaAppSecretEncrypted: string | null;
  metaVerifyTokenEncrypted: string | null;
  metaSendEnabled: boolean;
  aiChatBaseUrl: string | null;
  aiChatModel: string | null;
  aiChatApiKeyEncrypted: string | null;
  aiEmbeddingBaseUrl: string | null;
  aiEmbeddingModel: string | null;
  aiEmbeddingApiKeyEncrypted: string | null;
  aiEmbeddingDimensions: string | null;
} | null): RuntimeConfig {
  return validate({
    appUrl: env('APP_URL', 'http://localhost:3000'),
    metaAppId: row?.metaAppId ?? env('META_APP_ID'),
    metaAppSecret: decrypted(row?.metaAppSecretEncrypted) || env('META_APP_SECRET'),
    metaVerifyToken: decrypted(row?.metaVerifyTokenEncrypted) || env('META_VERIFY_TOKEN'),
    metaGraphVersion: row?.metaGraphVersion ?? env('META_GRAPH_VERSION'),
    metaSendEnabled: row?.metaSendEnabled ?? process.env.META_SEND_ENABLED === 'true',
    aiChatBaseUrl: row?.aiChatBaseUrl ?? env('AI_BASE_URL', DEFAULT_AI_URL),
    aiChatModel: row?.aiChatModel ?? env('AI_CHAT_MODEL'),
    aiChatApiKey: decrypted(row?.aiChatApiKeyEncrypted) || env('AI_API_KEY'),
    aiEmbeddingBaseUrl: row?.aiEmbeddingBaseUrl ?? env('AI_EMBEDDING_BASE_URL', env('AI_BASE_URL', DEFAULT_AI_URL)),
    aiEmbeddingModel: row?.aiEmbeddingModel ?? env('AI_EMBEDDING_MODEL'),
    aiEmbeddingApiKey: decrypted(row?.aiEmbeddingApiKeyEncrypted) || env('AI_EMBEDDING_API_KEY', env('AI_API_KEY')),
    aiEmbeddingDimensions: row?.aiEmbeddingDimensions ? Number(row.aiEmbeddingDimensions) : Number(env('AI_EMBEDDING_DIMENSIONS', String(DEFAULT_DIMENSIONS))),
  });
}

/** Read the singleton configuration. DB/schema errors intentionally propagate. */
export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cacheLoaded && cached && Date.now() - cachedAt < CACHE_TTL_MS) return { ...cached };
  const row = await db.appSetting.findUnique({ where: { id: SINGLETON_ID } });
  const config = fromRow(row);
  cached = config;
  cacheLoaded = true;
  cachedAt = Date.now();
  return { ...config };
}

/** Save non-secret settings and encrypt non-blank secret values. Blank secrets preserve the stored value. */
export async function saveRuntimeConfig(input: RuntimeConfigInput): Promise<RuntimeConfig> {
  const current = await getRuntimeConfig();
  const next = validate({ ...current, ...input });
  const data: Record<string, unknown> = {
    metaAppId: next.metaAppId || null,
    metaGraphVersion: next.metaGraphVersion || null,
    metaSendEnabled: next.metaSendEnabled,
    aiChatBaseUrl: next.aiChatBaseUrl || null,
    aiChatModel: next.aiChatModel || null,
    aiEmbeddingBaseUrl: next.aiEmbeddingBaseUrl || null,
    aiEmbeddingModel: next.aiEmbeddingModel || null,
    aiEmbeddingDimensions: String(next.aiEmbeddingDimensions),
  };
  const secret = (name: keyof RuntimeConfig, column: string) => {
    const value = input[name];
    if (typeof value === 'string' && value.trim()) {
      try { data[column] = encrypt(value.trim()); }
      catch { throw new RuntimeConfigError(CRYPTO_WRITE_ERROR); }
    }
  };
  secret('metaAppSecret', 'metaAppSecretEncrypted');
  secret('metaVerifyToken', 'metaVerifyTokenEncrypted');
  secret('aiChatApiKey', 'aiChatApiKeyEncrypted');
  secret('aiEmbeddingApiKey', 'aiEmbeddingApiKeyEncrypted');
  const row = await db.appSetting.upsert({ where: { id: SINGLETON_ID }, create: { id: SINGLETON_ID, ...data }, update: data });
  cached = fromRow(row);
  cacheLoaded = true;
  cachedAt = Date.now();
  return { ...cached };
}

/** Clear the in-process snapshot after external changes or tests. */
export function invalidateRuntimeConfigCache() {
  cached = undefined;
  cacheLoaded = false;
  cachedAt = 0;
}

export function redactRuntimeConfig(config: RuntimeConfig) {
  return {
    ...config,
    metaAppSecret: undefined,
    metaVerifyToken: undefined,
    aiChatApiKey: undefined,
    aiEmbeddingApiKey: undefined,
    hasMetaAppSecret: Boolean(config.metaAppSecret),
    hasMetaVerifyToken: Boolean(config.metaVerifyToken),
    hasAiChatApiKey: Boolean(config.aiChatApiKey),
    hasAiEmbeddingApiKey: Boolean(config.aiEmbeddingApiKey),
  };
}
