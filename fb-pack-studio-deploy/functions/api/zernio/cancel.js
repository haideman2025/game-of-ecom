import { json, error, getCurrentUser } from '../../_utils.js';
import { getZernioKey, zernioDelete } from '../_zernio.js';

/* V14.33 — POST /api/zernio/cancel
   Body: { row_ids: ["sp_xxx", ...] }   OR   { all_scheduled_for_pack: "pack_id" }

   For each row:
   1. Look up zernio_post_id from D1 scheduled_posts
   2. Call Zernio DELETE /posts/{id}  (skips if status='published' since cannot undo)
   3. Update D1 status='cancelled'

   Returns: { cancelled: [...], skipped: [...], failed: [...] }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  let rowIds = body.row_ids;
  // Convenience: cancel ALL scheduled (not published) for a pack
  if (!rowIds && body.all_scheduled_for_pack) {
    const r = await env.DB.prepare(
      `SELECT id FROM scheduled_posts WHERE user_id = ? AND pack_id = ? AND status IN ('scheduled', 'pending')`
    ).bind(user.id, body.all_scheduled_for_pack).all();
    rowIds = (r.results || []).map(x => x.id);
  }
  if (!Array.isArray(rowIds) || rowIds.length === 0) return error('Missing row_ids array or all_scheduled_for_pack', 400);

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // Fetch all rows
  const placeholders = rowIds.map(() => '?').join(',');
  const rowsRes = await env.DB.prepare(
    `SELECT * FROM scheduled_posts WHERE user_id = ? AND id IN (${placeholders})`
  ).bind(user.id, ...rowIds).all();
  const rows = rowsRes.results || [];

  const cancelled = [];
  const skipped = [];
  const failed = [];
  const now = Date.now();

  for (const row of rows) {
    if (row.status === 'published') {
      skipped.push({ id: row.id, post_n: row.post_n, reason: 'Already published - cannot cancel' });
      continue;
    }
    if (row.status === 'cancelled') {
      skipped.push({ id: row.id, post_n: row.post_n, reason: 'Already cancelled' });
      continue;
    }
    try {
      await zernioDelete(apiKey, `/posts/${row.zernio_post_id}`);
      await env.DB.prepare(
        `UPDATE scheduled_posts SET status = 'cancelled', updated_at = ? WHERE id = ?`
      ).bind(now, row.id).run();
      cancelled.push({ id: row.id, post_n: row.post_n, zernio_post_id: row.zernio_post_id });
    } catch (e) {
      // If Zernio returns 404 — the post is already gone on their side; still mark cancelled locally
      if (e.status === 404) {
        await env.DB.prepare(
          `UPDATE scheduled_posts SET status = 'cancelled', updated_at = ? WHERE id = ?`
        ).bind(now, row.id).run();
        cancelled.push({ id: row.id, post_n: row.post_n, note: 'Zernio 404 - removed locally' });
      } else {
        failed.push({ id: row.id, post_n: row.post_n, error: e.message.slice(0, 200) });
      }
    }
  }

  return json({
    ok: true,
    cancelled_count: cancelled.length,
    skipped_count: skipped.length,
    failed_count: failed.length,
    cancelled, skipped, failed
  });
}
