import { createHash } from 'node:crypto';
import { db } from './db';
import { HttpError } from './auth';
import { hashPassword, verifyPassword } from './security';

export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,29}$/;
export const USERNAME_RULE = 'Tên đăng nhập 3–30 ký tự, bắt đầu bằng chữ cái, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.';

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}
export function assertUsernameShape(value: string) {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) throw new HttpError(400, USERNAME_RULE);
  return username;
}
export function suggestUsername(email: string, name = '') {
  const local = (email.split('@')[0] || name).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const candidate = local.replace(/^[^a-z]+/, '').slice(0, 30);
  return candidate.length >= 3 ? candidate : '';
}
function assertEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200) throw new HttpError(400, 'Email không hợp lệ');
  return value;
}
function assertPassword(password: string) {
  if (password.length < 12 || password.length > 200) throw new HttpError(400, 'Mật khẩu tối thiểu 12 ký tự');
  return password;
}
export async function assertUsernameFree(username: string, exceptUserId?: string) {
  // Usernames are compared in lower case so "Admin" and "admin" can never both exist.
  const existing = await db.user.findUnique({ where: { username: normalizeUsername(username) } });
  if (existing && existing.id !== exceptUserId) throw new HttpError(409, 'Tên đăng nhập đã được sử dụng');
}
export async function needsSetup() {
  return (await db.user.count()) === 0;
}

/** Only allowed while the database has no accounts at all; race-safe for concurrent requests. */
export async function createFirstAdmin(input: { name: string; email: string; username: string; password: string }, actor?: string | null) {
  const email = assertEmail(input.email), username = assertUsernameShape(input.username), password = assertPassword(input.password);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pageflow-first-admin'))`;
    if (await tx.user.count() > 0) throw new HttpError(409, 'Hệ thống đã có tài khoản. Vui lòng đăng nhập.');
    if (await tx.user.findUnique({ where: { email } })) throw new HttpError(409, 'Email đã được sử dụng');
    if (await tx.user.findUnique({ where: { username } })) throw new HttpError(409, 'Tên đăng nhập đã được sử dụng');
    const user = await tx.user.create({ data: { email, username, name: input.name.trim(), passwordHash: hashPassword(password), role: 'ADMIN' } });
    await tx.auditLog.create({ data: { userId: actor ?? user.id, action: 'user.setup', target: user.id } });
    return user;
  }, { maxWait: 30000, timeout: 30000 });
}

/** Admin-managed member creation; shared by the settings API so validation cannot drift. */
export async function createMember(input: { name: string; email: string; username: string; password: string; role: 'ADMIN' | 'AGENT'; actorId: string }) {
  const email = assertEmail(input.email), username = assertUsernameShape(input.username), password = assertPassword(input.password);
  if (await db.user.findUnique({ where: { email } })) throw new HttpError(409, 'Email đã được sử dụng');
  await assertUsernameFree(username);
  const user = await db.user.create({ data: { email, username, name: input.name.trim(), passwordHash: hashPassword(password), role: input.role } });
  await db.auditLog.create({ data: { userId: input.actorId, action: 'user.create', target: user.id } });
  return user;
}

/** Keeps the current session, signs out every other device. */
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string, keepSessionId?: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!verifyPassword(currentPassword, user.passwordHash)) throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  if (verifyPassword(newPassword, user.passwordHash)) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');
  assertPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword) } }),
    db.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } }),
    db.auditLog.create({ data: { userId, action: 'password.change', target: userId } })
  ]);
}

export async function updateOwnProfile(userId: string, input: { name?: string; username?: string }) {
  const data: { name?: string; username?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 100) throw new HttpError(400, 'Tên hiển thị từ 2 đến 100 ký tự');
    data.name = name;
  }
  if (input.username !== undefined) {
    const username = assertUsernameShape(input.username);
    await assertUsernameFree(username, userId);
    data.username = username;
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'Không có thay đổi nào');
  const user = await db.user.update({ where: { id: userId }, data });
  await db.auditLog.create({ data: { userId, action: 'profile.update', target: userId } });
  return user;
}

export async function resetMemberPassword(actorId: string, memberId: string, password: string) {
  assertPassword(password);
  const member = await db.user.findUnique({ where: { id: memberId } });
  if (!member) throw new HttpError(404, 'Không tìm thấy thành viên');
  await db.$transaction([
    db.user.update({ where: { id: memberId }, data: { passwordHash: hashPassword(password) } }),
    // Every device of that member must sign in again with the temporary password.
    db.session.deleteMany({ where: { userId: memberId } }),
    db.auditLog.create({ data: { userId: actorId, action: 'password.reset', target: memberId } })
  ]);
}

export async function deleteMember(actorId: string, memberId: string) {
  if (actorId === memberId) throw new HttpError(400, 'Không thể xóa tài khoản đang đăng nhập');
  const member = await db.user.findUnique({ where: { id: memberId } });
  if (!member) throw new HttpError(404, 'Không tìm thấy thành viên');
  if (member.role === 'ADMIN' && await db.user.count({ where: { role: 'ADMIN' } }) <= 1) throw new HttpError(400, 'Không thể xóa quản trị viên cuối cùng');
  await db.$transaction([
    db.conversation.updateMany({ where: { assignedTo: memberId }, data: { assignedTo: null } }),
    db.user.delete({ where: { id: memberId } }),
    db.auditLog.create({ data: { userId: actorId, action: 'user.delete', target: memberId } })
  ]);
}

/** Simple durable throttle reused by login and first-run setup. */
export async function enforceRateLimit(key: string, limit: number, windowMs: number, message: string) {
  const id = createHash('sha256').update(key).digest('hex');
  const now = new Date();
  return db.$transaction(async tx => {
    const attempt = await tx.loginAttempt.findUnique({ where: { key: id } });
    if (attempt && attempt.expiresAt > now) {
      if (attempt.count >= limit) throw new HttpError(429, message);
      await tx.loginAttempt.update({ where: { key: id }, data: { count: { increment: 1 } } });
    } else {
      await tx.loginAttempt.upsert({ where: { key: id }, create: { key: id, count: 1, expiresAt: new Date(now.getTime() + windowMs) }, update: { count: 1, expiresAt: new Date(now.getTime() + windowMs) } });
    }
  });
}
export async function clearRateLimit(key: string) {
  await db.loginAttempt.deleteMany({ where: { key: createHash('sha256').update(key).digest('hex') } });
}
export function requestKey(req: Request, scope: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${scope}:${forwarded || 'local'}`;
}
