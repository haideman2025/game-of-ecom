import { error, getCurrentUser } from '../../_utils.js';

/* GET /auth/fb/callback?code=...&state=...
   Full automated token exchange:
   1. code → User Access Token (short-lived)
   2. User Token → long-lived User Token (60d)
   3. /me/accounts → list pages user manages
   4. Pick first page (or specific page if pageId param) → its Page Access Token (already long-lived per Meta docs)
   5. Save to D1 fb_credentials
   6. Redirect back to app
*/
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Session lost — sign in with Google again', 401);

  if (!env.FB_APP_ID || !env.FB_APP_SECRET) {
    return error('Server not configured: FB_APP_ID / FB_APP_SECRET missing', 500);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const fbError = url.searchParams.get('error');
  const fbErrorDesc = url.searchParams.get('error_description');

  const baseUrl = env.BASE_URL || url.origin;

  if (fbError) {
    return redirectWithError(baseUrl, `Facebook denied: ${fbError} — ${fbErrorDesc || ''}`);
  }
  if (!code || !state) {
    return redirectWithError(baseUrl, 'Missing code or state');
  }

  // Verify state (CSRF protection)
  const stateRow = await env.DB.prepare(
    `SELECT expires_at, return_url FROM oauth_states WHERE state = ?`
  ).bind(state).first();
  if (!stateRow) return redirectWithError(baseUrl, 'Invalid state token');
  if (stateRow.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
    return redirectWithError(baseUrl, 'State expired — retry connect');
  }
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

  const redirectUri = `${baseUrl}/auth/fb/callback`;

  try {
    // STEP 1: code → short-lived User Token
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', env.FB_APP_ID);
    tokenUrl.searchParams.set('client_secret', env.FB_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      throw new Error(`Token exchange: ${tokenData.error?.message || tokenRes.statusText}`);
    }
    const shortUserToken = tokenData.access_token;

    // STEP 2: short → long-lived User Token (60d)
    const longUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', env.FB_APP_ID);
    longUrl.searchParams.set('client_secret', env.FB_APP_SECRET);
    longUrl.searchParams.set('fb_exchange_token', shortUserToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (!longRes.ok || longData.error) {
      throw new Error(`Long-lived exchange: ${longData.error?.message || longRes.statusText}`);
    }
    const longUserToken = longData.access_token;

    // STEP 3: /me/accounts → list pages with their page access tokens
    // NOTE: Page tokens derived from a long-lived user token are themselves long-lived (no expiration per Meta docs).
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category,tasks&access_token=${encodeURIComponent(longUserToken)}`);
    const pagesData = await pagesRes.json();
    if (!pagesRes.ok || pagesData.error) {
      throw new Error(`Fetch pages: ${pagesData.error?.message || pagesRes.statusText}`);
    }
    const pages = pagesData.data || [];
    if (pages.length === 0) {
      return redirectWithError(baseUrl, 'No Pages found. Bạn phải là admin của ít nhất 1 Facebook Page.');
    }

    // STEP 4: if user passed pageId param via state, pick that one. Else pick first.
    // For multi-page selection, redirect to a picker UI. For MVP, auto-pick first.
    const preferredPageId = url.searchParams.get('page_id'); // optional
    const page = preferredPageId
      ? pages.find(p => p.id === preferredPageId) || pages[0]
      : pages[0];

    // STEP 5: introspect BOTH tokens for scopes + expiry
    let pageScopes = '';
    let pageExpiresAt = null;
    let userScopes = '';
    let userExpiresAt = null;
    let adsScopes = '';
    const appAccessToken = `${env.FB_APP_ID}|${env.FB_APP_SECRET}`;
    try {
      const dt = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(page.access_token)}&access_token=${encodeURIComponent(appAccessToken)}`);
      if (dt.ok) {
        const dtData = await dt.json();
        if (dtData.data) {
          pageScopes = (dtData.data.scopes || []).join(',');
          if (dtData.data.expires_at && dtData.data.expires_at > 0) pageExpiresAt = dtData.data.expires_at * 1000;
        }
      }
    } catch (e) {}
    // V15.0 — also introspect User Access Token (Marketing API needs it)
    try {
      const dt = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(longUserToken)}&access_token=${encodeURIComponent(appAccessToken)}`);
      if (dt.ok) {
        const dtData = await dt.json();
        if (dtData.data) {
          userScopes = (dtData.data.scopes || []).join(',');
          if (dtData.data.expires_at && dtData.data.expires_at > 0) userExpiresAt = dtData.data.expires_at * 1000;
          // Filter ads-related scopes for quick check
          const adsRelevant = ['ads_management', 'ads_read', 'business_management'];
          adsScopes = (dtData.data.scopes || []).filter(s => adsRelevant.includes(s)).join(',');
        }
      }
    } catch (e) {}

    // STEP 6: save to D1 fb_credentials (upsert) — V15.0 now saves user_access_token too
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO fb_credentials (user_id, page_id, page_name, page_access_token, token_expires_at, scopes,
        user_access_token, user_token_expires_at, ads_scopes,
        connected_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         page_id = excluded.page_id,
         page_name = excluded.page_name,
         page_access_token = excluded.page_access_token,
         token_expires_at = excluded.token_expires_at,
         scopes = excluded.scopes,
         user_access_token = excluded.user_access_token,
         user_token_expires_at = excluded.user_token_expires_at,
         ads_scopes = excluded.ads_scopes,
         connected_at = excluded.connected_at,
         last_used_at = excluded.last_used_at`
    ).bind(
      user.id, page.id, page.name, page.access_token, pageExpiresAt, pageScopes,
      longUserToken, userExpiresAt, adsScopes,
      now, now
    ).run();

    // STEP 7: also remember other pages so UI can offer switch
    // (we encode them in a redirect param as base64 JSON for one-time consume)
    const otherPages = pages.length > 1 ? pages.filter(p => p.id !== page.id).map(p => ({id:p.id, name:p.name})) : [];
    const otherEncoded = otherPages.length ? '&other_pages=' + encodeURIComponent(btoa(JSON.stringify(otherPages))) : '';

    return Response.redirect(`${baseUrl}/?fb_connected=1&page=${encodeURIComponent(page.name)}${otherEncoded}`, 302);
  } catch (e) {
    console.error('[FB OAuth callback] failed:', e);
    return redirectWithError(baseUrl, e.message.slice(0, 250));
  }
}

function redirectWithError(baseUrl, msg) {
  return Response.redirect(`${baseUrl}/?fb_error=${encodeURIComponent(msg)}`, 302);
}
