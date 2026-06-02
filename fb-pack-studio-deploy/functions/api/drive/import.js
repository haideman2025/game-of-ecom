import { json, error, getCurrentUser, uuid } from '../../_utils.js';
import { requireCap, logActivity } from '../../_permissions.js';

/* POST /api/drive/import
   Body: {
     pack_id, drive_file_id, asset_type, filename, mime, size_bytes,
     post_n?, day_n?, pillar_n?
   }
   Register an existing Drive file into D1 drive_files (no re-upload).
   Used when user uploaded directly to Drive (e.g. Video Final folder) and we want to
   make app aware of it. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch (e) { return error('Invalid JSON'); }
  const { pack_id, drive_file_id, asset_type, filename, mime, size_bytes,
          post_n, day_n, pillar_n, web_link } = body || {};

  if (!pack_id || !drive_file_id || !asset_type || !filename) {
    return error('Missing required fields: pack_id, drive_file_id, asset_type, filename');
  }

  // Permission: editor+ to import
  try {
    await requireCap(env, pack_id, user, 'upload_media');
  } catch (e) {
    return error(e.message, e.status || 403);
  }

  // Check if already imported
  const existing = await env.DB.prepare(
    `SELECT id FROM drive_files WHERE drive_file_id = ? AND deleted_at IS NULL LIMIT 1`
  ).bind(drive_file_id).first();
  if (existing) {
    return json({ ok: true, alreadyImported: true, id: existing.id });
  }

  const id = uuid();
  try {
    await env.DB.prepare(
      `INSERT INTO drive_files (id, pack_id, uploader_user_id, drive_file_id, drive_web_link, asset_type,
         post_n, scene_n, sequence_n, from_scene_n, to_scene_n, source, time_range, prompt, filename,
         size_bytes, mime, brand_name, created_at, content_hash, day_folder, type_folder_id,
         pillar_n, day_n, pillar_folder_id, post_folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, pack_id, user.id, drive_file_id, web_link || null, asset_type,
      post_n || null, null, null, null, null,
      'drive-import', null, null,
      filename,
      size_bytes || 0, mime || 'video/mp4', null,
      Date.now(),
      null, null, null,
      pillar_n || null, day_n || null, null, null
    ).run();
  } catch (e) {
    // Fallback if schema columns missing
    try {
      await env.DB.prepare(
        `INSERT INTO drive_files (id, pack_id, uploader_user_id, drive_file_id, drive_web_link, asset_type,
           post_n, source, filename, size_bytes, mime, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, pack_id, user.id, drive_file_id, web_link || null, asset_type,
        post_n || null, 'drive-import', filename, size_bytes || 0, mime || 'video/mp4', Date.now()
      ).run();
    } catch (e2) {
      return error(`Import failed: ${e2.message}`, 500);
    }
  }

  await logActivity(env, pack_id, user, 'import_drive', filename, { post_n, drive_file_id });

  return json({
    ok: true,
    id,
    drive_file_id,
    downloadUrl: `/api/drive/download/${drive_file_id}`
  });
}
