import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requirePage, errorResponse, audit, HttpError } from '@/lib/auth';
import { lockPage } from '@/lib/locking';
import { notify } from '@/lib/queue';
import { graphUrl } from '@/lib/meta';
import { decrypt } from '@/lib/security';
// Shown when the local disconnect succeeded but the Meta webhook is still registered.
const WEBHOOK_WARNING = 'Đã ngắt kết nối cục bộ nhưng chưa huỷ được đăng ký webhook ở Meta; kiểm tra lại trong Meta App.';
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), id: z.string(), aiEnabled: z.boolean().optional(), tone: z.string().max(1000).optional() }),
  z.object({ action: z.literal('disconnect'), id: z.string() }),
]);
/**
 * Best-effort unsubscribe from Meta before the Page token is deleted from the database.
 * Returns a short warning when it failed; a decryption error counts as a failure too so
 * the disconnect itself is never blocked by a broken token.
 */
async function unsubscribeWebhook(metaId: string, tokenEncrypted: string | null): Promise<string | null> {
  if (!tokenEncrypted) return null;
  try {
    const response = await fetch(graphUrl(`${metaId}/subscribed_apps`), { method: 'DELETE', headers: { Authorization: `Bearer ${decrypt(tokenEncrypted)}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Meta trả về ${response.status}`);
    return null;
  } catch {
    return WEBHOOK_WARNING;
  }
}
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const b = bodySchema.parse(await req.json());
    const page = await requirePage(b.id, user);
    if (b.action === 'disconnect') {
      if (page.demo) throw new HttpError(400, 'Page demo không có kết nối để ngắt');
      const lastError = await unsubscribeWebhook(page.metaId, page.tokenEncrypted);
      await db.$transaction(async tx => {
        await lockPage(tx, b.id);
        await tx.page.update({ where: { id: b.id }, data: { connection: 'DISCONNECTED', aiEnabled: false, tokenEncrypted: null, tokenCheckedAt: null, lastError } });
        await tx.conversation.updateMany({ where: { pageId: b.id, status: 'AI_ACTIVE' }, data: { version: { increment: 1 } } });
      }, { maxWait: 30000, timeout: 30000 });
      await audit(user.id, 'page.disconnect', b.id); await notify(b.id).catch(() => {});
      return Response.json({ ok: true });
    }
    if (b.aiEnabled && !page.demo && (!process.env.AI_API_KEY || process.env.META_SEND_ENABLED !== 'true' || page.connection !== 'CONNECTED')) throw new HttpError(400, 'Cần kết nối Meta, cấu hình AI và bật gửi trước khi bật tự động');
    if (b.aiEnabled && !await db.knowledgeSource.count({ where: { pageId: b.id, publishedAt: { not: null } } })) throw new HttpError(400, 'Cần xuất bản ít nhất một nguồn kiến thức');
    await db.$transaction(async tx => {
      await lockPage(tx, b.id);
      await tx.page.update({ where: { id: b.id }, data: { aiEnabled: b.aiEnabled, tone: b.tone, knowledgeRevision: { increment: 1 } } });
      await tx.conversation.updateMany({ where: { pageId: b.id, status: 'AI_ACTIVE' }, data: { version: { increment: 1 } } });
    }, { maxWait: 30000, timeout: 30000 });
    await audit(user.id, 'page.update', b.id); await notify(b.id).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
