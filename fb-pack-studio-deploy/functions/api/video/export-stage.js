import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* POST /api/video/export-stage
   Body: { project_id?, pack_id, filename?, base64, mime? }
   Streams MP4 bytes to R2 binding MEDIA → returns { url, key, size }.
   If project_id provided, also updates video_projects.exported_* fields.
   This is the bridge between client-side MP4 export (WebCodecs+mp4-muxer)
   and Zernio publish (which requires public URL). */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  if (!env.MEDIA) {
    return error('R2 binding MEDIA chưa cấu hình', 503);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }
  const { project_id, pack_id, filename, base64, mime = 'video/mp4' } = body;
  if (!pack_id) return error('Missing pack_id');
  if (!base64) return error('Missing base64');

  try { await requireCap(env, pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Decode base64 → bytes (chunk-safe for large payloads)
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  let bytes;
  try {
    const bin = atob(clean);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) {
    return error('Invalid base64: ' + e.message, 400);
  }

  // Cap 200MB (Cloudflare Workers req body limit ~ 100MB free, 500MB paid)
  const MAX = 200 * 1024 * 1024;
  if (bytes.length > MAX) return error(`MP4 too large: ${(bytes.length/1024/1024).toFixed(1)}MB. Max 200MB. Hạ resolution hoặc cắt ngắn timeline.`, 413);

  const safeName = (filename || 'studio_export.mp4').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const key = `${user.id}/studio/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${safeName}`;

  try {
    await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: mime },
      customMetadata: {
        user_id: user.id,
        pack_id,
        project_id: project_id || '',
        original_filename: safeName,
        uploaded_at: String(Date.now()),
        source: 'video_studio'
      }
    });
  } catch (e) {
    return error('R2 upload failed: ' + e.message, 502);
  }

  const url = new URL(request.url);
  const publicUrl = `${url.origin}/m/${encodeURIComponent(key)}`;

  // Update project record if provided
  if (project_id) {
    try {
      await env.DB.prepare(
        `UPDATE video_projects SET exported_r2_key = ?, exported_url = ?, exported_size_bytes = ?, exported_at = ?, updated_at = ?
         WHERE id = ? AND pack_id = ?`
      ).bind(key, publicUrl, bytes.length, Date.now(), Date.now(), project_id, pack_id).run();
    } catch (e) {}
  }

  return json({
    ok: true,
    url: publicUrl,
    key,
    size: bytes.length,
    mime
  });
}
