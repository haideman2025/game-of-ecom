import { json, error, getCurrentUser } from '../../_utils.js';

/* GET /api/fb/log?limit=50 — return recent publish log entries */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const rows = await env.DB.prepare(
    `SELECT id, pack_id, post_n, page_id, fb_post_id, status, scheduled_for, caption,
            has_image, has_video, has_first_comment, error_message, created_at, published_at
     FROM fb_publish_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).bind(user.id, limit).all();

  return json({ logs: rows.results || [] });
}
