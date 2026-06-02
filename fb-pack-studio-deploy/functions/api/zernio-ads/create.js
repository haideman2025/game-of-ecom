import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';
import { getZernioKey, zernioPost, zernioGet } from '../_zernio.js';

/* V14.36 — POST /api/zernio-ads/create
   Create a NEW Meta Ad with full creative (not boost an existing post).
   Mirrors Zernio's Create Ad UI: primary_text + headline + cta + destination_url + media_url.

   Body: {
     pack_id?, post_n?,                  // for tracking
     zernio_account_id,                  // Zernio internal FB account (from /accounts)
     ad_account_id,                      // Meta Ad Account "act_XXX" (from ad-accounts list)
     name,                               // ad name
     goal,                               // engagement | traffic | awareness | video_views | leads | conversions | app_promotion
     primary_text, headline, cta, destination_url,
     media_url,                          // public URL (R2 / Drive / Zernio uploaded)
     media_type,                         // image | video
     budget,                             // amount (currency-aware)
     budget_type,                        // 'daily' | 'lifetime'
     currency,                           // 'VND' | 'USD' (must match ad_account)
     duration_days,                      // for lifetime budget calc
     targeting: { age_min, age_max, countries[], genders?, interests? }
   }

   Returns: { ok, zernio_ad_id, status, raw, successful_path, attempts }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const {
    pack_id, post_n,
    zernio_account_id, ad_account_id,
    name, goal = 'engagement',
    primary_text = '', headline = '', cta = 'LEARN_MORE', destination_url = '',
    media_url, media_type = 'image',
    budget, budget_type = 'daily', currency = 'VND',
    duration_days = 7,
    targeting = {}
  } = body;

  if (!ad_account_id) return error('Missing ad_account_id (act_XXX) — chọn từ dropdown');
  if (!primary_text.trim()) return error('Missing primary_text — caption chính');
  if (!budget || budget < 1) return error('Missing budget');

  if (pack_id) {
    try { await requireCap(env, pack_id, user, 'edit_content'); }
    catch (e) { return error(e.message, e.status || 403); }
  }

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // Resolve Zernio internal accountId if not provided
  let zernioAccountId = zernio_account_id;
  if (!zernioAccountId) {
    try {
      const u = await env.DB.prepare('SELECT zernio_account_id FROM users WHERE id = ?').bind(user.id).first();
      zernioAccountId = u?.zernio_account_id;
    } catch (e) {}
  }
  if (!zernioAccountId) {
    try {
      const accRes = await zernioGet(apiKey, '/accounts');
      const accs = accRes.accounts || accRes.data || (Array.isArray(accRes) ? accRes : []) || [];
      const list = Array.isArray(accs) ? accs : [];
      const fb = list.find(a => (a.platform || '').toLowerCase() === 'facebook' || (a.platform || '').toLowerCase() === 'metaads');
      zernioAccountId = fb?._id || fb?.id || list[0]?._id || list[0]?.id;
    } catch (e) {}
  }
  if (!zernioAccountId) {
    return error('Không tìm thấy Zernio account — vào Settings để connect FB Page', 400);
  }

  // Auto-prefix act_ if needed
  let formattedAdAccountId = String(ad_account_id).trim();
  if (/^\d+$/.test(formattedAdAccountId)) {
    formattedAdAccountId = 'act_' + formattedAdAccountId;
  }

  // Schedule
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + duration_days * 86400000).toISOString().slice(0, 10);

  // Build payload mirroring Zernio's Create Ad form schema
  const creative = {
    primaryText: primary_text,
    headline: headline || primary_text.slice(0, 40),
    callToAction: cta,
    destinationUrl: destination_url || 'https://m.me/',  // Messenger fallback for engagement
    mediaUrl: media_url,
    mediaType: media_type
  };

  // V14.36.2 — Zernio expects budgetType + budget (number) at top level, not nested
  // Error from V14.36.1 attempt: "budgetType is required"
  const baseTargeting = {
    ageMin: targeting.age_min || 18,
    ageMax: targeting.age_max || 65,
    countries: targeting.countries || ['VN'],
    ...(targeting.genders ? { genders: targeting.genders } : {}),
    ...(targeting.interests ? { interests: targeting.interests } : {})
  };

  // V14.36.2 — Flat schema (per Zernio error msg)
  const flatPayload = {
    platform: 'metaads',
    accountId: zernioAccountId,
    adAccountId: formattedAdAccountId,
    name: name || `[${startDate}] ${(primary_text || '').slice(0, 50)}`,
    goal,
    // Creative (mirrors Zernio Create Ad UI field names)
    primaryText: primary_text,
    headline: headline || primary_text.slice(0, 40),
    callToAction: cta,
    destinationUrl: destination_url || 'https://m.me/',
    mediaUrl: media_url,
    mediaType: media_type,
    // Budget — FLAT (not nested)
    budget,                       // number
    budgetType: budget_type,      // 'daily' | 'lifetime' | 'total'
    currency,                     // 'VND' | 'USD' | ...
    // Schedule
    startDate,
    endDate,
    // Targeting
    targeting: baseTargeting,
    ageMin: baseTargeting.ageMin,
    ageMax: baseTargeting.ageMax,
    countries: baseTargeting.countries
  };

  // Also keep nested fallback (for variant schemas)
  const nestedPayload = {
    platform: 'metaads',
    accountId: zernioAccountId,
    adAccountId: formattedAdAccountId,
    name: flatPayload.name,
    goal,
    creative,
    budget: { amount: budget, type: budget_type, currency },
    budgetType: budget_type,      // duplicate to be safe
    currency,
    schedule: { startDate, endDate },
    targeting: baseTargeting
  };

  // V14.36.2 — Try multiple endpoint + payload variants
  const attempts = [
    { path: '/ads/create',          variant: 'flat',               payload: flatPayload },
    { path: '/ads/create',          variant: 'flat+creative',      payload: { ...flatPayload, creative } },
    { path: '/ads/create',          variant: 'nested-bundle',      payload: nestedPayload },
    { path: '/ads/campaigns/create',variant: 'flat',               payload: flatPayload },
    { path: '/ads/campaign',        variant: 'flat',               payload: flatPayload }
  ];

  let resp = null;
  let lastErr = null;
  let lastPayloadSent = null;
  const attemptLog = [];

  for (const a of attempts) {
    try {
      lastPayloadSent = a.payload;
      resp = await zernioPost(apiKey, a.path, a.payload);
      attemptLog.push({ path: a.path, variant: a.variant, status: 'success' });
      break;
    } catch (e) {
      attemptLog.push({ path: a.path, variant: a.variant, status: 'fail', http: e.status, msg: (e.message || '').slice(0, 180) });
      lastErr = e;
      if (e.status === 404 || e.status === 400 || e.status === 422) continue;
      break;
    }
  }

  if (!resp) {
    return new Response(JSON.stringify({
      error: 'Create Ad fail — đã thử ' + attempts.length + ' biến thể',
      zernio_status: lastErr?.status,
      zernio_response: lastErr?.body || null,
      attempts: attemptLog,
      payload_sent: lastPayloadSent,
      hint: 'Zernio API yêu cầu schema khác. (1) Check ad_account_id đúng currency; (2) media_url public access; (3) Email support@zernio.com để xin docs schema /ads/create chính thức kèm screenshot lỗi này.'
    }, null, 2), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const adId = resp._id || resp.id || resp.adId || resp.campaignId;

  // Persist tracking row (best-effort)
  try {
    if (pack_id) {
      await env.DB.prepare(
        `INSERT INTO ads_log (user_id, pack_id, post_n, zernio_ad_id, ad_account_id, name, goal, budget, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(user.id, pack_id, post_n || null, adId, formattedAdAccountId, basePayload.name, goal, budget, currency, Date.now()).run();
    }
  } catch (e) { /* table may not exist yet, ignore */ }

  return json({
    ok: true,
    zernio_ad_id: adId,
    status: resp.status || 'pending',
    name: basePayload.name,
    budget,
    currency,
    duration_days,
    total_budget: budget_type === 'daily' ? budget * duration_days : budget,
    successful_path: attemptLog.find(a => a.status === 'success')?.path,
    attempts: attemptLog,
    raw: resp
  });
}
