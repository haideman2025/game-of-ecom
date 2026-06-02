// V15.0 — Meta Marketing API helper module
// Docs: https://developers.facebook.com/docs/marketing-api
// Auth: User Access Token with ads_management scope

const META_BASE = 'https://graph.facebook.com/v21.0';

/** Get the user's saved FB credentials (page + user tokens). */
export async function getFbCreds(env, userId) {
  const row = await env.DB.prepare(
    `SELECT page_id, page_name, page_access_token, user_access_token, token_expires_at, scopes, ad_account_id
     FROM fb_credentials WHERE user_id = ?`
  ).bind(userId).first();
  if (!row?.page_access_token) {
    const err = new Error('Facebook chưa kết nối. Settings → Connect Facebook (cần scope ads_management).');
    err.status = 401;
    throw err;
  }
  return row;
}

/** Generic Meta Graph GET */
export async function metaGet(token, path, query) {
  const url = new URL(META_BASE + (path.startsWith('/') ? path : '/' + path));
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const r = await fetch(url.toString());
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok || body.error) {
    const err = new Error(body?.error?.message || `Meta ${r.status}`);
    err.status = r.status;
    err.body = body;
    err.fb_code = body?.error?.code;
    err.fb_subcode = body?.error?.error_subcode;
    err.fb_type = body?.error?.type;
    throw err;
  }
  return body;
}

/** Generic Meta Graph POST (form-encoded — Marketing API standard) */
export async function metaPost(token, path, params) {
  const form = new URLSearchParams();
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  form.set('access_token', token);

  const r = await fetch(META_BASE + (path.startsWith('/') ? path : '/' + path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok || body.error) {
    const err = new Error(body?.error?.message || `Meta POST ${r.status}`);
    err.status = r.status;
    err.body = body;
    err.fb_code = body?.error?.code;
    err.fb_subcode = body?.error?.error_subcode;
    err.fb_type = body?.error?.type;
    throw err;
  }
  return body;
}

/** Generic Meta Graph DELETE */
export async function metaDelete(token, path) {
  const r = await fetch(META_BASE + (path.startsWith('/') ? path : '/' + path) + `?access_token=${encodeURIComponent(token)}`, {
    method: 'DELETE'
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok || body.error) {
    const err = new Error(body?.error?.message || `Meta DELETE ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Map goal → Meta campaign objective.
    Meta requires specific objective enums per goal. */
export function goalToObjective(goal) {
  const map = {
    awareness:      'OUTCOME_AWARENESS',
    reach:          'OUTCOME_AWARENESS',
    traffic:        'OUTCOME_TRAFFIC',
    engagement:     'OUTCOME_ENGAGEMENT',
    messages:       'OUTCOME_ENGAGEMENT',     // optimize for messages
    leads:          'OUTCOME_LEADS',
    lead_generation:'OUTCOME_LEADS',
    conversions:   'OUTCOME_SALES',
    sales:          'OUTCOME_SALES',
    app_promotion:  'OUTCOME_APP_PROMOTION',
    video_views:    'OUTCOME_AWARENESS'       // video views = awareness in new ODAX
  };
  return map[(goal || 'engagement').toLowerCase()] || 'OUTCOME_ENGAGEMENT';
}

/** Map goal → AdSet billing_event + optimization_goal */
export function goalToOptimization(goal) {
  const g = (goal || 'engagement').toLowerCase();
  const map = {
    awareness:      { optimization_goal: 'REACH',                 billing_event: 'IMPRESSIONS' },
    reach:          { optimization_goal: 'REACH',                 billing_event: 'IMPRESSIONS' },
    traffic:        { optimization_goal: 'LINK_CLICKS',           billing_event: 'LINK_CLICKS' },
    engagement:     { optimization_goal: 'POST_ENGAGEMENT',       billing_event: 'IMPRESSIONS' },
    messages:       { optimization_goal: 'CONVERSATIONS',         billing_event: 'IMPRESSIONS', destination_type: 'MESSENGER' },
    leads:          { optimization_goal: 'LEAD_GENERATION',       billing_event: 'IMPRESSIONS' },
    lead_generation:{ optimization_goal: 'LEAD_GENERATION',       billing_event: 'IMPRESSIONS' },
    conversions:    { optimization_goal: 'OFFSITE_CONVERSIONS',   billing_event: 'IMPRESSIONS' },
    sales:          { optimization_goal: 'OFFSITE_CONVERSIONS',   billing_event: 'IMPRESSIONS' },
    video_views:    { optimization_goal: 'THRUPLAY',              billing_event: 'IMPRESSIONS' },
    app_promotion:  { optimization_goal: 'APP_INSTALLS',          billing_event: 'IMPRESSIONS' }
  };
  return map[g] || map.engagement;
}

/** Format budget for Meta — Meta wants budget in MINOR UNITS of account currency:
    USD/EUR/etc: cents (× 100)
    VND/IDR/KRW: no decimals (× 1) — zero-decimal currencies
    JPY: no decimals (× 1)
*/
export function toMetaBudgetMinor(amount, currency) {
  const zeroDec = ['VND', 'IDR', 'KRW', 'JPY', 'CLP', 'PYG', 'UGX'];
  if (zeroDec.includes((currency || '').toUpperCase())) return Math.round(amount);
  return Math.round(amount * 100);
}

/** Auto-prefix act_ for ad account IDs */
export function formatAdAccountId(adAccountId) {
  const id = String(adAccountId || '').trim();
  if (!id) return '';
  if (/^\d+$/.test(id)) return 'act_' + id;
  return id;
}

/** Validate token has ads_management scope */
export async function ensureAdsScope(scopes) {
  const s = (scopes || '').split(',').map(x => x.trim());
  if (!s.includes('ads_management')) {
    const err = new Error('Token thiếu scope ads_management. Vào Settings → Reconnect Facebook để grant Ads permission.');
    err.status = 403;
    throw err;
  }
}
