import { json, error, getCurrentUser } from '../../_utils.js';
import { zernioValidateKey } from '../_zernio.js';

/* GET /api/zernio/status — quick connection check + Zernio key health
   Returns: { connected: bool, key_valid: bool, account: {id,name}, fb_count } */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const u = await env.DB.prepare(
    `SELECT zernio_api_key, zernio_account_id, zernio_account_name, zernio_connected_at FROM users WHERE id = ?`
  ).bind(user.id).first();

  if (!u?.zernio_api_key) return json({ connected: false });

  const val = await zernioValidateKey(u.zernio_api_key);

  // Count posts
  let scheduledCount = 0, publishedCount = 0;
  try {
    const r = await env.DB.prepare(
      `SELECT status, COUNT(*) as c FROM scheduled_posts WHERE user_id = ? GROUP BY status`
    ).bind(user.id).all();
    for (const row of (r.results || [])) {
      if (row.status === 'scheduled') scheduledCount = row.c;
      else if (row.status === 'published') publishedCount = row.c;
    }
  } catch (e) {}

  return json({
    connected: true,
    key_valid: val.ok,
    key_error: val.error || null,
    account: u.zernio_account_id ? { id: u.zernio_account_id, name: u.zernio_account_name } : null,
    fb_count: (val.facebook_accounts || []).length,
    fb_accounts: (val.facebook_accounts || []).map(a => ({
      id: a._id || a.id,
      name: a.name || a.username || a.handle
    })),
    connected_at: u.zernio_connected_at,
    scheduled_count: scheduledCount,
    published_count: publishedCount
  });
}
