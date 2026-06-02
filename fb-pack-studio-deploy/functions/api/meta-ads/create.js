import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';
import { getFbCreds, metaPost, goalToObjective, goalToOptimization, toMetaBudgetMinor, formatAdAccountId } from '../_meta.js';

/* V15.0 — POST /api/meta-ads/create
   Create a complete Meta Ad: Campaign → AdSet → AdCreative → Ad.
   This is the OFFICIAL Marketing API flow. No middleware, no guessing.

   Body: {
     pack_id?, post_n?,
     ad_account_id,                    // "act_XXX" or bare digits
     name,
     goal,                              // engagement | traffic | leads | conversions | messages | awareness | video_views | sales
     primary_text, headline?, description?, cta?, destination_url,
     image_url OR video_url,            // public URL
     existing_post_id?,                 // if want to reuse existing FB post, pass {page_id}_{post_id}
     budget,                            // amount in major units (e.g. 100000 VND)
     budget_type,                       // 'daily' | 'lifetime'
     duration_days,
     targeting: { age_min, age_max, countries[], genders?, interests? },
     status?                            // 'PAUSED' (default — safer) or 'ACTIVE'
   }

   Returns: { ok, campaign_id, adset_id, creative_id, ad_id, status, links }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const {
    pack_id, post_n,
    ad_account_id,
    name,
    goal = 'engagement',
    primary_text = '',
    headline = '',
    description = '',
    cta = 'LEARN_MORE',
    destination_url = '',
    image_url,
    video_url,
    existing_post_id,
    budget,
    budget_type = 'daily',
    duration_days = 7,
    targeting = {},
    status = 'PAUSED'   // safer default — user reviews before activating
  } = body;

  if (!ad_account_id) return error('Missing ad_account_id', 400);
  if (!budget || budget < 1) return error('Missing budget', 400);
  if (!existing_post_id && !primary_text.trim()) return error('Missing primary_text', 400);
  if (!existing_post_id && !image_url && !video_url) return error('Missing media (image_url or video_url) or existing_post_id', 400);

  if (pack_id) {
    try { await requireCap(env, pack_id, user, 'edit_content'); }
    catch (e) { return error(e.message, e.status || 403); }
  }

  let creds;
  try { creds = await getFbCreds(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // Ads require User Access Token (Page token has limited Marketing API access)
  const token = creds.user_access_token || creds.page_access_token;
  if (!creds.user_access_token) {
    return error('Cần User Access Token (Page token không đủ cho Ads). Vào Settings → Reconnect Facebook để grant scope đầy đủ.', 403);
  }

  const adAccountId = formatAdAccountId(ad_account_id);
  const objective = goalToObjective(goal);
  const optConfig = goalToOptimization(goal);

  // We need account currency to compute budget minor units — fetch it
  let currency = body.currency;
  if (!currency) {
    try {
      const accInfo = await metaPost(token, `/${adAccountId}`, { method: 'GET' });
      currency = accInfo.currency || 'VND';
    } catch (e) {
      // Fallback to VND assumption (user can override via body.currency)
      currency = 'VND';
    }
  }

  const budgetMinor = toMetaBudgetMinor(budget, currency);

  const log = [];
  const startTime = Math.floor(Date.now() / 1000);
  const endTime = startTime + (duration_days * 86400);
  const baseName = name || `[GoE] Day ${post_n || '?'} · ${new Date().toISOString().slice(0, 10)}`;

  try {
    // ============================================================
    // STEP 1 — CREATE CAMPAIGN
    // ============================================================
    const campaignParams = {
      name: baseName + ' · Campaign',
      objective,
      status,
      special_ad_categories: '[]',   // empty array — required field
      buying_type: 'AUCTION'
    };
    const campaign = await metaPost(token, `/${adAccountId}/campaigns`, campaignParams);
    log.push({ step: 'campaign', id: campaign.id, status: 'ok' });

    // ============================================================
    // STEP 2 — CREATE ADSET
    // ============================================================
    const adsetTargeting = {
      geo_locations: { countries: targeting.countries || ['VN'] },
      age_min: targeting.age_min || 18,
      age_max: targeting.age_max || 65,
      ...(targeting.genders ? { genders: targeting.genders } : {}),
      ...(targeting.interests ? { flexible_spec: [{ interests: targeting.interests }] } : {}),
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed', 'story'],
      instagram_positions: ['stream', 'story']
    };

    const adsetParams = {
      name: baseName + ' · AdSet',
      campaign_id: campaign.id,
      [budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget']: budgetMinor,
      optimization_goal: optConfig.optimization_goal,
      billing_event: optConfig.billing_event,
      ...(optConfig.destination_type ? { destination_type: optConfig.destination_type } : {}),
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: adsetTargeting,
      start_time: startTime,
      end_time: budget_type === 'lifetime' ? endTime : undefined,
      status,
      ...(goal === 'messages' ? {
        promoted_object: { page_id: creds.page_id }
      } : {})
    };

    const adset = await metaPost(token, `/${adAccountId}/adsets`, adsetParams);
    log.push({ step: 'adset', id: adset.id, status: 'ok' });

    // ============================================================
    // STEP 3 — CREATE AD CREATIVE
    // ============================================================
    let creative;

    if (existing_post_id) {
      // Reuse existing FB post as creative (page_id_post_id format)
      const creativeParams = {
        name: baseName + ' · Creative',
        object_story_id: existing_post_id
      };
      creative = await metaPost(token, `/${adAccountId}/adcreatives`, creativeParams);
    } else {
      // Build fresh creative from primary_text + media + cta
      const linkData = {
        message: primary_text,
        link: destination_url || `https://www.facebook.com/${creds.page_id}`,
        ...(headline ? { name: headline } : {}),
        ...(description ? { description } : {}),
        ...(image_url ? { picture: image_url } : {}),
        call_to_action: {
          type: cta,
          value: { link: destination_url || `https://www.facebook.com/${creds.page_id}` }
        }
      };

      const objectStorySpec = {
        page_id: creds.page_id,
        ...(video_url ? {
          video_data: {
            video_id: video_url,    // Note: this should be a video_id from /act_/advideos, not a URL
            message: primary_text,
            call_to_action: linkData.call_to_action,
            ...(image_url ? { image_url } : {})
          }
        } : {
          link_data: linkData
        })
      };

      const creativeParams = {
        name: baseName + ' · Creative',
        object_story_spec: objectStorySpec
      };
      creative = await metaPost(token, `/${adAccountId}/adcreatives`, creativeParams);
    }
    log.push({ step: 'creative', id: creative.id, status: 'ok' });

    // ============================================================
    // STEP 4 — CREATE AD
    // ============================================================
    const adParams = {
      name: baseName + ' · Ad',
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status
    };
    const ad = await metaPost(token, `/${adAccountId}/ads`, adParams);
    log.push({ step: 'ad', id: ad.id, status: 'ok' });

    // ============================================================
    // STEP 5 — Persist tracking row (best-effort)
    // ============================================================
    try {
      await env.DB.prepare(
        `INSERT INTO ads_log (user_id, pack_id, post_n, meta_campaign_id, meta_adset_id, meta_ad_id, meta_creative_id, ad_account_id, name, goal, objective, budget, currency, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        user.id, pack_id || null, post_n || null,
        campaign.id, adset.id, ad.id, creative.id,
        adAccountId, baseName, goal, objective, budget, currency, status, Date.now()
      ).run();
    } catch (e) { /* table may not exist, skip */ }

    return json({
      ok: true,
      campaign_id: campaign.id,
      adset_id: adset.id,
      creative_id: creative.id,
      ad_id: ad.id,
      status,
      name: baseName,
      budget,
      budget_minor: budgetMinor,
      currency,
      objective,
      links: {
        ads_manager: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace('act_', '')}&selected_campaign_ids=${campaign.id}`,
        campaign: `https://www.facebook.com/business/help/${campaign.id}`
      },
      log
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: `Meta Ads ${log.length ? 'step ' + (log.length + 1) : 'init'} fail: ${e.message}`,
      fb_code: e.fb_code,
      fb_subcode: e.fb_subcode,
      fb_type: e.fb_type,
      meta_response: e.body || null,
      progress: log,
      hint: hintFromError(e)
    }, null, 2), { status: e.status || 502, headers: { 'Content-Type': 'application/json' } });
  }
}

function hintFromError(e) {
  const msg = (e.message || '').toLowerCase();
  if (msg.includes('permission') || e.fb_code === 200 || e.fb_code === 100) {
    return 'Thiếu permission ads_management. Settings → Reconnect Facebook → tick Ads.';
  }
  if (msg.includes('budget') || e.fb_subcode === 1487056) {
    return 'Budget thấp hơn min của Meta cho currency này. VN VND min ~26,500/day. Tăng budget hoặc đổi optimization_goal.';
  }
  if (msg.includes('ad account') && (msg.includes('disabled') || msg.includes('not active'))) {
    return 'Ad account bị disabled/restricted. Vào Meta Business Manager → verify payment method + identity.';
  }
  if (e.fb_subcode === 1487748) {
    return 'Ad account chưa add Page hoặc Pixel. Business Settings → Pages → add Page vào Ad Account.';
  }
  if (msg.includes('special_ad_categor')) {
    return 'Industry restricted (housing/credit/employment/social). Phải set special_ad_categories trong body.';
  }
  return 'Check Meta response để biết chi tiết. Docs: https://developers.facebook.com/docs/marketing-api/error-reference';
}
