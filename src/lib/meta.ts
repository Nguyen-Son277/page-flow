import { decrypt } from './security';
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
export function graphUrl(path: string) {
  const version = process.env.META_GRAPH_VERSION;
  if (!version || !/^v\d+\.\d+$/.test(version)) throw new Error('Cần cấu hình META_GRAPH_VERSION được hỗ trợ');
  return `https://graph.facebook.com/${version}/${path}`;
}
export class MetaError extends Error {
  constructor(public code: number, public retryable: boolean, public uncertain: boolean, message = 'Meta từ chối yêu cầu') { super(message); }
}
export async function metaGet(path: string, token: string): Promise<MetaGraphResponse> {
  const response = await fetch(graphUrl(path), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const result = await response.json() as MetaGraphResponse;
  if (!response.ok || result.error) throw new MetaError(result.error?.code || response.status, response.status === 429, false, metaErrorMessage(result.error?.message));
  return result;
}
export async function sendMeta(page: { metaId: string; tokenEncrypted: string | null }, psid: string, text: string) {
  if (process.env.META_SEND_ENABLED !== 'true' || !page.tokenEncrypted) throw new MetaError(0, false, false, 'Chưa cho phép gửi Meta');
  let endpoint: string, token: string;
  try { endpoint = graphUrl(`${page.metaId}/messages`); token = decrypt(page.tokenEncrypted); }
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
