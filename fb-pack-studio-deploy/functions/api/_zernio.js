// V12 — Zernio API helper module
// Docs: https://docs.zernio.com — base URL https://zernio.com/api/v1
// Auth: Authorization: Bearer sk_<64hex>

const ZERNIO_BASE = 'https://zernio.com/api/v1';

export async function getZernioKey(env, userId) {
  const u = await env.DB.prepare('SELECT zernio_api_key FROM users WHERE id = ?').bind(userId).first();
  if (!u?.zernio_api_key) {
    const err = new Error('Zernio chưa được kết nối. Vào Settings → paste API key.');
    err.status = 401;
    throw err;
  }
  return u.zernio_api_key;
}

/** Generic GET wrapper */
export async function zernioGet(apiKey, path, query) {
  const url = new URL(ZERNIO_BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) {
    const err = new Error(body?.message || body?.error || `Zernio ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Generic PATCH wrapper — V14.35 for ads pause/resume/edit */
export async function zernioPatch(apiKey, path, payload) {
  const r = await fetch(ZERNIO_BASE + path, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) {
    const err = new Error(body?.message || body?.error || `Zernio PATCH ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Generic DELETE wrapper — V14.33 for cancel scheduled posts */
export async function zernioDelete(apiKey, path) {
  const r = await fetch(ZERNIO_BASE + path, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) {
    const err = new Error(body?.message || body?.error || `Zernio DELETE ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Generic POST wrapper */
export async function zernioPost(apiKey, path, payload) {
  const r = await fetch(ZERNIO_BASE + path, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) {
    const err = new Error(body?.message || body?.error || `Zernio ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Validate API key by hitting /accounts. Returns true/false + accounts grouped by platform. */
// V14.25 — Multi-platform: now returns both FB and TikTok account lists
export async function zernioValidateKey(apiKey) {
  try {
    const r = await zernioGet(apiKey, '/accounts');
    const accs = r.accounts || r.data || r || [];
    const list = Array.isArray(accs) ? accs : [];
    const fb = list.filter(a => (a.platform || '').toLowerCase() === 'facebook');
    const tt = list.filter(a => (a.platform || '').toLowerCase() === 'tiktok');
    return { ok: true, accounts: list, facebook_accounts: fb, tiktok_accounts: tt };
  } catch (e) {
    return { ok: false, error: e.message, status: e.status };
  }
}

/** Stage media bytes in R2 → return PUBLIC URL Zernio can fetch.
    Zernio's REST API doesn't expose an upload endpoint — only accepts public URLs in mediaItems[].url.
    We stage in our R2 bucket MEDIA and serve via /m/:key (public, no auth, range-supported). */
export async function stageMediaToR2(env, request, userId, { filename, mime, bytes }) {
  if (!env.MEDIA) throw new Error('R2 MEDIA binding chưa cấu hình. Cloudflare Pages → Settings → Functions → R2 bindings: variable=MEDIA, bucket=fb-pack-studio-media');

  const ext = (filename || '').match(/\.([a-z0-9]+)$/i)?.[1] || (mime.includes('video') ? 'mp4' : mime.includes('png') ? 'png' : 'jpg');
  const key = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2,10)}.${ext}`;

  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: mime },
    customMetadata: {
      user_id: userId,
      original_filename: (filename || '').slice(0, 200),
      uploaded_at: String(Date.now())
    }
  });

  const origin = new URL(request.url).origin;
  return { key, url: `${origin}/m/${key}`, mime };
}

/** Build POST /posts payload — Facebook OR TikTok target.
    V14.25 — Multi-platform: pass platform='facebook' (default) or 'tiktok'.
    TikTok requires video media; caller should validate before calling.
    Modes: publishNow=true, scheduledFor=ISO (with timezone), else draft. */
export function buildPostBody({ content, accountId, mediaUrls, mediaType, scheduledFor, timezone, publishNow, platform }) {
  const plat = (platform || 'facebook').toLowerCase();
  const body = {
    content: content || '',
    platforms: [{ platform: plat, accountId }],
  };
  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    body.mediaItems = mediaUrls.map(u => ({
      type: (mediaType === 'video' || (u.mime || '').startsWith('video')) ? 'video' : 'image',
      url: u.url || u
    }));
  }
  if (scheduledFor) {
    body.scheduledFor = scheduledFor;       // ISO 8601 local datetime, paired with timezone (IANA)
    body.timezone = timezone || 'Asia/Ho_Chi_Minh';
  } else if (publishNow) {
    body.publishNow = true;
  }
  return body;
}

/** V14.25 — Helper: TikTok content must be video (image-only posts not allowed) */
export function validatePlatformMedia(platform, mediaUrls, mediaType) {
  const plat = (platform || 'facebook').toLowerCase();
  if (plat === 'tiktok') {
    if (!mediaUrls || mediaUrls.length === 0) {
      return { ok: false, error: 'TikTok cần ít nhất 1 video — không hỗ trợ post chỉ caption.' };
    }
    const hasVideo = mediaType === 'video' || mediaUrls.some(u => (u.mime || '').startsWith('video') || /\.(mp4|mov|webm)$/i.test(u.url || u || ''));
    if (!hasVideo) {
      return { ok: false, error: 'TikTok chỉ nhận video MP4/MOV/WebM — không hỗ trợ ảnh tĩnh. Xuất Studio MP4 trước rồi publish.' };
    }
  }
  return { ok: true };
}

/** Convert base64 data URL or raw base64 → Uint8Array bytes */
export function base64ToBytes(b64) {
  // Strip data URL prefix if present
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
