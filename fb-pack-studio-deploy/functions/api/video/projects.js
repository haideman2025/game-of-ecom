import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* GET /api/video/projects?pack_id=...
   List timeline projects in this pack. Returns lightweight rows (no full timeline_json for list).

   POST /api/video/projects
   Body: { pack_id, name?, description?, timeline, width?, height?, fps? }
   Create or upsert a video project. If body.id provided → update existing.
*/
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const url = new URL(request.url);
  const packId = url.searchParams.get('pack_id');
  if (!packId) return error('Missing pack_id');

  try { await requireCap(env, packId, user, 'view_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  const rows = await env.DB.prepare(
    `SELECT id, pack_id, user_id, name, description, duration_ms, width, height, fps,
            exported_url, exported_size_bytes, exported_at,
            last_zernio_post_id, last_published_at,
            created_at, updated_at
     FROM video_projects
     WHERE pack_id = ?
     ORDER BY updated_at DESC
     LIMIT 200`
  ).bind(packId).all();

  return json({ projects: rows.results || [], count: (rows.results || []).length });
}

export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { pack_id, id, name, description, timeline, width = 1080, height = 1920, fps = 30 } = body;
  if (!pack_id) return error('Missing pack_id');
  if (!timeline) return error('Missing timeline');

  try { await requireCap(env, pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Compute duration from timeline
  let durationMs = 0;
  try {
    const t = typeof timeline === 'string' ? JSON.parse(timeline) : timeline;
    for (const tr of (t.tracks || [])) {
      for (const c of (tr.clips || [])) {
        durationMs = Math.max(durationMs, c.startMs + (c.endMs - c.startMs));
      }
    }
  } catch (e) {}

  const timelineStr = typeof timeline === 'string' ? timeline : JSON.stringify(timeline);
  const now = Date.now();

  if (id) {
    // Update
    const existing = await env.DB.prepare(`SELECT id, user_id FROM video_projects WHERE id = ? AND pack_id = ?`).bind(id, pack_id).first();
    if (!existing) return error('Project not found', 404);

    await env.DB.prepare(
      `UPDATE video_projects SET
        name = ?, description = ?, timeline_json = ?, duration_ms = ?,
        width = ?, height = ?, fps = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      name || 'Untitled',
      description || null,
      timelineStr,
      durationMs,
      width, height, fps,
      now,
      id
    ).run();

    return json({ ok: true, id, duration_ms: durationMs, updated_at: now });
  } else {
    // Insert
    const newId = `vp_${now}_${Math.random().toString(36).slice(2, 10)}`;
    await env.DB.prepare(
      `INSERT INTO video_projects (id, pack_id, user_id, name, description, timeline_json, duration_ms, width, height, fps, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId, pack_id, user.id,
      name || 'Untitled Project',
      description || null,
      timelineStr,
      durationMs,
      width, height, fps,
      now, now
    ).run();

    return json({ ok: true, id: newId, duration_ms: durationMs, created_at: now });
  }
}
