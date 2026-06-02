import { json, error, getCurrentUser } from '../../_utils.js';
import { stageMediaToR2, base64ToBytes } from '../_zernio.js';

/* V14.36 — POST /api/media/stage
   Stage base64 image/video bytes into R2 → return PUBLIC URL.
   Used by CreateAdModal to upload current post image as ad creative source.

   Body: { filename, mime, base64 }
   Returns: { ok, key, url, mime }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { filename, mime, base64 } = body;
  if (!base64) return error('Missing base64', 400);

  try {
    const bytes = base64ToBytes(base64);
    const result = await stageMediaToR2(env, request, user.id, {
      filename: filename || 'ad_creative.png',
      mime: mime || 'image/png',
      bytes
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return error('Stage fail: ' + e.message, 502);
  }
}
