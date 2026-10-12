import { db } from '@/lib/db';
import { requireUser, pageScope, errorResponse } from '@/lib/auth';
import { listConversations, unreadIds } from '@/lib/inbox';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await requireUser();
    const [pages, conversations, members, total, aiReplies, needsHuman] = await Promise.all([
      db.page.findMany({ where: pageScope(user), select: { id: true, name: true, category: true, color: true, demo: true, aiEnabled: true, connection: true, lastError: true, lastWebhookAt: true, tone: true }, orderBy: { createdAt: 'asc' } }),
      listConversations(user),
      user.role === 'ADMIN' ? db.user.findMany({ select: { id: true, name: true, email: true, role: true } }) : db.user.findMany({ where: { OR: [{ id: user.id }, { memberships: { some: { page: pageScope(user) } } }] }, select: { id: true, name: true, email: true, role: true } }),
      db.conversation.count({ where: { page: pageScope(user) } }),
      db.message.count({ where: { role: 'AI', state: 'SENT', conversation: { page: pageScope(user) } } }),
      db.conversation.count({ where: { status: 'NEEDS_HUMAN', resolved: false, page: pageScope(user) } })
    ]);
    return Response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, csrf: user.csrf }, pages, conversations: conversations.items, conversationNextCursor: conversations.nextCursor, members, stats: { total, aiReplies, needsHuman, unread: (await unreadIds(user)).length } });
  } catch (e) { return errorResponse(e); }
}
