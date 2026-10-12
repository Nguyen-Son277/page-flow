import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/security';
import { randomUUID } from 'node:crypto';
const db = new PrismaClient();
const fixture = `theme-${randomUUID()}`; let userId: string, pageId: string;
const PASSWORD = 'theme-test-password';
test.beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== 'true') throw new Error('Theme test requires isolated database and RUN_DB_TESTS=true');
  const user = await db.user.create({ data: { email: `${fixture}@test.local`, name: 'Theme Admin', role: 'ADMIN', passwordHash: hashPassword(PASSWORD) } }); userId = user.id;
  const page = await db.page.create({ data: { metaId: fixture, name: 'Theme Demo Page', demo: true, connection: 'DEMO', category: 'Kiểm thử' } }); pageId = page.id;
  const at = new Date();
  const conversation = await db.conversation.create({ data: { pageId, psid: `${fixture}-psid`, customerName: 'Khách Chủ Đề', preview: 'Xin chào', lastCustomerAt: at, lastIncomingAt: at, lastMessageAt: at } });
  await db.message.create({ data: { conversationId: conversation.id, role: 'CUSTOMER', text: 'Xin chào, cho mình hỏi giá.', receivedAt: at } });
  await db.knowledgeSource.create({ data: { pageId, title: 'Bảng giá thử nghiệm', kind: 'PRICE', draft: 'Sản phẩm thử nghiệm giá 100.000đ.', published: 'Sản phẩm thử nghiệm giá 100.000đ.', publishedAt: at, version: 1, updatedBy: user.id } });
});
test.afterAll(async () => {
  await db.page.deleteMany({ where: { id: pageId } });
  await db.auditLog.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc tên đăng nhập').fill(`${fixture}@test.local`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('.inbox-heading h1').waitFor();
}
/** Contrast of every visible text node against its real (alpha-composited) background. */
function auditContrast(page: Page, threshold: number) {
  return page.evaluate(thresholdValue => {
    const parse = (value: string) => { const m = /rgba?\(([^)]+)\)/.exec(value); if (!m) return null; const p = m[1].split(',').map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
    const over = (fg: number[], bg: number[], a: number) => fg.map((v, i) => v * a + bg[i] * (1 - a));
    const backgroundOf = (el: Element): number[] => {
      const layers: { rgb: number[]; a: number }[] = [];
      let node: Element | null = el;
      while (node && node !== document.documentElement) { const c = parse(getComputedStyle(node).backgroundColor); if (c && c.a > 0) layers.push(c); node = node.parentElement; }
      let base = [13, 17, 32];
      const html = parse(getComputedStyle(document.documentElement).backgroundColor); const body = parse(getComputedStyle(document.body).backgroundColor);
      base = (body && body.a === 1 ? body.rgb : null) ?? (html && html.a === 1 ? html.rgb : null) ?? base;
      for (const layer of layers.reverse()) base = over(layer.rgb, base, layer.a);
      return base;
    };
    const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a: number[], b: number[]) => { const l1 = L(a), l2 = L(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const bad: { text: string; ratio: number }[] = []; let checked = 0;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.children.length || !el.textContent?.trim() || (el as HTMLElement).offsetParent === null) continue;
      const style = getComputedStyle(el), fg = parse(style.color); if (!fg) continue;
      const a = fg.a < 1 ? fg.a : 1;
      const text = over(fg.rgb, backgroundOf(el), a < 1 ? a : 1);
      const value = ratio(text, backgroundOf(el)); checked++;
      if (value < thresholdValue) bad.push({ text: (el.className || el.tagName).toString().slice(0, 40) + ' · ' + el.textContent.trim().slice(0, 30), ratio: Number(value.toFixed(2)) });
    }
    return { checked, bad: bad.slice(0, 12) };
  }, threshold);
}
function surfaces(page: Page) {
  return page.evaluate(() => {
    const bg = (selector: string) => { const el = document.querySelector(selector); return el ? getComputedStyle(el).backgroundColor : 'missing'; };
    const transparent = /rgba\(0, 0, 0, 0\)/;
    const sidebar = bg('.workspace-sidebar'), grid = bg('.inbox-grid'), body = bg('body');
    return { theme: document.documentElement.dataset.theme, sidebar, grid, body, ink: getComputedStyle(document.body).color, overflow: document.documentElement.scrollWidth > window.innerWidth, opaque: ![sidebar, grid, body].some(value => transparent.test(value)) };
  });
}
test('follows the operating system, remembers the manual choice and syncs tabs', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await expect(page.locator('.theme-toggle')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await login(page);
  const dark = await surfaces(page); expect(dark.theme).toBe('dark'); expect(dark.opaque).toBe(true);
  await page.screenshot({ path: 'artifacts/theme-dark-inbox.png', fullPage: true });
  await page.locator('.theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  const light = await surfaces(page); expect(light.opaque).toBe(true);
  expect(light.sidebar).not.toBe(dark.sidebar); expect(light.grid).not.toBe(dark.grid); expect(light.body).not.toBe(dark.body);
  await page.screenshot({ path: 'artifacts/theme-light-inbox.png', fullPage: true });
  await page.reload(); await page.locator('.inbox-heading h1').waitFor();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  // A second tab follows the stored choice and later changes without reloading.
  const second = await context.newPage(); await second.goto('/'); await second.locator('.inbox-heading h1').waitFor();
  expect(await second.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.locator('.theme-toggle').click();
  await expect.poll(() => second.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  // Mobile keeps both themes usable.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['dark', 'light'] as const) {
    if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) await page.locator('.theme-toggle').click();
    const mobile = await surfaces(page); expect(mobile.overflow).toBe(false); expect(mobile.opaque).toBe(true);
    await page.screenshot({ path: `artifacts/theme-${theme}-mobile.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
  await context.close();
});
test('stays readable in dark mode and never worse than light mode', async ({ page }) => {
  await login(page);
  const screens: { label: string; open: () => Promise<void> }[] = [
    { label: 'inbox', open: async () => { await page.locator('.conversation-card').first().click(); await page.locator('.message-bubble').first().waitFor(); } },
    { label: 'knowledge', open: async () => { await page.getByRole('button', { name: 'Tri thức AI', exact: true }).first().click(); await page.waitForTimeout(400); } },
    { label: 'pages', open: async () => { await page.getByRole('button', { name: 'Facebook Pages', exact: true }).first().click(); await page.waitForTimeout(400); } },
    { label: 'settings', open: async () => { await page.getByRole('button', { name: 'Cài đặt', exact: true }).first().click(); await page.waitForTimeout(400); } }
  ];
  for (const screen of screens) {
    await screen.open();
    const light = await auditContrast(page, 2.6);
    expect(light.checked).toBeGreaterThan(0);
    if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') await page.locator('.theme-toggle').click();
    await page.waitForTimeout(250);
    const dark = await auditContrast(page, 2.6);
    expect(dark.checked).toBeGreaterThan(0);
    expect(dark.bad, `${screen.label} dark contrast: ${JSON.stringify(dark.bad)}`).toEqual([]);
    expect(dark.bad.length, `${screen.label} must not be worse than light`).toBeLessThanOrEqual(light.bad.length);
    await page.screenshot({ path: `artifacts/theme-dark-${screen.label}.png`, fullPage: true });
    if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'light') await page.locator('.theme-toggle').click();
  }
});
test('keeps working when the browser blocks storage', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'light' });
  await context.addInitScript(() => {
    const store = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')!;
    Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('storage blocked'); }, configurable: true });
    void store;
  });
  const page = await context.newPage();
  await page.goto('/login');
  await expect(page.locator('.theme-toggle')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.locator('.theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await context.close();
});
