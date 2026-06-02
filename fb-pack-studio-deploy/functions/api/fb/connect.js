import { json, error, getCurrentUser } from '../../_utils.js';

/* POST /api/fb/connect
   Body: { pageId, pageAccessToken }
   Verifies the token by calling Graph API /me with token, then stores in fb_credentials.
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized — sign in with Google first', 401);

  let body;
  try { body = await request.json(); } catch (e) { return error('Invalid JSON body'); }
  const { pageId, pageAccessToken } = body || {};
  if (!pageId || !pageAccessToken) return error('Missing pageId or pageAccessToken');

  // 1. Verify token: GET /me?fields=id,name,access_token with token
  let pageInfo;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,category&access_token=${encodeURIComponent(pageAccessToken)}`);
    if (!r.ok) {
      const errText = await r.text();
      return error(`Token verification failed: ${errText.slice(0, 200)}`, 400);
    }
    pageInfo = await r.json();
  } catch (e) {
    return error(`Token verify error: ${e.message}`, 500);
  }

  // Cross-check pageId matches
  if (String(pageInfo.id) !== String(pageId)) {
    return error(`pageId mismatch: token belongs to "${pageInfo.id}" but you provided "${pageId}"`, 400);
  }

  // 2. Check token scopes via /debug_token (optional but recommended)
  let scopes = '';
  let expiresAt = null;
  try {
    const appAccessToken = `${env.FB_APP_ID}|${env.FB_APP_SECRET}`;
    const dt = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(pageAccessToken)}&access_token=${encodeURIComponent(appAccessToken)}`);
    if (dt.ok) {
      const dtData = await dt.json();
      if (dtData.data) {
        scopes = (dtData.data.scopes || []).join(',');
        if (dtData.data.expires_at && dtData.data.expires_at > 0) {
          expiresAt = dtData.data.expires_at * 1000; // seconds → ms
        }
      }
    }
  } catch (e) {
    // Non-fatal — token works but couldn't introspect
    console.warn('Token debug failed:', e.message);
  }

  // 3. Save to D1 (upsert)
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO fb_credentials (user_id, page_id, page_name, page_access_token, token_expires_at, scopes, connected_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       page_id = excluded.page_id,
       page_name = excluded.page_name,
       page_access_token = excluded.page_access_token,
       token_expires_at = excluded.token_expires_at,
       scopes = excluded.scopes,
       connected_at = excluded.connected_at,
       last_used_at = excluded.last_used_at`
  ).bind(user.id, pageId, pageInfo.name || null, pageAccessToken, expiresAt, scopes, now, now).run();

  return json({
    ok: true,
    page: {
      id: pageInfo.id,
      name: pageInfo.name,
      category: pageInfo.category,
      scopes: scopes.split(',').filter(Boolean),
      expiresAt
    }
  });
}

/* DELETE /api/fb/connect — disconnect */
export async function onRequestDelete({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  await env.DB.prepare('DELETE FROM fb_credentials WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true });
}
