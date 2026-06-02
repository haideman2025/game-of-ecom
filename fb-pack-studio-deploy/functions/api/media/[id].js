import { error, getCurrentUser } from '../../_utils.js';
import { getPackRole, can, logActivity } from '../../_permissions.js';

/* GET /api/media/:id — download media (proxy R2 with permission check) */
export async function onRequestGet({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!env.MEDIA_BUCKET) return error('R2 not configured', 500);

  const id = params.id;
  const meta = await env.DB.prepare(
    `SELECT pack_id, r2_key, mime, size_bytes, deleted_at FROM media_files WHERE id = ?`
  ).bind(id).first();
  if (!meta) return error('Not found', 404);
  if (meta.deleted_at) return error('Deleted', 410);

  // Permission: viewer+ to download
  const role = await getPackRole(env, meta.pack_id, user.id, user.email);
  if (!can(role, 'download_media')) return error('No access', 403);

  // Stream from R2
  const obj = await env.MEDIA_BUCKET.get(meta.r2_key);
  if (!obj) return error('R2 object missing', 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': meta.mime,
      'Content-Length': String(meta.size_bytes),
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': 'inline'
    }
  });
}

/* DELETE /api/media/:id — soft delete + remove from R2 (uploader/admin+) */
export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!env.MEDIA_BUCKET) return error('R2 not configured', 500);

  const id = params.id;
  const meta = await env.DB.prepare(
    `SELECT pack_id, uploader_user_id, r2_key, size_bytes, deleted_at FROM media_files WHERE id = ?`
  ).bind(id).first();
  if (!meta) return error('Not found', 404);
  if (meta.deleted_at) return error('Already deleted', 410);

  const role = await getPackRole(env, meta.pack_id, user.id, user.email);
  const isUploader = meta.uploader_user_id === user.id;
  if (!isUploader && !can(role, 'remove_users')) return error('No permission', 403);

  // Soft delete + R2 delete + decrement quota
  try { await env.MEDIA_BUCKET.delete(meta.r2_key); } catch (e) {}
  await env.DB.prepare('UPDATE media_files SET deleted_at = ? WHERE id = ?').bind(Date.now(), id).run();
  await env.DB.prepare('UPDATE users SET storage_used_bytes = MAX(0, storage_used_bytes - ?) WHERE id = ?').bind(meta.size_bytes, user.id).run();
  await logActivity(env, meta.pack_id, user, 'delete_media', id.slice(0,8));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
