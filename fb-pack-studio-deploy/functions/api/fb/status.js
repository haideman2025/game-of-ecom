import { json, error, getCurrentUser } from '../../_utils.js';

/* GET /api/fb/status — return current FB connection state (without exposing token) */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // V15.0 — also expose user_access_token presence + ads_scopes for Meta Marketing API readiness
  const cred = await env.DB.prepare(
    `SELECT page_id, page_name, scopes, ad_account_id, connected_at, last_used_at, token_expires_at,
            user_access_token, user_token_expires_at, ads_scopes
     FROM fb_credentials WHERE user_id = ?`
  ).bind(user.id).first();

  if (!cred) return json({ connected: false });

  const expired = cred.token_expires_at && cred.token_expires_at < Date.now();
  const userTokenExpired = cred.user_token_expires_at && cred.user_token_expires_at < Date.now();
  const adsScopes = (cred.ads_scopes || '').split(',').filter(Boolean);
  const adsReady = !!cred.user_access_token && !userTokenExpired && adsScopes.includes('ads_management');

  const stats = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled
     FROM fb_publish_log WHERE user_id = ?`
  ).bind(user.id).first();

  return json({
    connected: true,
    expired,
    page: {
      id: cred.page_id,
      name: cred.page_name,
      scopes: (cred.scopes || '').split(',').filter(Boolean),
      adAccountId: cred.ad_account_id
    },
    // V15.0 — Meta Ads readiness
    ads: {
      ready: adsReady,
      has_user_token: !!cred.user_access_token,
      user_token_expired: userTokenExpired,
      scopes: adsScopes,
      missing_scopes: ['ads_management', 'ads_read', 'business_management'].filter(s => !adsScopes.includes(s))
    },
    connectedAt: cred.connected_at,
    lastUsedAt: cred.last_used_at,
    tokenExpiresAt: cred.token_expires_at,
    userTokenExpiresAt: cred.user_token_expires_at,
    stats: stats || { total: 0, published: 0, failed: 0, scheduled: 0 }
  });
}
