import { describe, it, expect, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
// The webhook path enqueues work through Redis; no queue is available inside the DB suite.
vi.mock('../src/lib/queue', () => ({ notify: vi.fn().mockResolvedValue(undefined), scheduleAi: vi.fn().mockResolvedValue(undefined) }));
import { db } from '../src/lib/db';
import { applyPendingReceipts, prunePendingReceipts, processWebhook } from '../src/lib/webhook-processing';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('early delivery and read receipts', () => {
  const prefix = randomUUID();
  // Every case gets its own Page so parked receipts cannot leak across cases.
  async function newPage() {
    return db.page.create({ data: { metaId: `${prefix}-page-${randomUUID()}`, name: 'Receipt Page', demo: false, connection: 'CONNECTED', aiEnabled: true, tokenEncrypted: 'unused-in-tests' } });
  }
  async function newConversation(pageId: string, psid: string) {
    return db.conversation.create({ data: { pageId, psid, customerName: 'Khách nhận trạng thái', status: 'AI_ACTIVE', version: 1, lastCustomerAt: new Date(), lastIncomingAt: new Date(), lastMessageAt: new Date() } });
  }
  // Meta delivers these envelopes before the send transaction commits metaId/sentAt.
  const deliveryPayload = (pageMetaId: string, psid: string, mids: string[]) => ({ object: 'page', entry: [{ id: pageMetaId, messaging: [{ delivery: { mids }, sender: { id: psid }, recipient: { id: pageMetaId } }] }] });
  const readPayload = (pageMetaId: string, psid: string, watermark: number) => ({ object: 'page', entry: [{ id: pageMetaId, messaging: [{ read: { watermark }, sender: { id: psid } }] }] });
  afterAll(async () => {
    await db.page.deleteMany({ where: { metaId: { startsWith: prefix } } });
    await db.$disconnect();
  });
  it('parks a delivery receipt that has no matching message yet, and stays idempotent', async () => {
    const page = await newPage();
    const psid = `${prefix}-${randomUUID()}`;
    await newConversation(page.id, psid);
    const mid = `mid-${randomUUID()}`;
    await processWebhook(deliveryPayload(page.metaId, psid, [mid]));
    const receipt = await db.pendingReceipt.findFirstOrThrow({ where: { pageId: page.id } });
    expect(receipt.kind).toBe('DELIVERY');
    expect(receipt.metaIds).toEqual([mid]);
    // Nothing matched, so no message may have been touched.
    expect(await db.message.count({ where: { conversation: { pageId: page.id } } })).toBe(0);
    await processWebhook(deliveryPayload(page.metaId, psid, [mid]));
    expect(await db.pendingReceipt.count({ where: { pageId: page.id } })).toBe(1);
  });
  it('applies a parked delivery receipt once the send records metaId', async () => {
    const page = await newPage();
    const psid = `${prefix}-${randomUUID()}`;
    const conversation = await newConversation(page.id, psid);
    const mid = `mid-${randomUUID()}`;
    await processWebhook(deliveryPayload(page.metaId, psid, [mid]));
    const message = await db.message.create({ data: { conversationId: conversation.id, metaId: mid, role: 'AI', text: 'Tin đã gửi', state: 'SENT', sentAt: new Date() } });
    expect(await applyPendingReceipts(page.id)).toBe(1);
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).state).toBe('DELIVERED');
    expect(await db.pendingReceipt.count({ where: { pageId: page.id } })).toBe(0);
  });
  it('parks a read receipt and applies it to a message sent before the watermark', async () => {
    const page = await newPage();
    const psid = `${prefix}-${randomUUID()}`;
    const conversation = await newConversation(page.id, psid);
    const watermark = Date.now();
    await processWebhook(readPayload(page.metaId, psid, watermark));
    const receipt = await db.pendingReceipt.findFirstOrThrow({ where: { pageId: page.id } });
    expect(receipt.kind).toBe('READ');
    expect(receipt.psid).toBe(psid);
    expect(receipt.watermark?.getTime()).toBe(watermark);
    const message = await db.message.create({ data: { conversationId: conversation.id, role: 'AI', text: 'Tin trước watermark', state: 'SENT', sentAt: new Date(watermark - 5000) } });
    expect(await applyPendingReceipts(page.id)).toBe(1);
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).state).toBe('READ');
    expect(await db.pendingReceipt.count({ where: { pageId: page.id } })).toBe(0);
  });
  it('never downgrades an already read message', async () => {
    const page = await newPage();
    const psid = `${prefix}-${randomUUID()}`;
    const conversation = await newConversation(page.id, psid);
    const mid = `mid-${randomUUID()}`;
    await processWebhook(deliveryPayload(page.metaId, psid, [mid]));
    const message = await db.message.create({ data: { conversationId: conversation.id, metaId: mid, role: 'AI', text: 'Đã đọc', state: 'READ', sentAt: new Date() } });
    expect(await applyPendingReceipts(page.id)).toBe(0);
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).state).toBe('READ');
    // applyDelivery only matches state SENT, so this receipt cannot resolve and stays parked.
    expect(await db.pendingReceipt.count({ where: { pageId: page.id } })).toBe(1);
  });
  it('prunes receipts older than the retention window and keeps fresh ones', async () => {
    const page = await newPage();
    const old = await db.pendingReceipt.create({ data: { pageId: page.id, key: `DELIVERY:${page.id}:cu`, kind: 'DELIVERY', metaIds: ['mid-cu'], createdAt: new Date(Date.now() - 10 * 86400000) } });
    const fresh = await db.pendingReceipt.create({ data: { pageId: page.id, key: `DELIVERY:${page.id}:moi`, kind: 'DELIVERY', metaIds: ['mid-moi'] } });
    expect(await prunePendingReceipts(7)).toBeGreaterThanOrEqual(1);
    expect(await db.pendingReceipt.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.pendingReceipt.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  });
  it('drives the sweep path: prune keeps live receipts and apply resolves them', async () => {
    const page = await newPage();
    const psid = `${prefix}-${randomUUID()}`;
    const conversation = await newConversation(page.id, psid);
    const mid = `mid-${randomUUID()}`;
    await processWebhook(deliveryPayload(page.metaId, psid, [mid]));
    const parked = await db.pendingReceipt.findFirstOrThrow({ where: { pageId: page.id } });
    const message = await db.message.create({ data: { conversationId: conversation.id, metaId: mid, role: 'AI', text: 'Tin chờ biên nhận', state: 'SENT', sentAt: new Date() } });
    // sweep() calls exactly these two functions; the fresh receipt must survive the prune.
    await prunePendingReceipts();
    expect(await db.pendingReceipt.findUnique({ where: { id: parked.id } })).not.toBeNull();
    expect(await applyPendingReceipts(page.id, 20)).toBe(1);
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).state).toBe('DELIVERED');
    expect(await db.pendingReceipt.count({ where: { pageId: page.id } })).toBe(0);
  });
});
