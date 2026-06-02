import { json, error, getCurrentUser } from '../../_utils.js';

/* V18 — GET /api/studio/render-jobs?status=pending&limit=10
   List render jobs for the current user (used by frontend to pull pending work)
   POST /api/studio/render-jobs/{id} body: { status, progress, result_url, error_msg, duration_seconds, size_bytes }
   Update a render job's status from frontend worker.
*/
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit = parseInt(url.searchParams.get('limit') || '20');

  let q = 'SELECT * FROM render_jobs WHERE user_id = ?';
  const binds = [user.id];
  if (status) { q += ' AND status = ?'; binds.push(status); }
  q += ' ORDER BY created_at ASC LIMIT ?';
  binds.push(limit);

  try {
    const r = await env.DB.prepare(q).bind(...binds).all();
    return json({ ok: true, jobs: r.results || [] });
  } catch (e) {
    return json({ ok: true, jobs: [], note: 'render_jobs table not yet migrated. Run schema_v18.' });
  }
}
