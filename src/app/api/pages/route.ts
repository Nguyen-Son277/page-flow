import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requirePage, errorResponse, audit, HttpError } from '@/lib/auth';
import { lockPage } from '@/lib/locking';
import { notify } from '@/lib/queue';
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const b = z.object({ action: z.literal('update'), id: z.string(), aiEnabled: z.boolean().optional(), tone: z.string().max(1000).optional() }).parse(await req.json());
    const page = await requirePage(b.id, user);
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
