import { db } from './db';
import { pageScope, HttpError } from './auth';
import type { Prisma } from '@prisma/client';
function baseWhere(user: { id: string; role: string }, params: URLSearchParams): Prisma.ConversationWhereInput {
  const filter = params.get('filter');
  return { page: pageScope(user),
    ...(params.get('pageId') ? { pageId: params.get('pageId')! } : {}),
    ...(params.get('q') ? { OR: [{ customerName: { contains: params.get('q')!.slice(0, 200), mode: 'insensitive' } }, { preview: { contains: params.get('q')!.slice(0, 200), mode: 'insensitive' } }] } : {}),
    ...(filter === 'needsHuman' ? { status: 'NEEDS_HUMAN', resolved: false } : {}),
    ...(filter === 'mine' ? { assignedTo: user.id } : {}), ...(filter === 'resolved' ? { resolved: true } : {})
  };
}
export async function unreadIds(user: { id: string; role: string }): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT c.id FROM "Conversation" c JOIN "Page" p ON p.id=c."pageId" LEFT JOIN "ConversationRead" r ON r."conversationId"=c.id AND r."userId"=${user.id} WHERE c."lastIncomingAt" IS NOT NULL AND (r.at IS NULL OR r.at<c."lastIncomingAt") AND (${user.role}='ADMIN' OR EXISTS (SELECT 1 FROM "PageMember" m WHERE m."pageId"=p.id AND m."userId"=${user.id}))`;
  return rows.map(r => r.id);
}
export async function listConversations(user: { id: string; role: string }, params = new URLSearchParams()) {
  const where = baseWhere(user, params);
  if (params.get('filter') === 'unread') where.id = { in: await unreadIds(user) };
  const cursor = params.get('cursor');
  if (cursor) {
    const item = await db.conversation.findFirst({ where: { id: cursor, page: pageScope(user) } });
    if (!item) throw new HttpError(400, 'Mốc phân trang không hợp lệ');
    where.AND = [{ OR: [{ lastMessageAt: { lt: item.lastMessageAt } }, { lastMessageAt: item.lastMessageAt, id: { lt: item.id } }] }];
  }
  const rows = await db.conversation.findMany({ where, include: { page: { select: { name: true, color: true, demo: true } }, reads: { where: { userId: user.id } } }, orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], take: 51 });
  const items = rows.slice(0, 50).map(({ reads, ...row }) => ({ ...row, unread: !!row.lastIncomingAt && (!reads[0] || reads[0].at < row.lastIncomingAt) }));
  return { items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null };
}
