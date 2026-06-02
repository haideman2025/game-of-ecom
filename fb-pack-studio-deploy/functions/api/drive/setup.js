import { json, error, getCurrentUser } from '../../_utils.js';
import { getDriveAccessToken, driveEnsureFolder } from '../../_drive.js';

/* POST /api/drive/setup
   Body: { packId?: string }
   - If packId: ensure pack subfolder exists, return its id
   - If no packId: ensure root "FB Pack Studio" folder exists
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}

  let accessToken;
  try {
    accessToken = await getDriveAccessToken(env, user.id);
  } catch (e) {
    return error(e.message, e.status || 500);
  }

  // 1. Ensure root folder
  const userRow = await env.DB.prepare('SELECT drive_root_folder_id FROM users WHERE id = ?').bind(user.id).first();
  let rootId = userRow?.drive_root_folder_id;
  let rootFolder;
  if (!rootId) {
    rootFolder = await driveEnsureFolder(accessToken, 'FB Pack Studio');
    rootId = rootFolder.id;
    await env.DB.prepare('UPDATE users SET drive_root_folder_id = ?, drive_connected_at = ? WHERE id = ?')
      .bind(rootId, Date.now(), user.id).run();
  } else {
    // Verify still exists (might have been deleted by user)
    try {
      rootFolder = await driveEnsureFolder(accessToken, 'FB Pack Studio');
      if (rootFolder.id !== rootId) {
        rootId = rootFolder.id;
        await env.DB.prepare('UPDATE users SET drive_root_folder_id = ? WHERE id = ?').bind(rootId, user.id).run();
      }
    } catch (e) {
      // Re-create if missing
      rootFolder = await driveEnsureFolder(accessToken, 'FB Pack Studio');
      rootId = rootFolder.id;
      await env.DB.prepare('UPDATE users SET drive_root_folder_id = ? WHERE id = ?').bind(rootId, user.id).run();
    }
  }

  // 2. If packId specified, ensure pack subfolder
  let packFolder = null;
  if (body.packId) {
    const pack = await env.DB.prepare('SELECT id, name, drive_folder_id, user_id FROM packs WHERE id = ?').bind(body.packId).first();
    if (!pack) return error('Pack not found', 404);
    // Only owner can setup Drive folder
    if (pack.user_id !== user.id) {
      // Check if user has admin/editor role to read
      const role = await env.DB.prepare(
        `SELECT role FROM pack_shares WHERE pack_id = ? AND collaborator_user_id = ? AND accepted_at IS NOT NULL`
      ).bind(body.packId, user.id).first();
      if (!role) return error('No access', 403);
    }
    const packName = (pack.name || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    packFolder = await driveEnsureFolder(accessToken, packName, rootId);
    if (pack.drive_folder_id !== packFolder.id) {
      await env.DB.prepare('UPDATE packs SET drive_folder_id = ? WHERE id = ?').bind(packFolder.id, body.packId).run();
    }
  }

  return json({
    ok: true,
    rootFolder: rootFolder ? { id: rootFolder.id, webViewLink: rootFolder.webViewLink } : null,
    packFolder: packFolder ? { id: packFolder.id, webViewLink: packFolder.webViewLink } : null
  });
}

/* GET /api/drive/setup — check connection status */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const u = await env.DB.prepare('SELECT drive_refresh_token, drive_root_folder_id, drive_connected_at FROM users WHERE id = ?').bind(user.id).first();
  return json({
    connected: !!u?.drive_refresh_token,
    rootFolderId: u?.drive_root_folder_id || null,
    connectedAt: u?.drive_connected_at || null
  });
}
