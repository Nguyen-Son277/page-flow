import { z } from 'zod';
import { db } from './db';
import { lockConversation, lockPage } from './locking';
import { notify, scheduleAi } from './queue';
const eventSchema = z.object({
  sender: z.object({ id: z.string() }).optional(), recipient: z.object({ id: z.string() }).optional(), timestamp: z.number().optional(),
  message: z.object({ mid: z.string(), text: z.string().optional(), is_echo: z.boolean().optional(), app_id: z.number().optional(), attachments: z.array(z.unknown()).optional() }).optional(),
  postback: z.object({ mid: z.string().optional(), title: z.string().optional(), payload: z.string().optional() }).optional(),
  delivery: z.object({ mids: z.array(z.string()).optional() }).optional(), read: z.object({ watermark: z.number().optional() }).optional()
}).passthrough();
export async function processWebhook(payload: unknown) {
  const body = payload as { entry?: { id: string; messaging?: unknown[] }[] };
  for (const entry of body.entry || []) {
    const page = await db.page.findUnique({ where: { metaId: entry.id } });
    if (!page || page.demo) continue;
    await db.page.update({ where: { id: page.id }, data: { lastWebhookAt: new Date() } });
    for (const raw of entry.messaging || []) {
      const parsed = eventSchema.safeParse(raw);
      if (!parsed.success) continue;
      const e = parsed.data;
      if (e.delivery?.mids) {
        await db.message.updateMany({ where: { metaId: { in: e.delivery.mids }, conversation: { pageId: page.id }, state: 'SENT' }, data: { state: 'DELIVERED' } });
        await notify(page.id).catch(() => {}); continue;
      }
      if (e.read?.watermark && e.sender) {
        await db.message.updateMany({ where: { conversation: { pageId: page.id, psid: e.sender.id }, role: { in: ['AI', 'HUMAN'] }, state: { in: ['SENT', 'DELIVERED'] }, sentAt: { lte: new Date(e.read.watermark) } }, data: { state: 'READ' } });
        await notify(page.id).catch(() => {}); continue;
      }
      if (!e.message && !e.postback) continue;
      const echo = !!e.message?.is_echo;
      const psid = echo ? e.recipient?.id : e.sender?.id;
      if (!psid) continue;
      const mid = e.message?.mid || e.postback?.mid || `postback-${page.metaId}-${psid}-${e.timestamp}`;
      if (await db.message.findUnique({ where: { metaId: mid } })) continue;
      // Own app echo can arrive before the outbound transaction commits: never import it as an external human reply.
      if (echo && String(e.message?.app_id) === process.env.META_APP_ID) continue;
      const timestamp = new Date(Math.min(e.timestamp || Date.now(), Date.now()));
      const result = await db.$transaction(async tx => {
        await lockPage(tx, page.id);
        const existing = await tx.conversation.upsert({ where: { pageId_psid: { pageId: page.id, psid } }, create: { pageId: page.id, psid, customerName: `Khách • ${psid.slice(-6)}`, status: echo ? 'HUMAN_ACTIVE' : 'AI_ACTIVE' }, update: {} });
        await lockConversation(tx, existing.id);
        if (await tx.message.findUnique({ where: { metaId: mid } })) return null;
        const current = await tx.conversation.findUniqueOrThrow({ where: { id: existing.id } });
        const receivedAt = new Date();
        const text = e.message?.text || e.postback?.title || (e.message?.attachments?.length ? '[Khách gửi tệp/ảnh — cần nhân viên kiểm tra]' : '[Sự kiện Messenger]');
        await tx.message.create({ data: { conversationId: current.id, metaId: mid, role: echo ? 'HUMAN' : 'CUSTOMER', text: text.slice(0, 10000), state: echo ? 'SENT' : 'RECEIVED', sentAt: echo ? timestamp : undefined, receivedAt, createdAt: timestamp, attachments: e.message?.attachments ? JSON.parse(JSON.stringify(e.message.attachments)) : undefined } });
        const unsupported = !!e.message?.attachments?.length;
        return tx.conversation.update({ where: { id: current.id }, data: { version: { increment: 1 }, resolved: false, ...(!echo ? { lastIncomingAt: receivedAt } : {}), ...(timestamp >= current.lastMessageAt ? { lastMessageAt: timestamp, preview: text.slice(0, 2000) } : {}), ...(!echo && (!current.lastCustomerAt || timestamp > current.lastCustomerAt) ? { lastCustomerAt: timestamp } : {}), ...(echo ? { status: 'HUMAN_ACTIVE' } : unsupported ? { status: current.status === 'HUMAN_ACTIVE' ? 'HUMAN_ACTIVE' : 'NEEDS_HUMAN' } : {}) } });
      }, { maxWait: 30000, timeout: 30000 });
      if (result) {
        await notify(page.id).catch(() => {});
        if (!echo && result.status === 'AI_ACTIVE' && page.aiEnabled) await scheduleAi(result.id, result.version);
      }
    }
  }
}
