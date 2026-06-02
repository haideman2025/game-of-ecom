import { json, error, getCurrentUser } from '../../_utils.js';

/* V20.D — GET /api/viral-grid/sessions — list user's viral grid master sessions */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  try {
    const r = await env.DB.prepare(
      `SELECT id, brand_name, status, phases_completed, total_leaves, total_ideas, calendar_days, dashboard_url, created_at, finished_at, error_msg
       FROM viral_grid_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    ).bind(user.id).all();
    return json({ ok: true, sessions: r.results || [] });
  } catch (e) {
    return json({ ok: true, sessions: [], note: 'Schema v20 not applied yet' });
  }
}
