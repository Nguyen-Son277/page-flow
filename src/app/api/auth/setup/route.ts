import { z } from 'zod';
import { requireUser, assertSameOrigin, errorResponse, HttpError, audit } from '@/lib/auth';
import { createFirstAdmin, enforceRateLimit, needsSetup, requestKey } from '@/lib/accounts';
import { createSession } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json({ needsSetup: await needsSetup() });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    // Deployment guard: a fresh, reachable server must not be claimed by a stranger in a loop.
    await enforceRateLimit(requestKey(req, 'setup'), 10, 3600000, 'Quá nhiều yêu cầu tạo tài khoản. Vui lòng thử lại sau.');
    const body = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(200),
      username: z.string().trim().min(3).max(30),
      password: z.string().min(12).max(200)
    }).parse(await req.json());
    if (!await needsSetup()) throw new HttpError(409, 'Hệ thống đã có tài khoản. Vui lòng đăng nhập bằng tài khoản hiện có.');
    const user = await createFirstAdmin(body);
    await createSession(user.id);
    await audit(user.id, 'session.setup-login', user.id);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
