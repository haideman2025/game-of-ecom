import { json, error, getCurrentUser } from '../../_utils.js';
import { getZernioKey, zernioGet } from '../_zernio.js';

/* GET /api/zernio/posts?pack_id=X — list our scheduled_posts records for this pack
   Merges D1 records with live Zernio status fetched on demand. */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const packId = url.searchParams.get('pack_id');
  const refresh = url.searchParams.get('refresh') === '1';

  const sql = packId
    ? `SELECT * FROM scheduled_posts WHERE user_id = ? AND pack_id = ? ORDER BY created_at DESC LIMIT 200`
    : `SELECT * FROM scheduled_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`;
  const args = packId ? [user.id, packId] : [user.id];
  const rows = await env.DB.prepare(sql).bind(...args).all();
  let list = rows.results || [];

  if (refresh && list.length > 0) {
    try {
      const apiKey = await getZernioKey(env, user.id);
      // Refresh stale items (not yet published or recently scheduled)
      const toRefresh = list.filter(r => r.status !== 'published' && r.status !== 'failed').slice(0, 30);
      for (const r of toRefresh) {
        try {
          const live = await zernioGet(apiKey, `/posts/${r.zernio_post_id}`);
          const newStatus = live.status || r.status;
          const publishedAt = live.publishedAt || live.published_at || null;
          await env.DB.prepare(
            `UPDATE scheduled_posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?`
          ).bind(newStatus, publishedAt ? new Date(publishedAt).getTime() : null, Date.now(), r.id).run();
          r.status = newStatus;
          if (publishedAt) r.published_at = new Date(publishedAt).getTime();
        } catch (e) { /* keep stale on per-row error */ }
      }
    } catch (e) { /* no key */ }
  }

  return json({ total: list.length, posts: list });
}
