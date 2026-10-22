import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, HttpError, errorResponse, audit } from '@/lib/auth';
import { encrypt, decrypt } from '@/lib/security';
import { lockPage } from '@/lib/locking';
import { graphUrl } from '@/lib/meta';
import { getRuntimeConfig } from '@/lib/runtime-config';
type Candidate = { id: string; name: string; category: string; access_token: string };
export async function GET() {
  try {
    const user = await requireAdmin();
    const selection = await db.metaSelection.findFirst({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'desc' } });
    if (!selection) return Response.json({ pages: [], selectionId: null });
    const pages = JSON.parse(decrypt(selection.pagesEncrypted)) as Candidate[];
    return Response.json({ selectionId: selection.id, pages: pages.map(({ id, name, category }) => ({ id, name, category })) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const runtime = await getRuntimeConfig();
    const b = z.object({ selectionId: z.string(), pageIds: z.array(z.string()).min(1).max(2000) }).parse(await req.json());
    const selection = await db.metaSelection.findFirst({ where: { id: b.selectionId, userId: user.id, expiresAt: { gt: new Date() } } });
    if (!selection) throw new HttpError(400, 'Danh sách Page đã hết hạn. Kết nối lại.');
    const pages = JSON.parse(decrypt(selection.pagesEncrypted)) as Candidate[];
    if (b.pageIds.some(id => !pages.some(p => p.id === id))) throw new HttpError(403, 'Page chưa được cấp quyền');
    if (!(await db.metaSelection.deleteMany({ where: { id: selection.id } })).count) throw new HttpError(409, 'Phiên đã xử lý');
    const results = [];
    for (const p of pages.filter(p => b.pageIds.includes(p.id))) {
      const page = await db.$transaction(async tx => {
        const existing = await tx.page.upsert({ where: { metaId: p.id }, create: { metaId: p.id, name: p.name, category: p.category }, update: {} });
        await lockPage(tx, existing.id);
        await tx.conversation.updateMany({ where: { pageId: existing.id, status: 'AI_ACTIVE' }, data: { version: { increment: 1 } } });
        return tx.page.update({ where: { id: existing.id }, data: { name: p.name, category: p.category, tokenEncrypted: encrypt(p.access_token), demo: false, aiEnabled: false, connection: 'DISCONNECTED', knowledgeRevision: { increment: 1 } } });
      }, { maxWait: 30000, timeout: 30000 });
      let connected = false;
      try {
        const r = await fetch(graphUrl(`${p.id}/subscribed_apps`, runtime.metaGraphVersion), { method: 'POST', headers: { Authorization: `Bearer ${p.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads'] }), signal: AbortSignal.timeout(15000) });
        const data = await r.json(); connected = r.ok && data.success === true;
      } catch {}
      await db.page.updateMany({ where: { id: page.id, knowledgeRevision: page.knowledgeRevision }, data: connected ? { connection: 'CONNECTED', lastError: null, tokenCheckedAt: null } : { connection: 'ERROR', lastError: 'Không đăng ký được webhook. Kiểm tra quyền App và kết nối lại.' } });
      await audit(user.id, 'meta.connect', page.id); results.push({ id: page.id, connected });
    }
    return Response.json({ ok: true, results });
  } catch (e) { return errorResponse(e); }
}
