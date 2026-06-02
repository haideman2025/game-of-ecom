import { json, error, getCurrentUser } from '../../_utils.js';
import { getPackRole, can } from '../../_permissions.js';
import { getDriveAccessToken, driveListFolder } from '../../_drive.js';

/* POST /api/drive/scan_finals  body: { pack_id }
   Scans Drive for "Video Final" folders inside each post folder.
   Matches both "Video Final" (V11.10+ plain ASCII) and "🎬 Video Final" (legacy V11.3) via substring.
   For each video file found that's NOT yet in D1 → return for client to decide import.
   This lets user upload final videos via Drive UI, then app imports + displays them. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const packId = body.pack_id;
  if (!packId) return error('Missing pack_id');

  const role = await getPackRole(env, packId, user.id, user.email);
  if (!can(role, 'read_pack')) return error('No access', 403);

  // Get owner's Drive token (we scan owner's Drive)
  const pack = await env.DB.prepare('SELECT user_id, drive_folder_id FROM packs WHERE id = ?').bind(packId).first();
  if (!pack) return error('Pack not found', 404);

  // V11.5.1 — Soft handle: if pack chưa có drive_folder_id, return empty + hint
  if (!pack.drive_folder_id) {
    return json({
      total: 0, new: 0, already_imported: 0,
      new_videos: [], imported_videos: [],
      hint: 'Pack folder chưa được tạo trên Drive. Click "Init Folders" trước (tự động trong scan flow).'
    });
  }

  let accessToken;
  try {
    accessToken = await getDriveAccessToken(env, pack.user_id);
  } catch (e) {
    return error(e.message, e.status || 500);
  }

  // List all pillar subfolders under pack folder
  let pillarFolders = [];
  try {
    const all = await driveListFolder(accessToken, pack.drive_folder_id);
    pillarFolders = all.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  } catch (e) {
    return error(`List pack folder failed: ${e.message}`, 502);
  }

  const allFinalVideos = [];
  const errors = [];

  for (const pillarFolder of pillarFolders) {
    let postFolders;
    try {
      const all = await driveListFolder(accessToken, pillarFolder.id);
      postFolders = all.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    } catch (e) {
      errors.push(`List pillar ${pillarFolder.name}: ${e.message.slice(0,80)}`);
      continue;
    }

    for (const postFolder of postFolders) {
      const m = (postFolder.name || '').match(/Day\s+(\d+)\s*-\s*Post\s+(\d+)/i);
      if (!m) continue;
      const dayN = parseInt(m[1]);
      const postN = parseInt(m[2]);

      try {
        const subFolders = (await driveListFolder(accessToken, postFolder.id))
          .filter(f => f.mimeType === 'application/vnd.google-apps.folder' &&
            ((f.name || '').toLowerCase().includes('video final') || (f.name || '').toLowerCase().includes('final video')));

        for (const finalFolder of subFolders) {
          const files = (await driveListFolder(accessToken, finalFolder.id))
            .filter(f => f.mimeType?.includes('video') || /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name || ''));

          for (const file of files) {
            allFinalVideos.push({
              drive_file_id: file.id,
              filename: file.name,
              size: parseInt(file.size) || 0,
              mime: file.mimeType,
              web_link: file.webViewLink,
              created_time: file.createdTime,
              post_n: postN,
              day_n: dayN,
              pillar_folder: pillarFolder.name,
              post_folder: postFolder.name,
            });
          }
        }
      } catch (e) {
        errors.push(`Post ${postN}: ${e.message.slice(0,80)}`);
      }
    }
  }

  // Cross-check D1: which already imported?
  const existingIds = new Set();
  if (allFinalVideos.length > 0) {
    const placeholders = allFinalVideos.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT drive_file_id FROM drive_files WHERE pack_id = ? AND drive_file_id IN (${placeholders}) AND deleted_at IS NULL`
    ).bind(packId, ...allFinalVideos.map(v => v.drive_file_id)).all();
    (rows.results || []).forEach(r => existingIds.add(r.drive_file_id));
  }

  const newVideos = allFinalVideos.filter(v => !existingIds.has(v.drive_file_id));
  const alreadyImported = allFinalVideos.filter(v => existingIds.has(v.drive_file_id));

  return json({
    total: allFinalVideos.length,
    new: newVideos.length,
    already_imported: alreadyImported.length,
    new_videos: newVideos,
    imported_videos: alreadyImported,
    errors,
    pack_folder_id: pack.drive_folder_id,
    pack_web_link: `https://drive.google.com/drive/folders/${pack.drive_folder_id}`
  });
}
