import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, errorResponse, audit, HttpError } from '@/lib/auth';
import { createMember, deleteMember, resetMemberPassword } from '@/lib/accounts';
import { dismissFailedSend, listFailedSends, retryFailedSend } from '@/lib/reconciliation';
// A FAILED event blocks AI replies for its Page: answering on top of an event that was
// never applied would use stale state. An administrator must either replay it or
// explicitly accept the loss; neither happens automatically.
const FAILED_EVENT_LIMIT = 10;
function describeEvent(payload: unknown) {
  const entries = (payload as { entry?: { id?: string; messaging?: unknown[] }[] } | null)?.entry || [];
  const pageIds = [...new Set(entries.map(entry => entry?.id).filter((id): id is string => !!id))];
  const count = entries.reduce((total, entry) => total + (Array.isArray(entry?.messaging) ? entry.messaging.length : 0), 0);
  return { pageIds, count };
}
export async function GET() {
  try {
    await requireAdmin();
    const [members, pending, failed, failedEvents, failedSends, logs] = await Promise.all([
      db.user.findMany({ select: { id: true, name: true, email: true, username: true, role: true, memberships: { select: { pageId: true } } }, orderBy: { createdAt: 'asc' } }),
      db.outboundJob.count({ where: { state: 'PENDING' } }),
      db.outboundJob.count({ where: { state: { in: ['FAILED', 'UNCERTAIN'] } } }),
      db.webhookEvent.findMany({ where: { state: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: FAILED_EVENT_LIMIT, select: { id: true, attempts: true, error: true, createdAt: true, payload: true } }),
      listFailedSends(),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
    ]);
    const described = failedEvents.map(({ payload, ...event }) => ({ ...event, ...describeEvent(payload) }));
    const metaIds = [...new Set(described.flatMap(event => event.pageIds))];
    const pages = metaIds.length ? await db.page.findMany({ where: { metaId: { in: metaIds } }, select: { metaId: true, name: true } }) : [];
    const nameByMetaId = new Map(pages.map(page => [page.metaId, page.name]));
    return Response.json({ appUrl: process.env.APP_URL || 'http://localhost:3000', webhookUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/meta/webhook`, oauthUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/meta/callback`, metaConfigured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_GRAPH_VERSION && process.env.META_VERIFY_TOKEN), sendEnabled: process.env.META_SEND_ENABLED === 'true', aiConfigured: !!(process.env.AI_API_KEY && process.env.AI_CHAT_MODEL), queue: { pending, failed, failedWebhooks: described.length }, failedEvents: described.map(event => ({ ...event, pages: event.pageIds.map(metaId => nameByMetaId.get(metaId) || metaId) })), failedSends, members: members.map(({ memberships, ...m }) => ({ ...m, pageIds: memberships.map(x => x.pageId) })), audit: logs });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const b = z.discriminatedUnion('action', [
      z.object({ action: z.literal('create-user'), name: z.string().trim().min(2).max(100), email: z.string().email().max(200), username: z.string().trim().min(3).max(30), password: z.string().min(12).max(200), role: z.enum(['ADMIN', 'AGENT']) }),
      z.object({ action: z.literal('grant-page'), userId: z.string(), pageId: z.string(), enabled: z.boolean() }),
      z.object({ action: z.literal('reset-password'), userId: z.string(), password: z.string().min(12).max(200) }),
      z.object({ action: z.literal('delete-member'), userId: z.string() }),
      z.object({ action: z.literal('webhook-replay'), id: z.string().min(1) }),
      z.object({ action: z.literal('webhook-dismiss'), id: z.string().min(1) }),
      z.object({ action: z.literal('retry-send'), messageId: z.string().min(1) }),
      z.object({ action: z.literal('dismiss-send'), messageId: z.string().min(1) })
    ]).parse(await req.json());
    if (b.action === 'create-user') {
      await createMember({ name: b.name, email: b.email, username: b.username, password: b.password, role: b.role, actorId: user.id });
    } else if (b.action === 'grant-page') {
      if (b.enabled) await db.pageMember.upsert({ where: { pageId_userId: { pageId: b.pageId, userId: b.userId } }, create: { pageId: b.pageId, userId: b.userId }, update: {} });
      else await db.pageMember.deleteMany({ where: { pageId: b.pageId, userId: b.userId } });
      await audit(user.id, b.enabled ? 'page.grant' : 'page.revoke', `${b.pageId}/${b.userId}`);
    } else if (b.action === 'reset-password') {
      await resetMemberPassword(user.id, b.userId, b.password);
    } else if (b.action === 'delete-member') {
      await deleteMember(user.id, b.userId);
    } else if (b.action === 'webhook-replay') {
      // Conditional update guarded on state so two administrators cannot replay the same
      // event twice, and so a race with the worker cannot resurrect a processed event.
      const replay = await db.webhookEvent.updateMany({ where: { id: b.id, state: 'FAILED' }, data: { state: 'PENDING', attempts: 0, error: null } });
      if (!replay.count) throw new HttpError(409, 'Chỉ phát lại được sự kiện đang ở trạng thái lỗi');
      await audit(user.id, 'webhook.replay', b.id);
    } else if (b.action === 'retry-send') {
      await retryFailedSend(user.id, b.messageId);
    } else if (b.action === 'dismiss-send') {
      await dismissFailedSend(user.id, b.messageId);
    } else {
      const dismiss = await db.webhookEvent.updateMany({ where: { id: b.id, state: 'FAILED' }, data: { state: 'IGNORED', error: null } });
      if (!dismiss.count) throw new HttpError(409, 'Chỉ bỏ qua được sự kiện đang ở trạng thái lỗi');
      await audit(user.id, 'webhook.dismiss', b.id);
    }
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
