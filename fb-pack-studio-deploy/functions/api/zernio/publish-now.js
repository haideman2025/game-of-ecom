import { json, error, getCurrentUser } from '../../_utils.js';
import { getZernioKey, zernioPost, zernioPatch, zernioDelete, zernioGet } from '../_zernio.js';

/* V14.36 — POST /api/zernio/publish-now
   Force a scheduled Zernio post to publish IMMEDIATELY (skip wait).

   Body: { row_id, zernio_post_id }   (one of two required)

   Strategy:
   1. Try PATCH /posts/{id} with { publishNow: true } or { scheduledFor: null, status: 'published' }
   2. Fallback: GET /posts/{id} → re-create as POST /posts with publishNow: true → DELETE old scheduled
   3. Mark D1 row published_at + status
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { row_id, zernio_post_id } = body;
  if (!row_id && !zernio_post_id) return error('Missing row_id or zernio_post_id', 400);

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // Look up our D1 row
  let row = null;
  try {
    if (row_id) {
      row = await env.DB.prepare('SELECT * FROM scheduled_posts WHERE id = ? AND user_id = ?').bind(row_id, user.id).first();
    } else {
      row = await env.DB.prepare('SELECT * FROM scheduled_posts WHERE zernio_post_id = ? AND user_id = ?').bind(zernio_post_id, user.id).first();
    }
  } catch (e) {}

  const zpId = zernio_post_id || row?.zernio_post_id;
  if (!zpId) return error('Không tìm thấy zernio_post_id để publish', 404);
  if (row && row.status === 'published') return error('Post đã published rồi', 400);

  // ATTEMPT 1 — PATCH with publishNow flag
  const attempts = [];
  let resp = null;
  let lastErr = null;

  for (const payload of [
    { publishNow: true },
    { scheduledFor: null, publishNow: true },
    { status: 'publishing' }
  ]) {
    try {
      resp = await zernioPatch(apiKey, `/posts/${zpId}`, payload);
      attempts.push({ method: 'PATCH', payload, status: 'success' });
      break;
    } catch (e) {
      attempts.push({ method: 'PATCH', payload, status: 'fail', http: e.status, msg: (e.message || '').slice(0, 150) });
      lastErr = e;
      if (e.status !== 404 && e.status !== 400) break;
    }
  }

  // ATTEMPT 2 — fallback: GET old → re-create with publishNow → DELETE old
  if (!resp) {
    try {
      const old = await zernioGet(apiKey, `/posts/${zpId}`);
      const platforms = old.platforms || (old.accountId ? [{ platform: old.platform || 'facebook', accountId: old.accountId }] : []);
      const newPayload = {
        content: old.content || old.caption || '',
        platforms,
        mediaItems: old.mediaItems || old.media || [],
        publishNow: true
      };
      const created = await zernioPost(apiKey, '/posts', newPayload);
      attempts.push({ method: 'POST /posts (re-create)', status: 'success' });
      // best-effort: delete old scheduled
      try {
        await zernioDelete(apiKey, `/posts/${zpId}`);
        attempts.push({ method: 'DELETE old', status: 'success' });
      } catch (e) {
        attempts.push({ method: 'DELETE old', status: 'fail', msg: e.message.slice(0, 100) });
      }
      resp = { ...created, recreated: true, original_id: zpId };
    } catch (e) {
      attempts.push({ method: 'POST /posts re-create', status: 'fail', http: e.status, msg: (e.message || '').slice(0, 150) });
      lastErr = e;
    }
  }

  if (!resp) {
    return new Response(JSON.stringify({
      error: 'Publish-now fail — đã thử nhiều cách',
      zernio_status: lastErr?.status,
      zernio_response: lastErr?.body || null,
      attempts,
      hint: 'Có thể Zernio đang lock post vì đến gần giờ schedule. Cancel lịch (🚫 Hủy lịch) rồi đăng lại với publishNow=true.'
    }, null, 2), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  // Update D1
  try {
    if (row?.id) {
      const newZpId = resp.recreated ? (resp._id || resp.id || zpId) : zpId;
      await env.DB.prepare(
        `UPDATE scheduled_posts SET status = 'published', published_at = ?, zernio_post_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`
      ).bind(Date.now(), newZpId, Date.now(), row.id, user.id).run();
    }
  } catch (e) {}

  return json({
    ok: true,
    zernio_post_id: resp._id || resp.id || zpId,
    recreated: !!resp.recreated,
    attempts,
    raw: resp
  });
}
