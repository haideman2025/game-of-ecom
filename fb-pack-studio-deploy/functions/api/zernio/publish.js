import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';
import {
  getZernioKey, zernioPost, zernioGet, stageMediaToR2, buildPostBody, base64ToBytes, validatePlatformMedia
} from '../_zernio.js';

/* POST /api/zernio/publish
   Body: {
     pack_id, post_n,
     content,                              -- caption text
     media: [{ filename, mime, base64 }],  -- inline bytes → staged in R2 as public URL
     external_urls: [string],              -- already-public URLs (Drive direct, CDN, etc.) → passed directly
     media_type?: 'image' | 'video',
     scheduled_for?: 'YYYY-MM-DDTHH:MM:SS', -- local time (no Z)
     timezone?: 'Asia/Ho_Chi_Minh',
     account_id?: <override>
   }
   Returns: { zernio_post_id, status, scheduled_for? } */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const {
    pack_id, post_n, content,
    media = [], external_urls = [],
    media_type, scheduled_for, timezone, account_id,
    platform: platformOverride // V14.25 — optional explicit platform ('facebook' | 'tiktok')
  } = body;

  if (!pack_id || post_n == null) return error('Missing pack_id / post_n');
  if (!content && media.length === 0 && external_urls.length === 0) {
    return error('Phải có caption hoặc media (inline) hoặc external_urls', 400);
  }

  try { await requireCap(env, pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Zernio config
  // V12.10 — Account resolution chain: body override → pack-bound → user default
  let apiKey, packAccountId, userDefaultAccountId;
  try {
    apiKey = await getZernioKey(env, user.id);
    const u = await env.DB.prepare('SELECT zernio_account_id FROM users WHERE id = ?').bind(user.id).first();
    userDefaultAccountId = u?.zernio_account_id;
    const p = await env.DB.prepare('SELECT zernio_account_id FROM packs WHERE id = ?').bind(pack_id).first();
    packAccountId = p?.zernio_account_id;
  } catch (e) { return error(e.message, e.status || 401); }

  const accountId = account_id || packAccountId || userDefaultAccountId;
  if (!accountId) return error('Chưa chọn FB account — bind pack với account trong Projects modal hoặc set user default trong Profile', 400);
  const accountSource = account_id ? 'body-override' : packAccountId ? 'pack-bound' : 'user-default';

  // Collect final mediaItems
  const mediaUrls = [];
  const stagingErrors = [];

  // 1. External URLs (skip staging — assume already public)
  for (const u of external_urls) {
    if (!u || typeof u !== 'string') continue;
    if (!/^https?:\/\//i.test(u)) { stagingErrors.push(`Invalid external URL: ${u.slice(0,60)}`); continue; }
    // Refuse known-bad hosts
    if (/drive\.google\.com\/(file|open|uc)/i.test(u) || /dropbox\.com/i.test(u)) {
      stagingErrors.push(`URL không dùng được trực tiếp (Drive/Dropbox trả HTML): ${u.slice(0,60)}. Hãy chọn 'Stage to R2' thay vì paste URL Drive.`);
      continue;
    }
    mediaUrls.push({ url: u, mime: media_type === 'video' ? 'video/mp4' : 'image/jpeg' });
  }

  // 2. Inline media — stage to R2
  if (Array.isArray(media) && media.length > 0) {
    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      try {
        if (!m.base64) { stagingErrors.push(`media[${i}] thiếu base64`); continue; }
        const bytes = base64ToBytes(m.base64);
        const filename = m.filename || `post_${post_n}_${i}.${(m.mime || '').includes('video') ? 'mp4' : 'jpg'}`;
        const staged = await stageMediaToR2(env, request, user.id, { filename, mime: m.mime || 'image/jpeg', bytes });
        mediaUrls.push({ url: staged.url, mime: m.mime });
      } catch (e) {
        stagingErrors.push(`media[${i}]: ${e.message.slice(0, 200)}`);
      }
    }
  }

  if ((media.length + external_urls.length) > 0 && mediaUrls.length === 0) {
    return error('Không có media nào hợp lệ: ' + stagingErrors.join('; '), 502);
  }

  // Build Zernio /posts payload
  const detectedType = (media_type || (mediaUrls.some(u => (u.mime || '').startsWith('video')) ? 'video' : 'image'));

  // V14.25 — Resolve platform: explicit override → look up the selected account's platform on Zernio
  let resolvedPlatform = (platformOverride || '').toLowerCase();
  if (!resolvedPlatform) {
    try {
      const r = await zernioGet(apiKey, '/accounts');
      const list = r.accounts || r.data || r || [];
      const acc = (Array.isArray(list) ? list : []).find(a => (a._id || a.id) === accountId);
      resolvedPlatform = (acc?.platform || 'facebook').toLowerCase();
    } catch (e) {
      resolvedPlatform = 'facebook'; // fall back
    }
  }

  // V14.25 — Validate TikTok media requirements
  const valid = validatePlatformMedia(resolvedPlatform, mediaUrls, detectedType);
  if (!valid.ok) return error(valid.error, 400);

  const payload = buildPostBody({
    content, accountId, mediaUrls, mediaType: detectedType,
    scheduledFor: scheduled_for,
    timezone: timezone || 'Asia/Ho_Chi_Minh',
    publishNow: !scheduled_for,
    platform: resolvedPlatform
  });

  let postResp;
  try {
    postResp = await zernioPost(apiKey, '/posts', payload);
  } catch (e) {
    return error('Zernio /posts failed: ' + e.message, e.status || 502);
  }

  // V12.1.2 — Try many common response shapes for Zernio post ID
  const zernioPostId =
    postResp._id || postResp.id || postResp.postId || postResp.post_id ||
    postResp.data?._id || postResp.data?.id || postResp.data?.postId ||
    postResp.post?._id || postResp.post?.id ||
    postResp.result?._id || postResp.result?.id ||
    (Array.isArray(postResp.posts) && (postResp.posts[0]?._id || postResp.posts[0]?.id)) ||
    (Array.isArray(postResp.data) && (postResp.data[0]?._id || postResp.data[0]?.id));
  if (!zernioPostId) {
    // Return the raw response so we can see what Zernio actually sent
    return new Response(JSON.stringify({
      error: 'Zernio response missing post id — đây là response gốc, gửi t để debug',
      raw_response: postResp,
      payload_sent: { ...payload, content: payload.content?.slice(0, 100) + '...' }
    }, null, 2), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  // Persist
  const now = Date.now();
  const rowId = `sp_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const scheduledMs = scheduled_for ? new Date(scheduled_for.replace(' ', 'T') + (scheduled_for.endsWith('Z') ? '' : '+07:00')).getTime() : null;
  try {
    await env.DB.prepare(
      `INSERT INTO scheduled_posts
        (id, pack_id, post_n, user_id, zernio_post_id, zernio_account_id,
         status, scheduled_for, content_snapshot, media_count, media_type,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      rowId, pack_id, post_n, user.id, zernioPostId, accountId,
      scheduled_for ? 'scheduled' : 'pending',
      scheduledMs, (content || '').slice(0, 4000), mediaUrls.length, detectedType,
      now, now
    ).run();
  } catch (e) { console.warn('scheduled_posts insert failed:', e.message); }

  return json({
    ok: true,
    zernio_post_id: zernioPostId,
    status: scheduled_for ? 'scheduled' : (postResp.status || 'publishing'),
    scheduled_for: scheduled_for || null,
    media_uploaded: mediaUrls.length,
    media_urls: mediaUrls.map(m => m.url),
    staging_errors: stagingErrors,
    row_id: rowId,
    account_id: accountId,
    account_source: accountSource,
    platform: resolvedPlatform  // V14.25
  });
}
