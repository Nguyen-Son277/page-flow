import { requireUser, errorResponse } from '@/lib/auth';
import { listConversations } from '@/lib/inbox';
export async function GET(req: Request) {
  try { return Response.json(await listConversations(await requireUser(), new URL(req.url).searchParams)); }
  catch (e) { return errorResponse(e); }
}
