import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/security';
import { randomUUID } from 'node:crypto';

const db = new PrismaClient();
const fixture = `a11y-${randomUUID()}`;
const password = 'a11y-test-password';
const customerName = 'Khách A11y';
const customerMessage = 'Xin chào, mình cần hỗ trợ về đơn hàng.';
let userId: string, pageId: string;

test.beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== 'true') throw new Error('a11y test requires isolated database and RUN_DB_TESTS=true');
  const user = await db.user.create({ data: { email: `${fixture}@test.local`, name: 'A11y Admin', role: 'ADMIN', passwordHash: hashPassword(password) } }); userId = user.id;
  const demoPage = await db.page.create({ data: { metaId: fixture, name: 'A11y Demo Page', demo: true, connection: 'DEMO' } }); pageId = demoPage.id;
  const at = new Date();
  const conversation = await db.conversation.create({ data: { pageId, psid: `a11y-customer-${fixture}`, customerName, preview: customerMessage, lastCustomerAt: at, lastIncomingAt: at, lastMessageAt: at } });
  await db.message.create({ data: { conversationId: conversation.id, role: 'CUSTOMER', text: customerMessage, receivedAt: at } });
});

test.afterAll(async () => {
  await db.page.deleteMany({ where: { id: pageId } });
  await db.auditLog.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email hoặc tên đăng nhập').fill(`${fixture}@test.local`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('A11y Demo Page', { exact: true }).first()).toBeVisible();
}

test('navigation, filters, tabs, search, composer and logout expose accessible names', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page);

  // Navigation: two distinct landmarks with different accessible names.
  const quickNav = page.locator('nav[aria-label="Điều hướng nhanh"]');
  const spacesNav = page.locator('nav[aria-label="Không gian chung"]');
  await expect(quickNav).toHaveCount(1);
  await expect(spacesNav).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('nav[aria-label="Điều hướng nhanh"]') === document.querySelector('nav[aria-label="Không gian chung"]'))).toBe(false);

  // Exactly one item in "Không gian chung" is marked as the open page.
  const currentSpace = spacesNav.locator('button[aria-current="page"]');
  await expect(currentSpace).toHaveCount(1);
  await expect(currentSpace).toContainText('Hộp thư');

  await page.getByRole('button', { name: 'Tri thức AI', exact: true }).first().click();
  await expect(currentSpace).toHaveCount(1);
  await expect(currentSpace).toContainText('Tri thức AI');

  await spacesNav.getByRole('button', { name: 'Hộp thư' }).first().click();
  await expect(currentSpace).toHaveCount(1);
  await expect(currentSpace).toContainText('Hộp thư');

  // Sidebar conversation filters: one active item only.
  const filterNav = page.locator('nav[aria-label="Bộ lọc hội thoại"]');
  await expect(filterNav).toHaveCount(1);
  await expect(filterNav.locator('[aria-current="true"]')).toHaveCount(1);

  // Filter tabs: real tablist semantics with a single selected tab.
  const filterTabs = page.locator('[role="tablist"][aria-label="Lọc hội thoại"]');
  await expect(filterTabs).toHaveCount(1);
  expect(await filterTabs.locator('[role="tab"]').count()).toBeGreaterThanOrEqual(2);
  await expect(filterTabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);

  const unreadTab = filterTabs.getByRole('tab', { name: 'Chưa đọc' });
  await unreadTab.click();
  await expect(unreadTab).toHaveAttribute('aria-selected', 'true');
  await expect(filterTabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('[role="tabpanel"][aria-label="Danh sách hội thoại"]')).toHaveCount(1);

  // Search box: the wrapper must be a div, not a label, and the clear button must stay outside any label.
  const searchField = page.locator('.search-field');
  await expect(searchField).toHaveCount(1);
  expect(await searchField.evaluate(element => element.tagName)).toBe('DIV');
  const searchInput = page.getByLabel('Tìm hội thoại');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(customerName);
  const clearSearch = searchField.locator('button').first();
  await expect(clearSearch).toHaveCount(1);
  expect(await clearSearch.evaluate(element => !!element.closest('label'))).toBe(false);
  await clearSearch.click();
  await expect(searchInput).toHaveValue('');
  await expect(page.locator('.conversation-card').first()).toBeVisible();

  // Conversation detail: tablist with one selected tab and a matching tabpanel.
  await page.locator('.conversation-card').first().click();
  await expect(page.locator('.message-bubble').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/a11y-inbox.png', fullPage: true });

  const detailTabs = page.locator('[role="tablist"][aria-label="Nội dung hội thoại"]');
  await expect(detailTabs).toHaveCount(1);
  await expect(detailTabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('[role="tabpanel"][aria-label="Hội thoại"]')).toHaveCount(1);

  const sourcesTab = detailTabs.getByRole('tab', { name: 'Nguồn AI' });
  await sourcesTab.click();
  await expect(sourcesTab).toHaveAttribute('aria-selected', 'true');
  await expect(detailTabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('[role="tabpanel"][aria-label="Nguồn AI"]')).toHaveCount(1);

  // Back to the conversation panel so the composer is mounted again.
  await detailTabs.getByRole('tab', { name: 'Hội thoại' }).click();
  await expect(page.locator('.message-bubble').first()).toBeVisible();

  // Composer mode: two pressed-state buttons, exactly one active.
  const composerTabs = page.locator('.composer-tabs');
  await expect(composerTabs).toHaveCount(1);
  await expect(composerTabs.locator('[aria-pressed]')).toHaveCount(2);
  await expect(composerTabs.locator('[aria-pressed="true"]')).toHaveCount(1);

  const noteButton = composerTabs.getByRole('button', { name: 'Ghi chú nội bộ' });
  await noteButton.click();
  await expect(noteButton).toHaveAttribute('aria-pressed', 'true');
  await expect(composerTabs.locator('[aria-pressed="true"]')).toHaveCount(1);

  // Logout is confirmed through a dialog; cancelling keeps the user in the workspace.
  const logoutDialog = page.getByRole('dialog').first();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(logoutDialog).toBeHidden();
  expect(new URL(page.url()).pathname).not.toBe('/login');
  await expect(page.locator('nav[aria-label="Không gian chung"]')).toHaveCount(1);

  expect(errors).toEqual([]);
});
