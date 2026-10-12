import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { requireAdmin, errorResponse, HttpError } from '@/lib/auth';
import { graphUrl, metaGet } from '@/lib/meta';
import { encrypt } from '@/lib/security';
export async function GET(req: Request) {
  try {
    const user = await requireAdmin(), params = new URL(req.url).searchParams;
    const state = params.get('state') || '';
    const saved = await db.oAuthState.findUnique({ where: { id: state } });
    if (!saved || saved.userId !== user.id || saved.expiresAt < new Date()) throw new HttpError(403, 'Phiên kết nối đã hết hạn');
    if (!(await db.oAuthState.deleteMany({ where: { id: state } })).count) throw new HttpError(403, 'Phiên kết nối đã dùng');
    if (!params.get('code') || params.get('error')) throw new HttpError(400, 'Kết nối bị hủy hoặc thiếu quyền');
    const tokenUrl = new URL(graphUrl('oauth/access_token'));
    tokenUrl.search = new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: `${process.env.APP_URL}/api/meta/callback`, code: params.get('code')! }).toString();
    const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new HttpError(400, 'Không lấy được token Meta');
    const pages: { id: string; name: string; category: string; access_token: string }[] = [];
    let path: string | null = 'me/accounts?fields=id,name,category,access_token&limit=100';
    for (let count = 0; path && count < 20; count++) {
      const result = await metaGet(path, tokenData.access_token);
      for (const p of result.data || []) if (p.id && p.name && p.access_token) pages.push({ id: p.id, name: p.name, category: p.category || 'Facebook Page', access_token: p.access_token });
      const cursor = result.paging?.cursors?.after;
      path = result.paging?.next && cursor ? `me/accounts?fields=id,name,category,access_token&limit=100&after=${encodeURIComponent(cursor)}` : null;
    }
    if (!pages.length) throw new HttpError(400, 'Không có Page được cấp quyền. Kiểm tra quyền quản trị và quyền App.');
    await db.metaSelection.create({ data: { id: randomBytes(24).toString('hex'), userId: user.id, pagesEncrypted: encrypt(JSON.stringify(pages)), expiresAt: new Date(Date.now() + 600000) } });
    return Response.redirect(`${process.env.APP_URL}/?selectPages=1`);
  } catch (e) { return errorResponse(e); }
}
