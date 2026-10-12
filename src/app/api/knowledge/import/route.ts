import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requirePage, errorResponse, HttpError, audit } from '@/lib/auth';
import { importFile, importUrl } from '@/lib/imports';
export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    if (Number(req.headers.get('content-length') || 0) > 9 * 1024 * 1024) throw new HttpError(413, 'Yêu cầu quá lớn');
    let pageId: string, title: string, draft: string, url: string | undefined, kind: string;
    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await req.formData(); pageId = String(form.get('pageId') || ''); title = String(form.get('title') || 'Tài liệu').slice(0, 200);
      await requirePage(pageId, user);
      const file = form.get('file');
      if (!(file instanceof File)) throw new HttpError(400, 'Chọn tệp cần nhập');
      draft = await importFile(file); kind = 'FILE';
    } else {
      const b = z.object({ pageId: z.string(), title: z.string().min(1).max(200), url: z.string().url().max(2000) }).parse(await req.json());
      pageId = b.pageId; title = b.title; url = b.url; kind = 'URL';
      await requirePage(pageId, user); draft = await importUrl(url);
    }
    const source = await db.knowledgeSource.create({ data: { pageId, title, draft, kind, url, updatedBy: user.id } });
    await audit(user.id, 'knowledge.import', source.id);
    return Response.json(source);
  } catch (e) { return errorResponse(e); }
}
