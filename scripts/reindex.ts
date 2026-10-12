import { db } from '../src/lib/db';
import { publishSource } from '../src/lib/knowledge';

// Rebuild the knowledge chunks and their HNSW vectors for every source that has a
// draft. Knowledge content and API credentials are never logged.
async function main() {
  const sources = await db.knowledgeSource.findMany({ where: { draft: { not: '' } }, select: { id: true, updatedBy: true }, orderBy: { id: 'asc' } });
  if (!sources.length) {
    console.log('Không có nguồn tri thức nào để lập chỉ mục.');
    return;
  }
  if (!process.env.AI_API_KEY || !process.env.AI_EMBEDDING_MODEL) {
    console.warn('Cảnh báo: chưa cấu hình AI_API_KEY/AI_EMBEDDING_MODEL — đang chạy ở chế độ từ khoá, chỉ mục vector không được tạo.');
  }
  let processed = 0, failed = 0;
  for (const source of sources) {
    try {
      await publishSource(source.id, source.updatedBy);
      processed++;
    } catch (e) {
      failed++;
      console.error(`Lỗi khi lập chỉ mục nguồn ${source.id}: ${e instanceof Error ? e.message : 'Lỗi không xác định'}`);
    }
    console.log(`Tiến độ: ${processed + failed}/${sources.length} nguồn đã xử lý.`);
  }
  console.log(`Hoàn tất: ${processed}/${sources.length} nguồn lập chỉ mục thành công, ${failed} nguồn lỗi.`);
  if (failed) process.exitCode = 1;
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Lỗi không xác định'); process.exitCode = 1; }).finally(() => db.$disconnect());
