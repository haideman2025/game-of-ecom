import { json, error, getCurrentUser, uuid } from '../../_utils.js';
import { requireCap, logActivity } from '../../_permissions.js';
import { getDriveAccessToken, driveEnsureFolder, driveUploadFile } from '../../_drive.js';

/* POST /api/drive/upload — multipart form
   Required: file, pack_id, asset_type
   Optional: post_n, scene_n, sequence_n, from_scene_n, to_scene_n, source, time_range, prompt, brand_name
   Returns: { ok, id, drive_file_id, web_link, size }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const form = await request.formData();
  const file = form.get('file');
  const packId = form.get('pack_id');
  const assetType = form.get('asset_type');
  if (!file || !packId || !assetType) return error('Missing file/pack_id/asset_type');

  // Permission: editor+ to upload
  try {
    await requireCap(env, packId, user, 'upload_media');
  } catch (e) {
    return error(e.message, e.status || 403);
  }

  // Get Drive access token
  let accessToken;
  try {
    accessToken = await getDriveAccessToken(env, user.id);
  } catch (e) {
    return error(e.message, e.status || 500);
  }

  // Ensure root + pack folder exist
  const userRow = await env.DB.prepare('SELECT drive_root_folder_id FROM users WHERE id = ?').bind(user.id).first();
  let rootId = userRow?.drive_root_folder_id;
  if (!rootId) {
    const root = await driveEnsureFolder(accessToken, 'FB Pack Studio');
    rootId = root.id;
    await env.DB.prepare('UPDATE users SET drive_root_folder_id = ?, drive_connected_at = ? WHERE id = ?').bind(rootId, Date.now(), user.id).run();
  }

  const pack = await env.DB.prepare('SELECT id, name, drive_folder_id FROM packs WHERE id = ?').bind(packId).first();
  if (!pack) return error('Pack not found', 404);
  let packFolderId = pack.drive_folder_id;
  if (!packFolderId) {
    const packName = (pack.name || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    const folder = await driveEnsureFolder(accessToken, packName, rootId);
    packFolderId = folder.id;
    await env.DB.prepare('UPDATE packs SET drive_folder_id = ? WHERE id = ?').bind(packFolderId, packId).run();
  }

  // V11.1 — DEDUPE: check if content_hash already exists (skip upload, return existing)
  const contentHash = form.get('content_hash');
  if (contentHash) {
    const existing = await env.DB.prepare(
      `SELECT id, drive_file_id, drive_web_link, filename, size_bytes FROM drive_files
       WHERE pack_id = ? AND content_hash = ? AND deleted_at IS NULL LIMIT 1`
    ).bind(packId, contentHash).first();
    if (existing) {
      return json({
        ok: true,
        deduped: true,
        id: existing.id,
        drive_file_id: existing.drive_file_id,
        web_link: existing.drive_web_link,
        size: existing.size_bytes,
        filename: existing.filename,
        downloadUrl: `/api/drive/download/${existing.drive_file_id}`
      });
    }
  }

  // V11.2 — Folder hierarchy mirror app structure: Pack / Pillar / Day-Post / [storyboard|videos]
  const PILLAR_NAMES = {
    1: 'Pillar 1 - Awareness',
    2: 'Pillar 2 - Consideration',
    3: 'Pillar 3 - Conversion',
  };

  const pillarN = pi(form.get('pillar_n'));
  const dayN = pi(form.get('day_n'));
  const postN = pi(form.get('post_n'));

  // Determine target folder structure
  let targetFolderId = packFolderId;
  let pillarFolderId = null;
  let postFolderId = null;

  // For mascot/product refs — go to "Brand Assets" folder (not tied to a post)
  if (assetType === 'mascot' || assetType === 'product') {
    const brandFolder = await driveEnsureFolder(accessToken, 'Brand Assets', packFolderId);
    targetFolderId = brandFolder.id;
  } else if (postN) {
    // Pillar folder (default to "Other" if no pillar)
    const pillarName = pillarN ? PILLAR_NAMES[pillarN] || `Pillar ${pillarN}` : 'Other';
    const pillarFolder = await driveEnsureFolder(accessToken, pillarName, packFolderId);
    pillarFolderId = pillarFolder.id;

    // Day-Post folder, vd "Day 01 - Post 01"
    const dayLabel = dayN ? `Day ${String(dayN).padStart(2,'0')}` : `Day --`;
    const postLabel = `Post ${String(postN).padStart(2,'0')}`;
    const postFolderName = `${dayLabel} - ${postLabel}`;
    const postFolder = await driveEnsureFolder(accessToken, postFolderName, pillarFolder.id);
    postFolderId = postFolder.id;

    // V11.3 — Auto-create "Video Final" subfolder when post folder is touched
    // User can upload finished video here directly via Drive UI; app will scan + import
    try {
      await driveEnsureFolder(accessToken, 'Video Final', postFolder.id);
    } catch (e) { /* non-fatal */ }

    // For storyboard scenes / chain videos / final videos — sub-subfolder
    if (assetType === 'storyboard') {
      const sceneFolder = await driveEnsureFolder(accessToken, 'storyboard scenes', postFolder.id);
      targetFolderId = sceneFolder.id;
    } else if (assetType === 'final_video') {
      // V11.3 — upload to Video Final folder (when app exports final via Cinema)
      const finalFolder = await driveEnsureFolder(accessToken, 'Video Final', postFolder.id);
      targetFolderId = finalFolder.id;
    } else if (assetType === 'video') {
      // Single videos (chain) go to "videos/" subfolder
      const videoFolder = await driveEnsureFolder(accessToken, 'videos', postFolder.id);
      targetFolderId = videoFolder.id;
    } else {
      // image, audio → direct in post folder
      targetFolderId = postFolder.id;
    }
  }

  // Reserve ID early for filename context
  const id = uuid();
  const shortId = id.slice(0, 6);

  // V11.2 — Build short descriptive filename (since folder already provides context)
  const ext = (file.type || 'application/octet-stream').split('/')[1] || 'bin';
  let filename;
  if (assetType === 'image') filename = `image.${ext}`;
  else if (assetType === 'audio') filename = `voice.${ext}`;
  else if (assetType === 'storyboard') {
    const sN = form.get('scene_n');
    const tR = form.get('time_range');
    filename = `scene_${String(sN || '?').padStart(2,'0')}${tR ? '_' + tR.replace(/[^0-9.-]/g, '') : ''}.${ext}`;
  }
  else if (assetType === 'video') {
    const seqN = form.get('sequence_n');
    const fromS = form.get('from_scene_n'), toS = form.get('to_scene_n');
    const range = (fromS && toS) ? `_scene${fromS}-${toS}` : '';
    filename = `clip_${String(seqN || '?').padStart(2,'0')}${range}.${ext}`;
  }
  else if (assetType === 'mascot') filename = `mascot_${shortId}.${ext}`;
  else if (assetType === 'product') filename = `product_${shortId}.${ext}`;
  else filename = `${assetType}_${Date.now().toString(36)}.${ext}`;

  // Upload to determined target folder
  let driveFile;
  try {
    driveFile = await driveUploadFile(accessToken, {
      name: filename,
      mime: file.type || 'application/octet-stream',
      body: file,
      parentId: targetFolderId
    });
  } catch (e) {
    return error(`Drive upload: ${e.message}`, 502);
  }

  // Save to D1 (id already declared above) — V11.2 with defensive fallback if newer columns missing
  const fullInsertSql = `INSERT INTO drive_files (id, pack_id, uploader_user_id, drive_file_id, drive_web_link, asset_type,
       post_n, scene_n, sequence_n, from_scene_n, to_scene_n, source, time_range, prompt, filename,
       size_bytes, mime, brand_name, created_at, content_hash, day_folder, type_folder_id,
       pillar_n, day_n, pillar_folder_id, post_folder_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const baseValues = [
    id, packId, user.id, driveFile.id, driveFile.webViewLink || null, assetType,
    postN, pi(form.get('scene_n')), pi(form.get('sequence_n')),
    pi(form.get('from_scene_n')), pi(form.get('to_scene_n')),
    form.get('source') || null,
    form.get('time_range') || null,
    (form.get('prompt') || '').slice(0, 500) || null,
    filename,
    file.size, file.type || 'application/octet-stream',
    form.get('brand_name') || null,
    Date.now()
  ];

  try {
    await env.DB.prepare(fullInsertSql).bind(
      ...baseValues,
      contentHash || null, null, targetFolderId,
      pillarN, dayN, pillarFolderId, postFolderId
    ).run();
  } catch (e) {
    // V11.2 fallback: schema v11.1/v11.2 chưa apply — fall back to base columns only
    console.warn('[Drive upload] INSERT full schema failed, falling back to base:', e.message);
    try {
      await env.DB.prepare(
        `INSERT INTO drive_files (id, pack_id, uploader_user_id, drive_file_id, drive_web_link, asset_type,
           post_n, scene_n, sequence_n, from_scene_n, to_scene_n, source, time_range, prompt, filename,
           size_bytes, mime, brand_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(...baseValues).run();
    } catch (e2) {
      // If base also fails, the table itself might be missing
      console.error('[Drive upload] base INSERT also failed:', e2.message);
      return error(`D1 schema error: ${e2.message}. Run schema_v11_drive.sql first.`, 500);
    }
  }

  await logActivity(env, packId, user, 'upload_media_drive', `${assetType}_p${postN || '?'}_d${dayN || '?'}`, { driveFileId: driveFile.id, size: file.size });

  return json({
    ok: true,
    id,
    drive_file_id: driveFile.id,
    web_link: driveFile.webViewLink,
    size: file.size,
    filename,
    pillar_n: pillarN,
    day_n: dayN,
    post_folder_id: postFolderId,
    downloadUrl: `/api/drive/download/${driveFile.id}`
  });
}

function pi(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}
