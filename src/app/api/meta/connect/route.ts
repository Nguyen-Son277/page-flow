import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { requireAdmin, errorResponse, HttpError } from '@/lib/auth';
import { getMetaConfig, MetaConfigError } from '@/lib/meta';
export async function GET(req: Request) {
  try {
    const user = await requireAdmin();
    if (req.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Vui lòng bắt đầu kết nối trong ứng dụng');
    let config;
    try { config = await getMetaConfig(); }
    catch (error) {
      if (error instanceof MetaConfigError) throw new HttpError(400, error.message);
      throw error;
    }
    const state = randomBytes(32).toString('hex');
    await db.oAuthState.create({ data: { id: state, userId: user.id, expiresAt: new Date(Date.now() + 600000) } });
    const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
    url.search = new URLSearchParams({ client_id: config.appId, redirect_uri: `${config.appUrl}/api/meta/callback`, state, scope: 'pages_show_list,pages_messaging,pages_manage_metadata', response_type: 'code' }).toString();
    return Response.redirect(url);
  } catch (e) { return errorResponse(e); }
}
