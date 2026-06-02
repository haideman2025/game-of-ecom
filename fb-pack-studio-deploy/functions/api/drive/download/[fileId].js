import { error, getCurrentUser } from '../../../_utils.js';
import { getPackRole, can } from '../../../_permissions.js';
import { getDriveAccessToken, driveDownloadFile } from '../../../_drive.js';

/* GET /api/drive/download/:fileId — proxy Drive download with permission check */
export async function onRequestGet({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const driveFileId = params.fileId;
  // Look up metadata to check permission
  const meta = await env.DB.prepare(
    `SELECT pack_id, mime, size_bytes, deleted_at, filename FROM drive_files WHERE drive_file_id = ?`
  ).bind(driveFileId).first();
  if (!meta) return error('Not found', 404);
  if (meta.deleted_at) return error('Deleted', 410);

  const role = await getPackRole(env, meta.pack_id, user.id, user.email);
  if (!can(role, 'download_media')) return error('No access', 403);

  // Get Drive access token (use uploader's token? or current user's?)
  // V11: use CURRENT user's token. Drive scope `drive.file` only sees files the app created
  // for that user. Collaborators using the same app see shared folder files.
  // Actually: drive.file scope is per-user. To share, owner must publicly share the folder OR
  // we use the owner's token to proxy reads. We'll use the OWNER's token (file uploader_user_id).
  // SAFER: use the owner's refresh token to fetch.
  const ownerRow = await env.DB.prepare(
    `SELECT uploader_user_id FROM drive_files WHERE drive_file_id = ?`
  ).bind(driveFileId).first();
  const tokenUserId = ownerRow?.uploader_user_id || user.id;

  let accessToken;
  try {
    accessToken = await getDriveAccessToken(env, tokenUserId);
  } catch (e) {
    return error(e.message, e.status || 500);
  }

  let driveRes;
  try {
    driveRes = await driveDownloadFile(accessToken, driveFileId);
  } catch (e) {
    return error(`Drive download: ${e.message}`, 502);
  }

  return new Response(driveRes.body, {
    headers: {
      'Content-Type': meta.mime,
      'Content-Length': String(meta.size_bytes),
      'Cache-Control': 'private, max-age=3600'
    }
  });
}

/* DELETE /api/drive/download/:fileId — remove from Drive + D1 (soft delete) */
export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const driveFileId = params.fileId;
  const meta = await env.DB.prepare(
    `SELECT id, pack_id, uploader_user_id, deleted_at FROM drive_files WHERE drive_file_id = ?`
  ).bind(driveFileId).first();
  if (!meta) return error('Not found', 404);
  if (meta.deleted_at) return error('Already deleted', 410);

  const role = await getPackRole(env, meta.pack_id, user.id, user.email);
  const isUploader = meta.uploader_user_id === user.id;
  if (!isUploader && !can(role, 'remove_users')) return error('No permission', 403);

  // Soft delete in D1
  await env.DB.prepare('UPDATE drive_files SET deleted_at = ? WHERE id = ?').bind(Date.now(), meta.id).run();

  // Try delete from Drive (best effort)
  try {
    const { driveDeleteFile } = await import('../../../_drive.js');
    const accessToken = await getDriveAccessToken(env, meta.uploader_user_id);
    await driveDeleteFile(accessToken, driveFileId);
  } catch (e) { console.warn('Drive delete failed (file still in D1):', e.message); }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}
