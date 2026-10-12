import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, errorResponse, audit } from '@/lib/auth';
import { createMember, deleteMember, resetMemberPassword } from '@/lib/accounts';
export async function GET() {
  try {
    await requireAdmin();
    const [members, pending, failed, logs] = await Promise.all([
      db.user.findMany({ select: { id: true, name: true, email: true, username: true, role: true, memberships: { select: { pageId: true } } }, orderBy: { createdAt: 'asc' } }),
      db.outboundJob.count({ where: { state: 'PENDING' } }),
      db.outboundJob.count({ where: { state: { in: ['FAILED', 'UNCERTAIN'] } } }),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
    ]);
    return Response.json({ appUrl: process.env.APP_URL || 'http://localhost:3000', webhookUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/meta/webhook`, oauthUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/meta/callback`, metaConfigured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_GRAPH_VERSION && process.env.META_VERIFY_TOKEN), sendEnabled: process.env.META_SEND_ENABLED === 'true', aiConfigured: !!(process.env.AI_API_KEY && process.env.AI_CHAT_MODEL), queue: { pending, failed }, members: members.map(({ memberships, ...m }) => ({ ...m, pageIds: memberships.map(x => x.pageId) })), audit: logs });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const b = z.discriminatedUnion('action', [
      z.object({ action: z.literal('create-user'), name: z.string().trim().min(2).max(100), email: z.string().email().max(200), username: z.string().trim().min(3).max(30), password: z.string().min(12).max(200), role: z.enum(['ADMIN', 'AGENT']) }),
      z.object({ action: z.literal('grant-page'), userId: z.string(), pageId: z.string(), enabled: z.boolean() }),
      z.object({ action: z.literal('reset-password'), userId: z.string(), password: z.string().min(12).max(200) }),
      z.object({ action: z.literal('delete-member'), userId: z.string() })
    ]).parse(await req.json());
    if (b.action === 'create-user') {
      await createMember({ name: b.name, email: b.email, username: b.username, password: b.password, role: b.role, actorId: user.id });
    } else if (b.action === 'grant-page') {
      if (b.enabled) await db.pageMember.upsert({ where: { pageId_userId: { pageId: b.pageId, userId: b.userId } }, create: { pageId: b.pageId, userId: b.userId }, update: {} });
      else await db.pageMember.deleteMany({ where: { pageId: b.pageId, userId: b.userId } });
      await audit(user.id, b.enabled ? 'page.grant' : 'page.revoke', `${b.pageId}/${b.userId}`);
    } else if (b.action === 'reset-password') {
      await resetMemberPassword(user.id, b.userId, b.password);
    } else {
      await deleteMember(user.id, b.userId);
    }
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
