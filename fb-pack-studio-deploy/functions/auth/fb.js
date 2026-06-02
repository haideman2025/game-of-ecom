import { error, getCurrentUser, randomToken } from '../_utils.js';

/* GET /auth/fb — start Facebook OAuth flow
   Redirects user to Facebook OAuth dialog with required scopes for organic publish + ads.
   On callback, /auth/fb/callback exchanges code → user_token → page_token → saves to D1.
*/
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Sign in with Google first', 401);

  if (!env.FB_APP_ID) return error('Server not configured: FB_APP_ID missing', 500);

  // V15.0 — full Meta Marketing API scope set (replaces Zernio Ads)
  const scopes = [
    // Organic posting
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_metadata',
    'pages_read_user_content',
    'publish_video',
    // V15.0 — Meta Marketing API (Ads direct)
    'ads_management',          // create/edit campaigns + adsets + ads
    'ads_read',                // read insights + campaign data
    'business_management',     // access Business Manager assets
    'pages_manage_ads',        // boost page posts
    'public_profile',
    'email'
  ].join(',');

  const baseUrl = env.BASE_URL || new URL(request.url).origin;
  const redirectUri = `${baseUrl}/auth/fb/callback`;

  // CSRF state token — 10 min TTL
  const state = randomToken(16);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO oauth_states (state, expires_at, return_url) VALUES (?, ?, ?)`
  ).bind(state, expiresAt, `user:${user.id}:fb`).run();

  const dialogUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  dialogUrl.searchParams.set('client_id', env.FB_APP_ID);
  dialogUrl.searchParams.set('redirect_uri', redirectUri);
  dialogUrl.searchParams.set('state', state);
  dialogUrl.searchParams.set('scope', scopes);
  dialogUrl.searchParams.set('response_type', 'code');
  dialogUrl.searchParams.set('auth_type', 'rerequest'); // re-ask declined permissions

  return Response.redirect(dialogUrl.toString(), 302);
}
