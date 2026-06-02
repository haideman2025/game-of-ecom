import { uuid, randomToken, setSessionCookie } from '../_utils.js';

/* Handle Google OAuth callback: exchange code, upsert user, create session */
export const onRequestGet = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response('Server not configured: OAuth secrets missing', { status: 500 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');
  if (errParam) return new Response(`OAuth error: ${errParam}`, { status: 400 });
  if (!code || !state) return new Response('Missing code or state', { status: 400 });

  const stateRec = await env.DB.prepare('SELECT * FROM oauth_states WHERE state = ?').bind(state).first();
  if (!stateRec || stateRec.expires_at < Date.now()) {
    return new Response('Invalid or expired state', { status: 400 });
  }
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

  const redirectUri = `${url.origin}/auth/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Token exchange failed:', errText);
    return new Response('Token exchange failed: ' + errText.slice(0, 200), { status: 500 });
  }
  const tokens = await tokenRes.json();
  // V11.7 — Drive integration: tokens now include refresh_token (because access_type=offline)
  const driveRefreshToken = tokens.refresh_token || null;
  const grantedScopes = tokens.scope || '';
  // Accept 'drive' (V11.7 full) or 'drive.file' (V11 backward compat)
  const hasDriveScope = grantedScopes.includes('auth/drive');

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (!userRes.ok) return new Response('User info fetch failed', { status: 500 });
  const gUser = await userRes.json();

  const now = Date.now();
  let user = await env.DB.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').bind(gUser.sub, gUser.email).first();
  if (!user) {
    const newId = uuid();
    await env.DB.prepare(`INSERT INTO users (id, email, name, google_id, picture, tier, tier_started_at, created_at, last_login_at, max_packs, is_admin) VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?, 5, 0)`).bind(newId, gUser.email, gUser.name || '', gUser.sub, gUser.picture || '', now, now, now).run();
    user = { id: newId };
  } else {
    await env.DB.prepare('UPDATE users SET name = ?, picture = ?, google_id = ?, last_login_at = ? WHERE id = ?').bind(gUser.name || '', gUser.picture || '', gUser.sub, now, user.id).run();
  }
  // V11 — Save drive_refresh_token if granted (only update if new token returned)
  if (driveRefreshToken && hasDriveScope) {
    try {
      await env.DB.prepare('UPDATE users SET drive_refresh_token = ? WHERE id = ?').bind(driveRefreshToken, user.id).run();
    } catch(e) { console.warn('Save drive refresh token failed (column may not exist yet):', e.message); }
  }

  const sessionToken = randomToken(32);
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?, ?)').bind(sessionToken, user.id, expiresAt, now, (request.headers.get('User-Agent') || '').slice(0, 200)).run();

  const returnTo = stateRec.return_url || '/';
  return new Response(null, {
    status: 302,
    headers: { 'Location': returnTo, 'Set-Cookie': setSessionCookie(sessionToken) }
  });
};
