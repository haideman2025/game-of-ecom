import { json, error, getCurrentUser, uuid } from '../../_utils.js';

/* POST /api/fb/publish
   Body: {
     caption: string,
     imageBase64?: string,    // base64 data (without data: prefix)
     imageMime?: string,
     videoBase64?: string,    // base64 video data
     videoMime?: string,
     firstComment?: string,   // auto-post as first comment
     scheduledFor?: number,   // ms timestamp; if set, schedule instead of publish
     packId?: string, postN?: number
   }
   Returns: { ok, fbPostId, permalink, logId }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const cred = await env.DB.prepare(
    'SELECT page_id, page_access_token FROM fb_credentials WHERE user_id = ?'
  ).bind(user.id).first();
  if (!cred) return error('Facebook not connected. Open Settings → Facebook Integration first.', 400);

  let body;
  try { body = await request.json(); } catch (e) { return error('Invalid JSON'); }
  const { caption, imageBase64, imageMime, videoBase64, videoMime, firstComment, scheduledFor, packId, postN } = body || {};
  if (!caption && !imageBase64 && !videoBase64) {
    return error('Need at least caption, image, or video');
  }

  const logId = uuid();
  const now = Date.now();
  const isScheduled = scheduledFor && scheduledFor > now + 600000; // FB minimum 10 min ahead

  // Log "pending" first
  await env.DB.prepare(
    `INSERT INTO fb_publish_log (id, user_id, pack_id, post_n, page_id, status, scheduled_for, caption, has_image, has_video, has_first_comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    logId, user.id, packId || null, postN || null, cred.page_id,
    isScheduled ? 'scheduled' : 'pending',
    isScheduled ? scheduledFor : null,
    caption?.slice(0, 5000) || '',
    imageBase64 ? 1 : 0,
    videoBase64 ? 1 : 0,
    firstComment ? 1 : 0,
    now
  ).run();

  try {
    let fbPostId, permalink;

    if (videoBase64) {
      // === Video post — use /{page-id}/videos endpoint ===
      const blob = base64ToBlob(videoBase64, videoMime || 'video/mp4');
      const fd = new FormData();
      fd.append('source', blob, 'video.mp4');
      fd.append('description', caption || '');
      fd.append('access_token', cred.page_access_token);
      if (isScheduled) {
        fd.append('published', 'false');
        fd.append('scheduled_publish_time', String(Math.floor(scheduledFor / 1000)));
      }
      const r = await fetch(`https://graph.facebook.com/v21.0/${cred.page_id}/videos`, {
        method: 'POST', body: fd
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(`Video upload: ${data.error?.message || r.statusText}`);
      fbPostId = data.id;
      // Video posts: permalink only available after processing; client can poll
    } else if (imageBase64) {
      // === Photo post — use /{page-id}/photos ===
      const blob = base64ToBlob(imageBase64, imageMime || 'image/png');
      const fd = new FormData();
      fd.append('source', blob, 'image.png');
      fd.append('caption', caption || '');
      fd.append('access_token', cred.page_access_token);
      if (isScheduled) {
        fd.append('published', 'false');
        fd.append('scheduled_publish_time', String(Math.floor(scheduledFor / 1000)));
      }
      const r = await fetch(`https://graph.facebook.com/v21.0/${cred.page_id}/photos`, {
        method: 'POST', body: fd
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(`Photo upload: ${data.error?.message || r.statusText}`);
      fbPostId = data.post_id || data.id;
    } else {
      // === Text-only post — use /{page-id}/feed ===
      const fd = new URLSearchParams();
      fd.set('message', caption);
      fd.set('access_token', cred.page_access_token);
      if (isScheduled) {
        fd.set('published', 'false');
        fd.set('scheduled_publish_time', String(Math.floor(scheduledFor / 1000)));
      }
      const r = await fetch(`https://graph.facebook.com/v21.0/${cred.page_id}/feed`, {
        method: 'POST', body: fd
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(`Feed: ${data.error?.message || r.statusText}`);
      fbPostId = data.id;
    }

    // First comment (if not scheduled — only works after publish)
    if (firstComment && fbPostId && !isScheduled) {
      try {
        const fd = new URLSearchParams();
        fd.set('message', firstComment);
        fd.set('access_token', cred.page_access_token);
        await fetch(`https://graph.facebook.com/v21.0/${fbPostId}/comments`, {
          method: 'POST', body: fd
        });
      } catch (e) {
        console.warn('First comment failed:', e.message);
      }
    }

    // Get permalink
    try {
      const pr = await fetch(`https://graph.facebook.com/v21.0/${fbPostId}?fields=permalink_url&access_token=${encodeURIComponent(cred.page_access_token)}`);
      if (pr.ok) {
        const pd = await pr.json();
        permalink = pd.permalink_url;
      }
    } catch (e) { /* ignore */ }

    // Update log
    await env.DB.prepare(
      `UPDATE fb_publish_log SET status = ?, fb_post_id = ?, published_at = ? WHERE id = ?`
    ).bind(isScheduled ? 'scheduled' : 'published', fbPostId, isScheduled ? null : Date.now(), logId).run();

    // Bump credential last_used
    await env.DB.prepare('UPDATE fb_credentials SET last_used_at = ? WHERE user_id = ?').bind(Date.now(), user.id).run();

    return json({ ok: true, fbPostId, permalink, logId, scheduled: isScheduled });
  } catch (e) {
    await env.DB.prepare('UPDATE fb_publish_log SET status = ?, error_message = ? WHERE id = ?').bind('failed', e.message.slice(0, 500), logId).run();
    return error(`Publish failed: ${e.message}`, 502);
  }
}

function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
