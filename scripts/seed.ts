import { db } from '../src/lib/db';
import { publishSource } from '../src/lib/knowledge';
async function main() {
  if (process.env.DEMO_MODE !== 'true') throw new Error('Chỉ seed khi DEMO_MODE=true');
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('Tạo admin trước khi seed');
  const pages = [
    { metaId: 'demo-lumi', name: 'Lumi Skincare', category: 'Mỹ phẩm & chăm sóc da', color: '#7c6ee6', knowledge: 'Serum Lumi Vitamin C 30ml có giá 350.000đ. Thành phần Vitamin C 10%, dùng buổi sáng sau bước làm sạch.\nPhí giao hàng nội thành 25.000đ, miễn phí đơn từ 500.000đ. Thời gian giao hàng 2–3 ngày.\nGiờ tư vấn: 8:00–21:00 mỗi ngày.' },
    { metaId: 'demo-nest', name: 'The Nest Home', category: 'Nội thất & trang trí', color: '#ed9c57', knowledge: 'Đèn bàn Nest Minimal có giá 690.000đ, màu trắng và đen. Bảo hành 12 tháng với lỗi nhà sản xuất.\nGiao hàng toàn quốc, phí giao hàng được nhân viên báo theo địa chỉ. Cửa hàng mở cửa 9:00–20:00.' },
    { metaId: 'demo-bloom', name: 'Bloom Coffee', category: 'Cà phê & đồ uống', color: '#38a99b', knowledge: 'Cà phê sữa đá Bloom giá 35.000đ. Cold brew giá 45.000đ. Latte giá 49.000đ.\nQuán mở cửa từ 7:00 đến 22:00 mỗi ngày. Khách đặt bàn liên hệ nhân viên để xác nhận.' }
  ];
  for (const config of pages) {
    const { knowledge, ...data } = config;
    const page = await db.page.upsert({ where: { metaId: data.metaId }, create: { ...data, demo: true, connection: 'DEMO', aiEnabled: false }, update: {} });
    await db.pageMember.upsert({ where: { pageId_userId: { pageId: page.id, userId: admin.id } }, create: { pageId: page.id, userId: admin.id }, update: {} });
    if (!await db.knowledgeSource.count({ where: { pageId: page.id } })) {
      const source = await db.knowledgeSource.create({ data: { pageId: page.id, title: 'Thông tin sản phẩm & chính sách', kind: 'FAQ', draft: knowledge, updatedBy: admin.id } });
      await publishSource(source.id, admin.id);
    }
    for (const [i, name, question, status] of [
      [1, 'Nguyễn Minh Anh', data.metaId === 'demo-lumi' ? 'Serum Lumi Vitamin C có giá bao nhiêu?' : data.metaId === 'demo-nest' ? 'Đèn bàn Nest Minimal bảo hành bao lâu?' : 'Cold brew giá bao nhiêu?', 'AI_ACTIVE'],
      [2, 'Trần Hoàng Nam', 'Mình muốn gặp nhân viên để hỏi về đơn hàng', 'NEEDS_HUMAN'],
      [3, 'Lê Thu Hà', 'Shop tư vấn giúp mình nhé', 'HUMAN_ACTIVE']
    ] as const) {
      const psid = `${data.metaId}-customer-${i}`;
      const at = new Date(Date.now() - (i * 4 + pages.indexOf(config) * 2) * 60000);
      if (await db.conversation.findUnique({ where: { pageId_psid: { pageId: page.id, psid } } })) continue;
      const c = await db.conversation.create({ data: { pageId: page.id, psid, customerName: name, status, preview: question, lastCustomerAt: at, lastIncomingAt: at, lastMessageAt: at, assignedTo: status === 'HUMAN_ACTIVE' ? admin.id : null } });
      await db.message.create({ data: { conversationId: c.id, role: 'CUSTOMER', text: question, createdAt: at, receivedAt: at } });
    }
  }
  console.log('Đã tạo 3 Page demo, 9 hội thoại và kho kiến thức. AI mặc định tắt; không gửi Facebook.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
