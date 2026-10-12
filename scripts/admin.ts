import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';
import { assertUsernameShape, createFirstAdmin, suggestUsername } from '../src/lib/accounts';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Quản trị viên';
  const reset = process.argv.includes('--reset');
  if (!email || !password || password.length < 12) throw new Error('Cần ADMIN_EMAIL và ADMIN_PASSWORD tối thiểu 12 ký tự');
  const rawUsername = process.env.ADMIN_USERNAME?.trim() || suggestUsername(email, name);
  const username = rawUsername ? assertUsernameShape(rawUsername) : '';
  if (reset) {
    const existing = email.includes('@') ? await db.user.findUnique({ where: { email } }) : await db.user.findUnique({ where: { username: email } });
    if (!existing) throw new Error('Không tìm thấy tài khoản để đặt lại mật khẩu');
    const taken = username ? await db.user.findUnique({ where: { username } }) : null;
    if (taken && taken.id !== existing.id) throw new Error(`Tên đăng nhập "${username}" đã được dùng bởi tài khoản khác`);
    await db.$transaction([
      db.user.update({ where: { id: existing.id }, data: { passwordHash: hashPassword(password), ...(username ? { username } : {}) } }),
      // Force every device of this account to sign in again.
      db.session.deleteMany({ where: { userId: existing.id } }),
      db.auditLog.create({ data: { userId: existing.id, action: 'password.reset-cli', target: existing.id } })
    ]);
    console.log(`Đã đặt lại mật khẩu cho: ${existing.email}${username ? ` (tên đăng nhập: ${username})` : ''}`);
    return;
  }
  if (!username) throw new Error('Cần ADMIN_USERNAME hoặc email có phần trước @ dài ít nhất 3 ký tự để làm tên đăng nhập');
  const user = await createFirstAdmin({ name, email, username, password });
  console.log(`Đã tạo quản trị viên: ${user.email} · tên đăng nhập: ${user.username}`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
