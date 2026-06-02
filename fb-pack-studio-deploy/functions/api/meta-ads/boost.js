import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';
import { getFbCreds, metaPost, goalToObjective, goalToOptimization, toMetaBudgetMinor, formatAdAccountId } from '../_meta.js';

/* V15.0 — POST /api/meta-ads/boost
   Boost an EXISTING FB page post. Native Meta flow:
   creates campaign + adset + adcreative (reuses post via object_story_id) + ad.
   This is the official "Boost Post" backend logic.

   Body: {
     pack_id?, post_n?,
     ad_account_id,
     fb_post_id,            // FB post ID — format: "{page_id}_{post_id}" OR just post_id
     name?,
     goal = 'engagement',
     budget,
     budget_type = 'daily',
     duration_days = 7,
     targeting: { age_min, age_max, countries[], genders?, interests? },
     status = 'PAUSED'
   }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const {
    pack_id, post_n,
    ad_account_id,
    fb_post_id,
    name,
    goal = 'engagement',
    budget,
    budget_type = 'daily',
    duration_days = 7,
    targeting = {},
    status = 'PAUSED'
  } = body;

  if (!ad_account_id) return error('Missing ad_account_id', 400);
  if (!fb_post_id) return error('Missing fb_post_id (định dạng: {page_id}_{post_id})', 400);
  if (!budget || budget < 1) return error('Missing budget', 400);

  if (pack_id) {
    try { await requireCap(env, pack_id, user, 'edit_content'); }
    catch (e) { return error(e.message, e.status || 403); }
  }

  let creds;
  try { creds = await getFbCreds(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  const token = creds.user_access_token || creds.page_access_token;
  if (!creds.user_access_token) {
    return error('Cần User Access Token. Settings → Reconnect Facebook để grant scope ads_management.', 403);
  }

  const adAccountId = formatAdAccountId(ad_account_id);
  const objective = goalToObjective(goal);
  const optConfig = goalToOptimization(goal);

  // Normalize post_id — if user passes just post_id, prepend page_id
  let postId = String(fb_post_id);
  if (!postId.includes('_')) postId = `${creds.page_id}_${postId}`;

  // Currency
  const currency = body.currency || 'VND';
  const budgetMinor = toMetaBudgetMinor(budget, currency);

  const startTime = Math.floor(Date.now() / 1000);
  const endTime = startTime + (duration_days * 86400);
  const baseName = name || `[GoE Boost] Day ${post_n || '?'} · ${new Date().toISOString().slice(0, 10)}`;

  const log = [];

  try {
    // Campaign
    const campaign = await metaPost(token, `/${adAccountId}/campaigns`, {
      name: baseName + ' · Campaign',
      objective,
      status,
      special_ad_categories: '[]',
      buying_type: 'AUCTION'
    });
    log.push({ step: 'campaign', id: campaign.id });

    // AdSet
    const adset = await metaPost(token, `/${adAccountId}/adsets`, {
      name: baseName + ' · AdSet',
      campaign_id: campaign.id,
      [budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget']: budgetMinor,
      optimization_goal: optConfig.optimization_goal,
      billing_event: optConfig.billing_event,
      ...(optConfig.destination_type ? { destination_type: optConfig.destination_type } : {}),
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        geo_locations: { countries: targeting.countries || ['VN'] },
        age_min: targeting.age_min || 18,
        age_max: targeting.age_max || 65,
        ...(targeting.genders ? { genders: targeting.genders } : {}),
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed', 'story']
      },
      start_time: startTime,
      end_time: budget_type === 'lifetime' ? endTime : undefined,
      status,
      ...(goal === 'messages' ? { promoted_object: { page_id: creds.page_id } } : {})
    });
    log.push({ step: 'adset', id: adset.id });

    // AdCreative — reuse existing post
    const creative = await metaPost(token, `/${adAccountId}/adcreatives`, {
      name: baseName + ' · Creative',
      object_story_id: postId
    });
    log.push({ step: 'creative', id: creative.id });

    // Ad
    const ad = await metaPost(token, `/${adAccountId}/ads`, {
      name: baseName + ' · Ad',
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status
    });
    log.push({ step: 'ad', id: ad.id });

    // Track in D1
    try {
      await env.DB.prepare(
        `INSERT INTO ads_log (user_id, pack_id, post_n, meta_campaign_id, meta_adset_id, meta_ad_id, meta_creative_id, ad_account_id, name, goal, objective, budget, currency, status, fb_post_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        user.id, pack_id || null, post_n || null,
        campaign.id, adset.id, ad.id, creative.id,
        adAccountId, baseName, goal, objective, budget, currency, status, postId, Date.now()
      ).run();
    } catch (e) {}

    return json({
      ok: true,
      campaign_id: campaign.id,
      adset_id: adset.id,
      creative_id: creative.id,
      ad_id: ad.id,
      fb_post_id: postId,
      status,
      budget,
      budget_minor: budgetMinor,
      currency,
      objective,
      links: {
        ads_manager: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace('act_', '')}&selected_campaign_ids=${campaign.id}`
      },
      log
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: `Meta Boost ${log.length ? 'step ' + (log.length + 1) : 'init'} fail: ${e.message}`,
      fb_code: e.fb_code,
      fb_subcode: e.fb_subcode,
      meta_response: e.body || null,
      progress: log,
      hint: e.fb_subcode === 2446289 ? 'Post chưa publish thật trên FB Page (Meta yêu cầu post live). Đợi đến giờ đăng hoặc Publish ngay rồi boost.'
          : e.fb_subcode === 1487056 ? 'Budget < min Meta. VND min ~26,500/day. Tăng budget.'
          : 'Check Meta response để biết chi tiết.'
    }, null, 2), { status: e.status || 502, headers: { 'Content-Type': 'application/json' } });
  }
}
