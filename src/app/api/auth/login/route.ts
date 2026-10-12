import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, errorResponse, HttpError, assertSameOrigin } from '@/lib/auth';
import { verifyPassword } from '@/lib/security';
import { clearRateLimit, enforceRateLimit } from '@/lib/accounts';
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = z.object({ identifier: z.string().trim().min(1).max(200).optional(), email: z.string().trim().min(1).max(200).optional(), password: z.string().min(1).max(200) })
      .refine(value => !!(value.identifier || value.email), { message: 'Vui lòng nhập email hoặc tên đăng nhập' }).parse(await req.json());
    // Normalise once: an address signs in by email, anything else by username.
    const raw = (body.identifier || body.email || '').toLowerCase();
    await enforceRateLimit(`login:${raw}`, 8, 900000, 'Thử lại sau 15 phút');
    const user = raw.includes('@') ? await db.user.findUnique({ where: { email: raw } }) : await db.user.findUnique({ where: { username: raw } });
    if (!user || !verifyPassword(body.password, user.passwordHash)) throw new HttpError(401, 'Thông tin đăng nhập không đúng');
    await clearRateLimit(`login:${raw}`);
    await createSession(user.id);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
