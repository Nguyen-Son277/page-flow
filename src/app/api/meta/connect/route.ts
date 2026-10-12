import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { requireAdmin, errorResponse, HttpError } from '@/lib/auth';
export async function GET(req: Request) {
  try {
    const user = await requireAdmin();
    if (req.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Vui lòng bắt đầu kết nối trong ứng dụng');
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET || !process.env.META_GRAPH_VERSION) throw new HttpError(400, 'Chưa cấu hình Meta App phía máy chủ');
    const state = randomBytes(32).toString('hex');
    await db.oAuthState.create({ data: { id: state, userId: user.id, expiresAt: new Date(Date.now() + 600000) } });
    const url = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION}/dialog/oauth`);
    url.search = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: `${process.env.APP_URL}/api/meta/callback`, state, scope: 'pages_show_list,pages_messaging,pages_manage_metadata', response_type: 'code' }).toString();
    return Response.redirect(url);
  } catch (e) { return errorResponse(e); }
}
