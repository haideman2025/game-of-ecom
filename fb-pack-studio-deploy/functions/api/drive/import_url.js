import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';
import { getDriveAccessToken, driveDownloadFile } from '../../_drive.js';

/* POST /api/drive/import_url
   Body: { url_or_id, pack_id, post_n?, asset_type? }
   Imports an arbitrary Drive file (user uploaded outside of app) into IDB.
   Bypasses scan_finals when user knows the exact file. Returns base64 + metadata. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { url_or_id, pack_id, post_n, asset_type } = body;
  if (!url_or_id) return error('Missing url_or_id');
  if (!pack_id) return error('Missing pack_id');

  // Permission check
  try { await requireCap(env, pack_id, user, 'upload_media'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Extract Drive file ID from URL or use as-is
  const fileId = extractDriveFileId(url_or_id);
  if (!fileId) return error('Không parse được Drive file ID từ URL. Dùng URL dạng "drive.google.com/file/d/FILE_ID/..." hoặc paste ID trực tiếp.', 400);

  // Get user's Drive token
  let accessToken;
  try { accessToken = await getDriveAccessToken(env, user.id); }
  catch (e) { return error(`Drive auth: ${e.message}. Sign out + sign in lại với full Drive scope.`, e.status || 401); }

  // Fetch metadata first
  let meta;
  try {
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,parents,webViewLink,createdTime`;
    const r = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!r.ok) {
      const text = await r.text();
      return error(`Drive metadata fetch failed (${r.status}): ${text.slice(0, 200)}. File có thể không tồn tại hoặc account không có quyền.`, r.status);
    }
    meta = await r.json();
  } catch (e) { return error('Drive metadata: ' + e.message, 502); }

  // Refuse folders
  if (meta.mimeType === 'application/vnd.google-apps.folder') {
    return error('URL là folder — cần URL file MP4/JPG cụ thể (click vào file → Share → Copy link).', 400);
  }

  // Size limit (Cloudflare Workers 100MB limit per response)
  const sizeBytes = parseInt(meta.size) || 0;
  if (sizeBytes > 90 * 1024 * 1024) {
    return error(`File ${(sizeBytes/1024/1024).toFixed(1)}MB quá lớn (Workers limit 90MB). Upload trực tiếp lên app thay vì qua Drive proxy.`, 413);
  }

  // Download bytes
  let bytes;
  try {
    const dlRes = await driveDownloadFile(accessToken, fileId);
    const buf = await dlRes.arrayBuffer();
    bytes = new Uint8Array(buf);
  } catch (e) { return error('Drive download: ' + e.message, 502); }

  // Encode base64
  const base64 = bytesToBase64(bytes);

  // Detect asset type from MIME if not provided
  let type = asset_type;
  if (!type) {
    if (meta.mimeType?.startsWith('video/')) type = 'final_video';
    else if (meta.mimeType?.startsWith('image/')) type = 'image';
    else if (meta.mimeType?.startsWith('audio/')) type = 'audio';
    else type = 'asset';
  }

  // Register in drive_files (best-effort, may fail if schema mismatch)
  try {
    const dfId = `df_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO drive_files
        (id, pack_id, post_n, asset_type, drive_file_id, filename, mime, size_bytes, uploader_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      dfId, pack_id, post_n || null, type,
      fileId, meta.name || `drive_${fileId}.bin`, meta.mimeType || 'application/octet-stream',
      sizeBytes, user.id, Date.now()
    ).run();
  } catch (e) { /* non-fatal */ }

  return json({
    ok: true,
    drive_file_id: fileId,
    filename: meta.name,
    mime: meta.mimeType,
    size: sizeBytes,
    type,
    base64,
    web_link: meta.webViewLink,
    created_time: meta.createdTime
  });
}

function extractDriveFileId(s) {
  s = (s || '').trim();
  // Already an ID? (alphanumeric + - _ + 25+ chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  // Various Drive URL patterns:
  // https://drive.google.com/file/d/FILE_ID/view
  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?id=FILE_ID&export=...
  // https://docs.google.com/file/d/FILE_ID/
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return null;
}

function bytesToBase64(bytes) {
  // Chunked btoa to avoid stack overflow on big arrays
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
