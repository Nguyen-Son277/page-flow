import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, currentSessionId, errorResponse, HttpError, audit } from '@/lib/auth';
import { changeOwnPassword, updateOwnProfile, USERNAME_RULE } from '@/lib/accounts';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await requireUser();
    const record = await db.user.findUnique({ where: { id: user.id }, select: { name: true, username: true, email: true, role: true } });
    return Response.json({ ...record, usernameRule: USERNAME_RULE });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = z.object({
      action: z.enum(['profile', 'password', 'revoke-sessions']),
      name: z.string().trim().min(2).max(100).optional(),
      username: z.string().trim().min(3).max(30).optional(),
      currentPassword: z.string().min(1).max(200).optional(),
      newPassword: z.string().min(12).max(200).optional()
    }).parse(await req.json());
    const keep = await currentSessionId();
    if (body.action === 'profile') {
      if (body.name === undefined && body.username === undefined) throw new HttpError(400, 'Không có thay đổi nào');
      const updated = await updateOwnProfile(user.id, { name: body.name, username: body.username });
      return Response.json({ ok: true, name: updated.name, username: updated.username });
    }
    if (body.action === 'password') {
      if (!body.currentPassword || !body.newPassword) throw new HttpError(400, 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới');
      await changeOwnPassword(user.id, body.currentPassword, body.newPassword, keep ?? undefined);
      return Response.json({ ok: true });
    }
    // Sign out every other device while keeping this session.
    const revoked = await db.session.deleteMany({ where: { userId: user.id, ...(keep ? { id: { not: keep } } : {}) } });
    await audit(user.id, 'session.revoke-others', user.id);
    return Response.json({ ok: true, revoked: revoked.count });
  } catch (e) { return errorResponse(e); }
}
