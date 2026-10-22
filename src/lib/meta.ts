import { decrypt } from './security';
import { getRuntimeConfig } from './runtime-config';

export type MetaConfig = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  appUrl: string;
};

/** Raised when the server cannot construct a safe Meta OAuth configuration. */
export class MetaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaConfigError';
  }
}

/**
 * Read and validate the values shared by the OAuth connect and callback routes.
 * Trimming here avoids a surprisingly common `.env` trailing-space failure and
 * returning one normalized URL keeps both OAuth requests byte-for-byte aligned.
 */
export async function getMetaConfig(): Promise<MetaConfig> {
  const runtime = await getRuntimeConfig();
  const appId = runtime.metaAppId?.trim() || '';
  const appSecret = runtime.metaAppSecret?.trim() || '';
  const graphVersion = runtime.metaGraphVersion?.trim() || '';
  const appUrlValue = runtime.appUrl?.trim() || '';
  const missing = [
    !appId && 'META_APP_ID',
    !appSecret && 'META_APP_SECRET',
    !graphVersion && 'META_GRAPH_VERSION',
    !appUrlValue && 'APP_URL',
  ].filter((name): name is string => Boolean(name));
  if (missing.length) throw new MetaConfigError(`Chưa cấu hình Meta App phía máy chủ: thiếu ${missing.join(', ')}`);
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new MetaConfigError('META_GRAPH_VERSION phải có dạng vN.N (ví dụ: v21.0)');
  }

  let appUrl: URL;
  try { appUrl = new URL(appUrlValue); }
  catch { throw new MetaConfigError('APP_URL phải là URL tuyệt đối hợp lệ (http hoặc https)'); }
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.search || appUrl.hash || (appUrl.pathname !== '' && appUrl.pathname !== '/')) {
    throw new MetaConfigError('APP_URL phải là URL gốc dùng http hoặc https, không kèm đường dẫn hay thông tin đăng nhập');
  }
  return { appId, appSecret, graphVersion, appUrl: appUrl.origin };
}

// Graph error codes that mean the Page token is invalid/expired or that the token is
// missing a permission the Page needs. Meta reshuffles these codes between Graph
// versions, so this list MUST be re-checked against the Meta Graph API error reference
// whenever META_GRAPH_VERSION is upgraded (see the environment variable).
export const TOKEN_PERMISSION_CODES = [10, 102, 190, 200, 201, 203, 463, 467];
// A token/permission failure disables the Page (AI off, connection ERROR) instead of
// being retried, so this predicate is deliberately conservative about its input codes.
export function isTokenOrPermissionError(code: number): boolean {
  return TOKEN_PERMISSION_CODES.includes(code);
}
type MetaGraphError = { code?: number; message?: string };
type MetaGraphResponse = {
  error?: MetaGraphError;
  id?: string;
  message_id?: string;
  data?: { id?: string; name?: string; category?: string; access_token?: string }[];
  paging?: { next?: string; cursors?: { after?: string } };
};
// Keep the raw Graph message for operators, bounded so an oversized payload cannot
// bloat the database. Empty or non-string messages fall back to the default text.
function metaErrorMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}
export function graphUrl(path: string, version = process.env.META_GRAPH_VERSION?.trim()) {
  if (!version || !/^v\d+\.\d+$/.test(version)) throw new Error('Cần cấu hình META_GRAPH_VERSION được hỗ trợ');
  return `https://graph.facebook.com/${version}/${path}`;
}
export class MetaError extends Error {
  constructor(public code: number, public retryable: boolean, public uncertain: boolean, message = 'Meta từ chối yêu cầu') { super(message); }
}
export async function metaGet(path: string, token: string, version?: string): Promise<MetaGraphResponse> {
  const response = await fetch(graphUrl(path, version), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const result = await response.json() as MetaGraphResponse;
  if (!response.ok || result.error) throw new MetaError(result.error?.code || response.status, response.status === 429, false, metaErrorMessage(result.error?.message));
  return result;
}
export async function sendMeta(page: { metaId: string; tokenEncrypted: string | null }, psid: string, text: string) {
  const runtime = await getRuntimeConfig();
  if (!runtime.metaSendEnabled || !page.tokenEncrypted) throw new MetaError(0, false, false, 'Chưa cho phép gửi Meta');
  let endpoint: string, token: string;
  try { endpoint = graphUrl(`${page.metaId}/messages`, runtime.metaGraphVersion); token = decrypt(page.tokenEncrypted); }
  catch { throw new MetaError(0, false, false, 'Cấu hình API hoặc khóa mã hóa không hợp lệ; chưa gửi request'); }
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text } }), signal: AbortSignal.timeout(15000) });
  } catch { throw new MetaError(0, false, true, 'Không rõ Meta đã nhận tin hay chưa; không tự gửi lại'); }
  const result = await response.json().catch(() => null) as MetaGraphResponse | null;
  if (!result) throw new MetaError(response.status, false, true);
  if (!response.ok || result.error) {
    const code = result.error?.code || response.status;
    throw new MetaError(code, response.status === 429 || [4, 17, 32, 613].includes(code), response.status >= 500, metaErrorMessage(result.error?.message));
  }
  if (!result.message_id) throw new MetaError(0, false, true);
  return result.message_id as string;
}
