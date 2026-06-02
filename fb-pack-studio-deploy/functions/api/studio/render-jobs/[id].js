import { json, error, getCurrentUser } from '../../../_utils.js';

/* V18 — PATCH /api/studio/render-jobs/{id}
   Frontend worker updates job status: { status, progress, result_url, error_msg, duration_seconds, size_bytes }
*/
export async function onRequestPatch({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const body = await request.json().catch(() => ({}));

  const allowedFields = ['status', 'progress', 'result_url', 'error_msg', 'duration_seconds', 'size_bytes', 'started_at', 'finished_at', 'worker_id'];
  const sets = [];
  const binds = [];
  for (const f of allowedFields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      binds.push(body[f]);
    }
  }
  if (sets.length === 0) return error('No valid fields to update', 400);

  // Auto-set timestamps based on status transitions
  if (body.status === 'processing' && !body.started_at) {
    sets.push('started_at = ?'); binds.push(Date.now());
  }
  if ((body.status === 'done' || body.status === 'failed') && !body.finished_at) {
    sets.push('finished_at = ?'); binds.push(Date.now());
  }

  binds.push(params.id);
  binds.push(user.id);

  try {
    const r = await env.DB.prepare(
      `UPDATE render_jobs SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...binds).run();
    if (!r.meta?.changes) return error('Job not found', 404);
    return json({ ok: true, id: params.id, updated: sets.length });
  } catch (e) {
    return error('Update render job: ' + e.message, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  await env.DB.prepare('DELETE FROM render_jobs WHERE id = ? AND user_id = ?').bind(params.id, user.id).run();
  return json({ ok: true });
}
