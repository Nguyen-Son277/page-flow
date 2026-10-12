import { decrypt } from './security';
export function graphUrl(path: string) {
  const version = process.env.META_GRAPH_VERSION;
  if (!version || !/^v\d+\.\d+$/.test(version)) throw new Error('Cần cấu hình META_GRAPH_VERSION được hỗ trợ');
  return `https://graph.facebook.com/${version}/${path}`;
}
export class MetaError extends Error {
  constructor(public code: number, public retryable: boolean, public uncertain: boolean, message = 'Meta từ chối yêu cầu') { super(message); }
}
export async function metaGet(path: string, token: string) {
  const response = await fetch(graphUrl(path), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok || result.error) throw new MetaError(result.error?.code || response.status, response.status === 429, false);
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
  const result = await response.json().catch(() => null);
  if (!result) throw new MetaError(response.status, false, true);
  if (!response.ok || result.error) {
    const code = result.error?.code || response.status;
    throw new MetaError(code, response.status === 429 || [4, 17, 32, 613].includes(code), response.status >= 500);
  }
  if (!result.message_id) throw new MetaError(0, false, true);
  return result.message_id as string;
}
