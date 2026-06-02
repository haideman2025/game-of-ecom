import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* GET /api/video/:id     — full project with timeline_json
   DELETE /api/video/:id  — soft-stable delete (drop row + best-effort R2 cleanup of exported_r2_key) */

export async function onRequestGet({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const id = params.id;
  if (!id) return error('Missing id');

  const row = await env.DB.prepare(
    `SELECT * FROM video_projects WHERE id = ?`
  ).bind(id).first();
  if (!row) return error('Project not found', 404);

  try { await requireCap(env, row.pack_id, user, 'view_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Parse timeline
  let timeline = null;
  try { timeline = JSON.parse(row.timeline_json || '{}'); }
  catch (e) { timeline = { tracks: [] }; }

  return json({
    project: {
      id: row.id, pack_id: row.pack_id, user_id: row.user_id,
      name: row.name, description: row.description,
      timeline,
      duration_ms: row.duration_ms,
      width: row.width, height: row.height, fps: row.fps,
      exported_url: row.exported_url,
      exported_size_bytes: row.exported_size_bytes,
      exported_at: row.exported_at,
      last_zernio_post_id: row.last_zernio_post_id,
      last_published_at: row.last_published_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  });
}

export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const id = params.id;
  if (!id) return error('Missing id');

  const row = await env.DB.prepare(`SELECT pack_id, exported_r2_key FROM video_projects WHERE id = ?`).bind(id).first();
  if (!row) return error('Project not found', 404);

  try { await requireCap(env, row.pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Best-effort R2 cleanup
  if (row.exported_r2_key && env.MEDIA) {
    try { await env.MEDIA.delete(row.exported_r2_key); } catch (e) {}
  }

  await env.DB.prepare(`DELETE FROM video_projects WHERE id = ?`).bind(id).run();
  return json({ ok: true, deleted: id });
}
