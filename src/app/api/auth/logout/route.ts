import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { requireUser, sessionHash, errorResponse } from '@/lib/auth';
export async function POST(req: Request) {
  try {
    await requireUser(req); const c = await cookies(); const token = c.get('pageflow_session')?.value;
    if (token) await db.session.deleteMany({ where: { id: sessionHash(token) } });
    c.delete('pageflow_session'); return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
