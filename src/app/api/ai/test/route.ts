import { z } from 'zod';
import { requireUser, requirePage, errorResponse } from '@/lib/auth';
import { enforceRateLimit, limitFromEnv } from '@/lib/rate-limit';
import { answerQuestion } from '@/lib/ai';
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { pageId, question } = z.object({ pageId: z.string(), question: z.string().trim().min(2).max(2000) }).parse(await req.json());
    // Every call can reach a paid AI provider, so the sandbox is throttled per user.
    await enforceRateLimit(`ai-test:${user.id}`, limitFromEnv('AI_TEST_RATE_LIMIT', 30), 300000, 'Bạn đã thử phản hồi AI quá nhiều lần. Vui lòng đợi vài phút.');
    const page = await requirePage(pageId, user);
    return Response.json(await answerQuestion(page, question));
  } catch (e) { return errorResponse(e); }
}
