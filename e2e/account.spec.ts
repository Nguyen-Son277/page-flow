import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/security';
import { randomUUID } from 'node:crypto';
const db = new PrismaClient();
const fixture = `owner${randomUUID().slice(0, 8)}`;
const EMAIL = `${fixture}@test.local`;
const START_PASSWORD = 'start-password-123';
const NEW_PASSWORD = 'memorable-password-456';
const NEW_USERNAME = `${fixture}new`;
test.beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== 'true') throw new Error('Account test requires isolated database and RUN_DB_TESTS=true');
  await db.user.create({ data: { email: EMAIL, username: fixture, name: 'Chủ Tài Khoản', role: 'ADMIN', passwordHash: hashPassword(START_PASSWORD) } });
});
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: EMAIL } });
  await db.user.deleteMany({ where: { email: `${fixture}-unused@test.local` } });
  await db.auditLog.deleteMany({ where: { action: { in: ['profile.update', 'password.change', 'session.revoke-others'] } } });
  await db.$disconnect();
});
test('create-style login by short username, then change username and password', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await expect(page.getByLabel('Email hoặc tên đăng nhập')).toBeVisible();
  // Sign in with the short username instead of the long email.
  await page.getByLabel('Email hoặc tên đăng nhập').fill(fixture);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(START_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('.inbox-heading h1').waitFor();
  // Every role can open the account page.
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Tài khoản', exact: true })).toBeVisible();
  await page.getByLabel('Họ và tên').fill('Tên Mới Dễ Nhớ');
  await page.getByLabel('Tên đăng nhập').fill(NEW_USERNAME);
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText(/Đã lưu\. Lần sau bạn có thể đăng nhập bằng tên/)).toBeVisible();
  await page.getByLabel('Mật khẩu hiện tại').fill(START_PASSWORD);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Nhập lại mật khẩu mới').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText(/Đã đổi mật khẩu/)).toBeVisible();
  await page.screenshot({ path: 'artifacts/account-panel.png', fullPage: true });
  // Sign out, then the old credentials must fail and the new username must work.
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.waitForURL('**/login');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(START_PASSWORD);
  await page.getByLabel('Email hoặc tên đăng nhập').fill(fixture);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Thông tin đăng nhập không đúng')).toBeVisible();
  await page.getByLabel('Email hoặc tên đăng nhập').fill(NEW_USERNAME);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('.inbox-heading h1').waitFor();
  await expect(page.locator('.sidebar-user strong')).toHaveText('Tên Mới Dễ Nhớ');
  expect(errors).toEqual([]);
});
test('setup page stays closed once an account exists', async ({ page }) => {
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Máy chủ đã có tài khoản' })).toBeVisible();
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Tạo tài khoản quản trị đầu tiên' })).toHaveCount(0);
});
