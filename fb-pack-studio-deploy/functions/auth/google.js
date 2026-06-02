import { randomToken } from '../_utils.js';

/* Redirect to Google OAuth consent screen */
export const onRequestGet = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response('Server not configured: GOOGLE_CLIENT_ID missing in env vars', { status: 500 });
  }
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return_to') || '/';
  const state = randomToken(16);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await env.DB.prepare('INSERT INTO oauth_states (state, expires_at, return_url) VALUES (?, ?, ?)').bind(state, expiresAt, returnTo).run();

  const redirectUri = `${url.origin}/auth/callback`;
  // V11.7 — Use full 'drive' scope so app can READ user-uploaded files (drive.file only sees app-created)
  // 'drive' scope = full read/write access to user's Drive. Needed for "Cào Final Videos" to scan
  // files user uploaded directly via Drive web UI.
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile https://www.googleapis.com/auth/drive',
    access_type: 'offline',
    state,
    prompt: 'consent select_account',
    include_granted_scopes: 'true'
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
};
