import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, requireAdmin, requirePage, errorResponse, HttpError, audit } from '@/lib/auth';
import { lockPage } from '@/lib/locking';
import { publishSource } from '@/lib/knowledge';
export async function GET(req: Request) {
  try {
    const user = await requireUser(), pageId = new URL(req.url).searchParams.get('pageId') || '';
    await requirePage(pageId, user);
    return Response.json(await db.knowledgeSource.findMany({ where: { pageId }, orderBy: { updatedAt: 'desc' } }));
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const b = z.object({ action: z.enum(['save', 'publish', 'delete']), id: z.string().optional(), pageId: z.string(), title: z.string().trim().min(1).max(200).optional(), content: z.string().trim().min(10).max(100000).optional(), kind: z.enum(['TEXT', 'FAQ', 'PRICE', 'FILE', 'URL']).optional() }).parse(await req.json());
    await requirePage(b.pageId, user);
    if (b.id && !await db.knowledgeSource.findFirst({ where: { id: b.id, pageId: b.pageId } })) throw new HttpError(404, 'Nguồn không tồn tại');
    if (b.action === 'delete') {
      if (!b.id) throw new HttpError(400, 'Thiếu nguồn');
      await db.$transaction(async tx => {
        await lockPage(tx, b.pageId);
        await tx.knowledgeSource.delete({ where: { id: b.id } });
        await tx.page.update({ where: { id: b.pageId }, data: { knowledgeRevision: { increment: 1 } } });
        await tx.conversation.updateMany({ where: { pageId: b.pageId, status: 'AI_ACTIVE' }, data: { version: { increment: 1 } } });
      }, { maxWait: 30000, timeout: 30000 });
    } else {
      let id = b.id;
      if (b.content && b.title) {
        const source = id ? await db.knowledgeSource.update({ where: { id }, data: { title: b.title, draft: b.content, updatedBy: user.id } }) : await db.knowledgeSource.create({ data: { pageId: b.pageId, title: b.title, draft: b.content, kind: b.kind || 'TEXT', updatedBy: user.id } });
        id = source.id;
      }
      if (!id) throw new HttpError(400, 'Cần tên và nội dung nguồn');
      if (b.action === 'publish') await publishSource(id, user.id);
      await audit(user.id, `knowledge.${b.action}`, id);
      return Response.json({ ok: true, id });
    }
    await audit(user.id, 'knowledge.delete', b.id!);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
