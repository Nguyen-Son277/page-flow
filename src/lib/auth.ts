import { cookies } from 'next/headers';
import { randomBytes, createHash } from 'node:crypto';
import { db } from './db';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const sessionHash = (s: string) => createHash('sha256').update(s).digest('hex');
export async function currentUser() {
  const token = (await cookies()).get('pageflow_session')?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: sessionHash(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role, csrf: session.csrf };
}
export async function requireUser(req?: Request) {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Vui lòng đăng nhập');
  if (req && !['GET', 'HEAD'].includes(req.method)) {
    assertSameOrigin(req);
    if (req.headers.get('x-csrf-token') !== user.csrf) throw new HttpError(403, 'Yêu cầu không hợp lệ');
  }
  return user;
}
/** Used by unauthenticated mutations such as login and first-run setup. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const expected = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  if (!origin || origin !== expected) throw new HttpError(403, 'Yêu cầu không hợp lệ');
}
export async function currentSessionId() {
  const token = (await cookies()).get('pageflow_session')?.value;
  return token ? sessionHash(token) : null;
}
export async function requireAdmin(req?: Request) {
  const user = await requireUser(req);
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được thực hiện');
  return user;
}
export function pageScope(user: { id: string; role: string }) {
  return user.role === 'ADMIN' ? {} : { members: { some: { userId: user.id } } };
}
export async function requirePage(id: string, user: { id: string; role: string }) {
  const page = await db.page.findFirst({ where: { id, ...pageScope(user) } });
  if (!page) throw new HttpError(404, 'Không tìm thấy Page');
  return page;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
  await db.session.create({ data: { id: sessionHash(token), userId, csrf, expiresAt: new Date(Date.now() + 7 * 86400000) } });
  (await cookies()).set('pageflow_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.name === 'ZodError') return Response.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  console.error('Request failed:', error instanceof Error ? error.name : 'Unknown');
  return Response.json({ error: 'Không thể xử lý yêu cầu. Kiểm tra cấu hình và dịch vụ.' }, { status: 500 });
}
export async function audit(userId: string | null, action: string, target: string) {
  await db.auditLog.create({ data: { userId, action, target } });
}
