import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/lib/security';

const db = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const email = `aitip-${suffix}@test.local`;
const password = 'ai-tip-session-password';
let userId: string;
test.beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== 'true') throw new Error('Run using an isolated database with RUN_DB_TESTS=true');
  const user = await db.user.create({ data: { email, username: `aitip${suffix}`, name: 'AI Tip Test', role: 'AGENT', passwordHash: hashPassword(password) } });
  userId = user.id;
});
test.afterAll(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc tên đăng nhập').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('.inbox-heading h1').waitFor();
}
test('AI tip appears once, can be dismissed and returns on next login', async ({ page }) => {
  await login(page);
  const tip = page.locator('.sidebar-ai-tip-wrap');
  await expect(tip).toBeVisible();
  await page.screenshot({ path: 'artifacts/ai-tip-visible.png', fullPage: true });
  await page.getByRole('button', { name: 'Ẩn mẹo AI trong phiên đăng nhập này' }).click();
  await expect(tip).toHaveCount(0);
  // Navigation/tab rerenders within this authenticated workspace do not show it again.
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).first().click();
  await expect(tip).toHaveCount(0);
  await page.getByRole('button', { name: 'Hộp thư', exact: true }).first().click();
  await expect(tip).toHaveCount(0);
  // Sign out ends the session; the hint appears again at the next login.
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
  await page.waitForURL('**/login');
  await login(page);
  await expect(page.locator('.sidebar-ai-tip-wrap')).toBeVisible();
  await page.screenshot({ path: 'artifacts/ai-tip-next-login.png', fullPage: true });
});
