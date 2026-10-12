import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, requirePage, errorResponse, HttpError, audit } from '@/lib/auth';
import { lockConversation } from '@/lib/locking';
import { notify, scheduleAi } from '@/lib/queue';
import { allowedToSend } from '@/lib/security';
type Context = { params: Promise<{ id: string }> };
async function access(id: string, user: { id: string; role: string }) {
  const c = await db.conversation.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Không tìm thấy hội thoại');
  const page = await requirePage(c.pageId, user); return { c, page };
}
export async function GET(req: Request, ctx: Context) {
  try {
    const user = await requireUser(), { id } = await ctx.params; await access(id, user);
    const before = new URL(req.url).searchParams.get('before');
    const marker = before ? await db.message.findFirst({ where: { id: before, conversationId: id } }) : null;
    if (before && !marker) throw new HttpError(400, 'Mốc tin nhắn không hợp lệ');
    const messages = await db.message.findMany({ where: { conversationId: id, ...(marker ? { OR: [{ createdAt: { lt: marker.createdAt } }, { createdAt: marker.createdAt, id: { lt: marker.id } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51 });
    const result = await db.conversation.findUniqueOrThrow({ where: { id }, include: { page: { select: { id: true, name: true, color: true, demo: true, aiEnabled: true } }, runs: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    return Response.json({ ...result, messages: messages.slice(0, 50).reverse(), nextMessageCursor: messages.length > 50 ? messages[49].id : null });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const user = await requireUser(req), { id } = await ctx.params;
    const { c, page } = await access(id, user);
    const body = z.object({ action: z.enum(['read', 'takeover', 'resume', 'resolve', 'assign', 'message', 'note', 'demo-incoming']), text: z.string().trim().min(1).max(2000).optional(), assignedTo: z.string().nullable().optional(), idempotencyKey: z.string().min(16).max(100).optional(), seenAt: z.string().datetime().optional() }).parse(await req.json());
    if (body.action === 'assign' && body.assignedTo) {
      const target = await db.user.findUnique({ where: { id: body.assignedTo }, include: { memberships: true } });
      if (!target || (target.role !== 'ADMIN' && !target.memberships.some(m => m.pageId === page.id))) throw new HttpError(400, 'Nhân viên không có quyền Page này');
    }
    const result = await db.$transaction(async tx => {
      await lockConversation(tx, id);
      const current = await tx.conversation.findUniqueOrThrow({ where: { id } });
      if (body.action === 'read') {
        if (!body.seenAt) throw new HttpError(400, 'Thiếu mốc tin đã xem');
        const seenAt = new Date(Math.min(new Date(body.seenAt).getTime(), current.lastIncomingAt?.getTime() || 0, Date.now()));
        const old = await tx.conversationRead.findUnique({ where: { conversationId_userId: { conversationId: id, userId: user.id } } });
        if (!old || old.at < seenAt) await tx.conversationRead.upsert({ where: { conversationId_userId: { conversationId: id, userId: user.id } }, create: { conversationId: id, userId: user.id, at: seenAt }, update: { at: seenAt } }); return current;
      }
      if (body.action === 'takeover' || body.action === 'resume') return tx.conversation.update({ where: { id }, data: { status: body.action === 'takeover' ? 'HUMAN_ACTIVE' : 'AI_ACTIVE', version: { increment: 1 }, assignedTo: body.action === 'takeover' ? user.id : current.assignedTo, resolved: false } });
      if (body.action === 'resolve') return tx.conversation.update({ where: { id }, data: { resolved: true, status: 'HUMAN_ACTIVE', version: { increment: 1 } } });
      if (body.action === 'assign') return tx.conversation.update({ where: { id }, data: { assignedTo: body.assignedTo || null } });
      if (!body.text) throw new HttpError(400, 'Vui lòng nhập nội dung');
      if (body.action === 'demo-incoming' && !page.demo) throw new HttpError(400, 'Chỉ áp dụng cho Page demo');
      if (body.action === 'message') {
        if (!body.idempotencyKey) throw new HttpError(400, 'Thiếu khóa chống gửi trùng');
        const existing = await tx.message.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
        if (existing) { if (existing.conversationId !== id) throw new HttpError(409, 'Khóa gửi đã sử dụng'); return current; }
        if (!page.demo && (!allowedToSend(current.lastCustomerAt) || process.env.META_SEND_ENABLED !== 'true')) throw new HttpError(400, 'Chưa bật gửi Meta hoặc đã ngoài cửa sổ trả lời cho phép');
      }
      const incoming = body.action === 'demo-incoming', note = body.action === 'note', receivedAt = new Date();
      const updated = await tx.conversation.update({ where: { id }, data: note ? {} : { version: { increment: 1 }, lastMessageAt: new Date(), preview: body.text, resolved: false, ...(incoming ? { lastCustomerAt: receivedAt, lastIncomingAt: receivedAt } : { status: 'HUMAN_ACTIVE', assignedTo: user.id }) } });
      const message = await tx.message.create({ data: { conversationId: id, role: incoming ? 'CUSTOMER' : note ? 'NOTE' : 'HUMAN', text: body.text, receivedAt, sentAt: !incoming && !note && page.demo ? receivedAt : undefined, state: incoming || note ? 'RECEIVED' : page.demo ? 'SENT' : 'PENDING', idempotencyKey: body.action === 'message' ? body.idempotencyKey : undefined } });
      if (!incoming && !note && !page.demo) await tx.outboundJob.create({ data: { messageId: message.id, conversationId: id, version: updated.version } });
      return updated;
    }, { maxWait: 30000, timeout: 30000 });
    if (body.action !== 'read') await audit(user.id, body.action, id);
    await notify(c.pageId).catch(() => {});
    if (['resume', 'demo-incoming'].includes(body.action) && result.status === 'AI_ACTIVE') await scheduleAi(id, result.version).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
