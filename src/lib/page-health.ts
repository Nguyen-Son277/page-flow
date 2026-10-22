import { db } from './db';
import { decrypt } from './security';
import { MetaError, isTokenOrPermissionError, metaGet } from './meta';
import { getRuntimeConfig } from './runtime-config';
// Stable prefix so a later successful check can tell a token warning apart from an
// unrelated operator-facing error and clear only the token one.
export const TOKEN_FAILURE_PREFIX = 'Token hết hạn hoặc thiếu quyền; cần kết nối lại';
export function tokenFailureFields(detail?: string | null): { connection: string; aiEnabled: boolean; lastError: string } {
  const detailText = typeof detail === 'string' ? detail.trim() : '';
  return { connection: 'ERROR', aiEnabled: false, lastError: (detailText ? `${TOKEN_FAILURE_PREFIX} (${detailText})` : TOKEN_FAILURE_PREFIX).slice(0, 300) };
}
// Re-verify Page tokens on a schedule. Only a definite Graph token/permission error
// disables a Page: transient network failures, decryption problems and missing global
// configuration must never turn AI off, so those only refresh tokenCheckedAt.
export async function checkPageTokens(take = 5): Promise<{ checked: number; failed: number }> {
  const configured = process.env.TOKEN_CHECK_HOURS;
  const hours = configured ? Number(configured) : 6;
  // A non-positive or non-finite interval disables the checker entirely.
  if (!Number.isFinite(hours) || hours <= 0) return { checked: 0, failed: 0 };
  const cutoff = new Date(Date.now() - hours * 3600000);
  const runtime = await getRuntimeConfig();
  const pages = await db.page.findMany({
    where: { demo: false, connection: 'CONNECTED', tokenEncrypted: { not: null }, OR: [{ tokenCheckedAt: null }, { tokenCheckedAt: { lt: cutoff } }] },
    // Never-checked Pages come first so a fresh connection is verified on the next sweep.
    orderBy: { tokenCheckedAt: { sort: 'asc', nulls: 'first' } },
    take
  });
  let checked = 0, failed = 0;
  for (const page of pages) {
    checked += 1;
    try {
      await metaGet(`${page.metaId}?fields=id`, decrypt(page.tokenEncrypted!), runtime.metaGraphVersion);
      // Clear only our own token warning; an unrelated lastError must survive.
      const clearsTokenError = typeof page.lastError === 'string' && page.lastError.startsWith(TOKEN_FAILURE_PREFIX);
      await db.page.update({ where: { id: page.id }, data: clearsTokenError ? { tokenCheckedAt: new Date(), lastError: null } : { tokenCheckedAt: new Date() } });
    } catch (error) {
      if (error instanceof MetaError && isTokenOrPermissionError(error.code)) {
        failed += 1;
        // Preserve the working state if the write itself fails; the next Page still runs.
        await db.page.update({ where: { id: page.id }, data: { tokenCheckedAt: new Date(), ...tokenFailureFields(error.message) } }).catch(() => {});
      } else {
        await db.page.update({ where: { id: page.id }, data: { tokenCheckedAt: new Date() } }).catch(() => {});
      }
    }
  }
  return { checked, failed };
}
