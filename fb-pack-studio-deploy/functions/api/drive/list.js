import { json, error, getCurrentUser } from '../../_utils.js';
import { getPackRole, can } from '../../_permissions.js';

/* GET /api/drive/list?pack_id=X — list Drive files for a pack (from D1 metadata) */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const packId = url.searchParams.get('pack_id');
  if (!packId) return error('Missing pack_id');

  const role = await getPackRole(env, packId, user.id, user.email);
  if (!can(role, 'read_pack')) return error('No access', 403);

  const rows = await env.DB.prepare(
    `SELECT id, drive_file_id, drive_web_link, asset_type, post_n, scene_n, sequence_n, from_scene_n, to_scene_n,
       source, time_range, prompt, filename, size_bytes, mime, brand_name, created_at, uploader_user_id
     FROM drive_files WHERE pack_id = ? AND deleted_at IS NULL
     ORDER BY post_n ASC, sequence_n ASC, scene_n ASC, created_at ASC`
  ).bind(packId).all();

  const files = (rows.results || []).map(f => ({
    ...f,
    downloadUrl: `/api/drive/download/${f.drive_file_id}`
  }));

  // Also fetch the pack's Drive folder link
  const pack = await env.DB.prepare('SELECT drive_folder_id FROM packs WHERE id = ?').bind(packId).first();
  const folderLink = pack?.drive_folder_id ? `https://drive.google.com/drive/folders/${pack.drive_folder_id}` : null;

  return json({ files, count: files.length, my_role: role, folderLink });
}
