import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';
import { getZernioKey, zernioPost, zernioGet } from '../_zernio.js';

/* V14.35 — POST /api/zernio-ads/boost
   Boost an existing scheduled/published post via Zernio Meta Ads API.

   Body: {
     pack_id, post_n,             // ref local pack/post for tracking
     zernio_post_id,              // FROM scheduled_posts.zernio_post_id (already published or scheduled)
     ad_account_id,               // Meta ad account, e.g. "act_1234567890"
     name,                        // campaign name
     goal,                        // 'traffic' | 'engagement' | 'conversions' | 'messages' | 'leads' | 'awareness'
     budget_daily_vnd,            // daily budget in VND
     duration_days,               // 1-30
     targeting: {
       age_min, age_max, countries, genders?, interests?
     }
   }

   Returns: { ok, zernio_ad_id, status, raw }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const {
    pack_id, post_n, zernio_post_id, ad_account_id,
    name, goal = 'messages', budget_daily_vnd, duration_days = 7,
    targeting = {}
  } = body;

  if (!zernio_post_id) return error('Missing zernio_post_id (boost an existing post)');
  if (!ad_account_id) return error('Missing ad_account_id (act_XXX from Meta Ads Manager)');
  if (!budget_daily_vnd || budget_daily_vnd < 30000) return error('budget_daily_vnd phải ≥ 30,000 VND/day (Meta min)');
  if (pack_id) {
    try { await requireCap(env, pack_id, user, 'edit_content'); }
    catch (e) { return error(e.message, e.status || 403); }
  }

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // V14.35.2 — Resolve Zernio internal accountId (different from Meta adAccountId)
  // Try body.zernio_account_id → users.zernio_account_id → first FB account from /accounts
  let zernioAccountId = body.zernio_account_id;
  if (!zernioAccountId) {
    try {
      const u = await env.DB.prepare('SELECT zernio_account_id FROM users WHERE id = ?').bind(user.id).first();
      zernioAccountId = u?.zernio_account_id;
    } catch (e) {}
  }
  if (!zernioAccountId) {
    // Fallback: fetch /accounts and pick first FB
    try {
      const accRes = await zernioGet(apiKey, '/accounts');
      const accs = accRes.accounts || accRes.data || (Array.isArray(accRes) ? accRes : []) || [];
      const list = Array.isArray(accs) ? accs : [];
      const fb = list.find(a => (a.platform || '').toLowerCase() === 'facebook');
      zernioAccountId = fb?._id || fb?.id || list[0]?._id || list[0]?.id;
    } catch (e) {}
  }
  if (!zernioAccountId) {
    return error('Không tìm thấy Zernio account ID. Vào Settings → Account picker để chọn default FB Page.', 400);
  }

  // V14.35.2 — Auto-prefix act_ for Meta Ad Account ID if user typed only numbers
  let formattedAdAccountId = ad_account_id.trim();
  if (/^\d+$/.test(formattedAdAccountId)) {
    formattedAdAccountId = 'act_' + formattedAdAccountId;
  }

  // Compute schedule
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + duration_days * 86400000).toISOString().slice(0, 10);

  const basePayload = {
    platform: 'metaads',
    accountId: zernioAccountId,                    // V14.35.2 Zernio internal account
    adAccountId: formattedAdAccountId,             // V14.35.2 Meta ad account (act_XXX)
    name: name || `[${startDate}] Boost · Day ${post_n || '?'}`,
    goal,
    budget: { amount: budget_daily_vnd, type: 'daily', currency: 'VND' },
    schedule: { startDate, endDate },
    targeting: {
      age_min: targeting.age_min || 25,
      age_max: targeting.age_max || 45,
      countries: targeting.countries || ['VN'],
      ...(targeting.genders ? { genders: targeting.genders } : {}),
      ...(targeting.interests ? { interests: targeting.interests } : {})
    }
  };

  // V14.35.3 — Try multiple endpoint paths to find what Zernio actually accepts
  const attempts = [
    // Attempt 1: /ads/create with postId as creative reference (bundles campaign + adset + ad)
    {
      path: '/ads/create',
      payload: { ...basePayload, creative: { postId: zernio_post_id } }
    },
    // Attempt 2: /ads/boost with postId top-level (original guess)
    {
      path: '/ads/boost',
      payload: { ...basePayload, postId: zernio_post_id }
    },
    // Attempt 3: /posts/{id}/boost — REST-style nested
    {
      path: `/posts/${zernio_post_id}/boost`,
      payload: basePayload
    }
  ];

  let resp = null;
  let lastErr = null;
  const attemptLog = [];

  for (const attempt of attempts) {
    try {
      resp = await zernioPost(apiKey, attempt.path, attempt.payload);
      attemptLog.push({ path: attempt.path, status: 'success' });
      break;
    } catch (e) {
      attemptLog.push({ path: attempt.path, status: 'fail', http: e.status, msg: e.message.slice(0, 150) });
      lastErr = e;
      // If 404 (endpoint not exists) → try next
      // If 400 (bad request) → also try next (maybe schema wrong for this path)
      if (e.status === 404 || e.status === 400) continue;
      // Other errors (401, 403, 500) → likely auth/server, no point retrying
      break;
    }
  }

  if (!resp) {
    return new Response(JSON.stringify({
      error: 'Boost fail — đã thử ' + attempts.length + ' endpoint paths',
      zernio_status: lastErr?.status,
      zernio_response: lastErr?.body || null,
      attempts: attemptLog,
      payload_sent: attempts[0].payload,
      hint: 'Zernio Ads API path có thể khác research. Thử boost trực tiếp trên zernio.com/dashboard để verify post boostable, rồi báo t path đúng để update.'
    }, null, 2), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const adId = resp._id || resp.id || resp.adId;

    // Persist a tiny D1 row to track this boost (best-effort)
    try {
      if (pack_id) {
        await env.DB.prepare(
          `UPDATE scheduled_posts SET notes = COALESCE(notes, '') || ?, updated_at = ?
           WHERE user_id = ? AND zernio_post_id = ?`
        ).bind(
          ` · boosted as ad ${adId} at ${Date.now()}`,
          Date.now(), user.id, zernio_post_id
        ).run();
      }
    } catch (e) { /* no notes column ok */ }

    return json({
      ok: true,
      zernio_ad_id: adId,
      status: resp.status || 'pending',
      name: basePayload.name,
      budget_daily_vnd,
      duration_days,
      total_budget_vnd: budget_daily_vnd * duration_days,
      successful_path: attemptLog.find(a => a.status === 'success')?.path,
      attempts: attemptLog,
      raw: resp
    });
  } catch (e) {
    // V14.35.3 — Return FULL response with attempts log
    const errBody = {
      error: 'Boost post-process fail: ' + e.message,
      attempts: attemptLog,
      payload_sent: basePayload
    };
    return new Response(JSON.stringify(errBody, null, 2), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
