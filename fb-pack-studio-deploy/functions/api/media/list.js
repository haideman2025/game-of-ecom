import { json, error, getCurrentUser } from '../../_utils.js';
import { getPackRole, can } from '../../_permissions.js';

/* GET /api/media/list?pack_id=X[&asset_type=Y][&post_n=N]
   List all media metadata for a pack (no actual blobs). Client uses this to know what's available cloud-side. */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const packId = url.searchParams.get('pack_id');
  const assetType = url.searchParams.get('asset_type');
  const postN = url.searchParams.get('post_n');
  if (!packId) return error('Missing pack_id');

  const role = await getPackRole(env, packId, user.id, user.email);
  if (!can(role, 'read_pack')) return error('No access', 403);

  let sql = `SELECT id, asset_type, post_n, scene_n, sequence_n, from_scene_n, to_scene_n,
    source, time_range, prompt, size_bytes, mime, width, height, duration_sec, brand_name, created_at,
    uploader_user_id
    FROM media_files WHERE pack_id = ? AND deleted_at IS NULL`;
  const binds = [packId];
  if (assetType) { sql += ' AND asset_type = ?'; binds.push(assetType); }
  if (postN) { sql += ' AND post_n = ?'; binds.push(parseInt(postN)); }
  sql += ' ORDER BY post_n ASC, sequence_n ASC, scene_n ASC, created_at ASC';

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  // Add downloadUrl for each
  const media = (rows.results || []).map(m => ({ ...m, downloadUrl: `/api/media/${m.id}` }));

  return json({ media, count: media.length, my_role: role });
}
