import { z } from 'zod';
import { requireUser, requirePage, errorResponse } from '@/lib/auth';
import { answerQuestion } from '@/lib/ai';
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { pageId, question } = z.object({ pageId: z.string(), question: z.string().trim().min(2).max(2000) }).parse(await req.json());
    const page = await requirePage(pageId, user);
    return Response.json(await answerQuestion(page, question));
  } catch (e) { return errorResponse(e); }
}
