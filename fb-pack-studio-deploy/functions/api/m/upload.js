import { json, error, getCurrentUser } from '../../_utils.js';

/* POST /api/m/upload
   Body: { filename, mime, base64 }  (base64 may include data URL prefix)
   Stores in R2 binding MEDIA → returns { id, url } for public access.
   Used to stage media for Zernio publish since Zernio only accepts public URLs. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  if (!env.MEDIA) {
    return error('R2 binding MEDIA chưa cấu hình. Vào Cloudflare Pages → Settings → Functions → Bindings → R2 → Add: variable MEDIA, bucket fb-pack-studio-media', 503);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }
  const { filename, mime, base64 } = body;
  if (!base64) return error('Missing base64');
  if (!mime) return error('Missing mime');

  // Decode base64
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  let bytes;
  try {
    const bin = atob(clean);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) {
    return error('Invalid base64: ' + e.message, 400);
  }

  // Size guard (Zernio supports up to 5GB but we cap to 100MB per file from app)
  const MAX_SIZE = 100 * 1024 * 1024;
  if (bytes.length > MAX_SIZE) return error(`File too large: ${bytes.length} bytes (max 100MB)`, 413);

  // Generate ID
  const ext = (filename || '').match(/\.([a-z0-9]+)$/i)?.[1] || (mime.includes('video') ? 'mp4' : mime.includes('png') ? 'png' : 'jpg');
  const id = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2,10)}.${ext}`;

  // Upload to R2
  try {
    await env.MEDIA.put(id, bytes, {
      httpMetadata: { contentType: mime },
      customMetadata: {
        user_id: user.id,
        original_filename: (filename || '').slice(0, 200),
        uploaded_at: String(Date.now())
      }
    });
  } catch (e) {
    return error('R2 upload failed: ' + e.message, 502);
  }

  // Public URL via our /m/:id endpoint
  const url = new URL(request.url);
  const publicUrl = `${url.origin}/m/${encodeURIComponent(id)}`;

  return json({ id, url: publicUrl, size: bytes.length, mime });
}
