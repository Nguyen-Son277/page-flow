import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/lib/security';

const db = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const email = `navigation-${suffix}@test.local`;
let userId: string, pageId: string;
test.beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== 'true') throw new Error('Use an isolated test database with RUN_DB_TESTS=true');
  const user = await db.user.create({ data: { email, name: 'Navigation Test', role: 'ADMIN', passwordHash: hashPassword('navigation-test-password') } });
  userId = user.id;
  const page = await db.page.create({ data: { metaId: `navigation-${suffix}`, name: 'Navigation Page', demo: true } });
  pageId = page.id;
  const at = new Date();
  const c = await db.conversation.create({ data: { pageId, psid: suffix, customerName: 'Navigation Customer', status: 'HUMAN_ACTIVE', lastCustomerAt: at, lastIncomingAt: at, preview: 'Tin để kiểm tra điều hướng' } });
  await db.message.create({ data: { conversationId: c.id, role: 'CUSTOMER', text: 'Tin để kiểm tra điều hướng', receivedAt: at } });
});
test.afterAll(async () => {
  await db.page.deleteMany({ where: { id: pageId } });
  await db.auditLog.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc tên đăng nhập').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('navigation-test-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('.inbox-heading h1').waitFor();
}
async function onlyOneNavigation(page: Page, expanded: boolean) {
  if (expanded) {
    await expect(page.locator('.workspace-sidebar')).toBeVisible();
    await expect(page.locator('.rail')).toBeHidden();
  } else {
    await expect(page.locator('.rail')).toBeVisible();
    await expect(page.locator('.workspace-sidebar')).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}
test('desktop uses one navigation, preserves work, remembers preference and resizes safely', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await onlyOneNavigation(page, true);
  const expandedWidth = await page.locator('.main-workspace').evaluate(el => el.getBoundingClientRect().width);
  await page.locator('.workspace-sidebar .page-nav button').filter({ hasText: 'Navigation Page' }).click();
  await onlyOneNavigation(page, true); // Selecting a Page must not collapse desktop navigation.
  await page.locator('.conversation-card').filter({ hasText: 'Navigation Customer' }).click();
  await page.getByLabel('Nội dung trả lời').fill('Bản nháp phải được giữ');
  await page.getByRole('button', { name: 'Thu gọn menu', exact: true }).click();
  await onlyOneNavigation(page, false);
  expect(await page.locator('.main-workspace').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(expandedWidth);
  await expect(page.getByLabel('Nội dung trả lời')).toHaveValue('Bản nháp phải được giữ');
  await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
  await onlyOneNavigation(page, true);
  await expect(page.getByLabel('Nội dung trả lời')).toHaveValue('Bản nháp phải được giữ');
  await page.getByRole('button', { name: 'Thu gọn menu', exact: true }).click();
  await page.reload();
  await page.locator('.inbox-heading h1').waitFor();
  await onlyOneNavigation(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await onlyOneNavigation(page, false);
  await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
  await onlyOneNavigation(page, true);
  expect(await page.locator('.main-workspace').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Escape');
  await onlyOneNavigation(page, false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await onlyOneNavigation(page, false); // Mobile opening does not overwrite desktop preference.
  expect(errors).toEqual([]);
});
test('mobile drawer hides rail, traps focus, closes via selection/backdrop/Escape and preserves draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await onlyOneNavigation(page, false);
  await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
  await onlyOneNavigation(page, true);
  await expect(page.locator('.workspace-sidebar')).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('button', { name: 'Thu gọn menu', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#workspace-navigation'))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Thu gọn menu', exact: true })).toBeFocused();
  await page.locator('.workspace-sidebar .page-nav button').filter({ hasText: 'Navigation Page' }).click();
  await onlyOneNavigation(page, false);
  await page.locator('.conversation-card').filter({ hasText: 'Navigation Customer' }).click();
  await page.getByLabel('Nội dung trả lời').fill('Bản nháp mobile');
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await onlyOneNavigation(page, true);
  await page.keyboard.press('Escape');
  await onlyOneNavigation(page, false);
  await expect(page.getByRole('button', { name: 'Mở menu', exact: true })).toBeFocused();
  await expect(page.getByLabel('Nội dung trả lời')).toHaveValue('Bản nháp mobile');
  await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
  await page.locator('.sidebar-overlay').click({ position: { x: 350, y: 400 } });
  await onlyOneNavigation(page, false);
  await expect(page.getByLabel('Nội dung trả lời')).toHaveValue('Bản nháp mobile');
  await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
  await page.getByRole('button', { name: 'Thu gọn menu', exact: true }).click();
  await onlyOneNavigation(page, false);
});
test('desktop controls still work when localStorage is blocked', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { value: () => { throw new Error('blocked'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('blocked'); } });
  });
  const page = await context.newPage();
  await login(page);
  await onlyOneNavigation(page, true);
  await page.getByRole('button', { name: 'Thu gọn menu', exact: true }).click();
  await onlyOneNavigation(page, false);
  await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
  await onlyOneNavigation(page, true);
  await context.close();
});

test('Inbox owns its child filters and toggling the parent preserves drafts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const parent = page.locator('.inbox-menu-group > button');
  const submenu = page.locator('#inbox-submenu');
  await expect(parent).toHaveAttribute('aria-expanded', 'true');
  await expect(submenu.locator('button')).toHaveCount(5);
  await expect(page.locator('.sidebar-heading').filter({ hasText: 'HỘI THOẠI' })).toHaveCount(0);
  await page.locator('.page-nav button').filter({ hasText: 'Navigation Page' }).click();
  await page.locator('.conversation-card').filter({ hasText: 'Navigation Customer' }).click();
  await page.getByLabel('Nội dung trả lời').fill('Giữ bản nháp khi thu Hộp thư');
  await parent.click();
  await expect(parent).toHaveAttribute('aria-expanded', 'false');
  await expect(submenu).toBeHidden();
  await expect(page.getByLabel('Nội dung trả lời')).toHaveValue('Giữ bản nháp khi thu Hộp thư');
  await parent.press('Enter');
  await expect(submenu).toBeVisible();
  await expect(page.getByLabel('Nội dung trả lời')).toHaveValue('Giữ bản nháp khi thu Hộp thư');
  for (const [label, filter] of [['Chưa đọc', 'unread'], ['Tất cả hội thoại', 'all'], ['Cần nhân viên', 'needsHuman'], ['Của tôi', 'mine'], ['Đã xử lý', 'resolved']]) {
    const response = page.waitForResponse(r => r.url().includes('/api/conversations?') && new URL(r.url()).searchParams.get('filter') === filter);
    await submenu.getByRole('button', { name: label, exact: true }).click();
    await response;
    await expect(submenu.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    await onlyOneNavigation(page, true);
  }
  await page.locator('.sidebar-menu > li > button').filter({ hasText: 'Tri thức AI' }).click();
  await expect(submenu).toBeHidden();
  await parent.click();
  await expect(submenu).toBeVisible();
  await expect(submenu.getByRole('button', { name: 'Đã xử lý', exact: true })).toHaveAttribute('aria-current', 'page');
  await submenu.getByRole('button', { name: 'Tất cả hội thoại', exact: true }).click();
  await expect(page.locator('.conversation-card').first()).toContainText('Navigation Customer');
  await page.locator('.conversation-card').first().click();
  await expect(page.locator('.conversation-detail')).toContainText('Navigation Customer');
  await page.getByRole('button', { name: 'Thu gọn menu', exact: true }).click();
  await page.locator('.rail-nav').getByRole('button', { name: 'Hộp thư', exact: true }).click();
  await onlyOneNavigation(page, true);
  await expect(submenu).toBeVisible();
  await expect(submenu.getByRole('button', { name: 'Tất cả hội thoại', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.conversation-detail')).toContainText('Bắt đầu một cuộc trò chuyện');
  await page.setViewportSize({ width: 390, height: 844 });
  await onlyOneNavigation(page, false);
  await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
  await onlyOneNavigation(page, true);
  await page.locator('#inbox-submenu').getByRole('button', { name: 'Chưa đọc', exact: true }).click();
  await onlyOneNavigation(page, false);
  await page.locator('.rail-nav').getByRole('button', { name: 'Hộp thư', exact: true }).click();
  await onlyOneNavigation(page, true);
  await expect(submenu).toBeVisible();
  await expect(submenu.getByRole('button', { name: 'Tất cả hội thoại', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.conversation-detail')).toContainText('Bắt đầu một cuộc trò chuyện');
  await page.getByRole('button', { name: 'Thu gọn menu', exact: true }).click();
  await onlyOneNavigation(page, false);
});

test('sidebar account stays pinned while long navigation lists scroll', async ({ page }) => {
  // Extend only the browser response: never add fake Pages to a real database.
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const template = body.pages[0];
    if (template) body.pages.push(...Array.from({ length: 35 }, (_, index) => ({ ...template, id: `scroll-fixture-${index}`, name: `Page kiểm tra cuộn ${index + 1}` })));
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 1280, height: 600 });
  await login(page);
  for (const mobile of [false, true]) {
    await page.setViewportSize({ width: mobile ? 390 : 1280, height: 600 });
    if (mobile) await page.getByRole('button', { name: 'Mở rộng menu', exact: true }).click();
    await onlyOneNavigation(page, true);
    for (const theme of ['light', 'dark']) {
      // Use the same DOM marker as the theme component so mobile inert background
      // need not be clicked just to check both palettes.
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const account = page.locator('.sidebar-user');
      const before = await account.boundingBox();
      expect(before).not.toBeNull();
      expect(before!.y + before!.height).toBeLessThanOrEqual(600);
      expect(600 - before!.y - before!.height).toBeLessThan(30);
      await expect(account.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
      const scroll = page.locator('.sidebar-scroll');
      expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const after = await account.boundingBox();
      expect(after!.y).toBeCloseTo(before!.y, 1);
      expect(after!.height).toBeCloseTo(before!.height, 1);
      const lastPage = page.locator('.page-nav button').filter({ hasText: 'Page kiểm tra cuộn 35' });
      await lastPage.focus();
      const lastBox = await lastPage.boundingBox();
      const viewport = await scroll.boundingBox();
      expect(lastBox!.y).toBeGreaterThanOrEqual(viewport!.y - 1);
      expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
      await scroll.evaluate(el => { el.scrollTop = 0; });
    }
    if (mobile) {
      await page.keyboard.press('Escape');
      await onlyOneNavigation(page, false);
    }
  }
});
