import { json, error, getCurrentUser } from '../../_utils.js';
import { getFbCreds, metaGet, formatAdAccountId } from '../_meta.js';

/* V15.0 — GET /api/meta-ads/campaigns?ad_account_id=act_XXX&include_insights=1
   List campaigns for an ad account with optional insights summary.
   Returns: { ok, total, campaigns: [{ id, name, status, objective, budget, spend, impressions, ctr, cpc, ... }] }
*/
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const adAccountId = formatAdAccountId(url.searchParams.get('ad_account_id'));
  const includeInsights = url.searchParams.get('include_insights') === '1';
  const limit = parseInt(url.searchParams.get('limit') || '25');
  const since = url.searchParams.get('since') || 'last_30d';  // 'today', 'yesterday', 'last_7d', 'last_30d', 'lifetime'

  if (!adAccountId) return error('Missing ad_account_id', 400);

  let creds;
  try { creds = await getFbCreds(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  const token = creds.user_access_token || creds.page_access_token;

  try {
    // Fetch campaigns
    const r = await metaGet(token, `/${adAccountId}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time,special_ad_categories',
      limit
    });

    let campaigns = (r.data || []).map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      effective_status: c.effective_status,
      objective: c.objective,
      buying_type: c.buying_type,
      daily_budget: c.daily_budget ? parseInt(c.daily_budget) : null,
      lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget) : null,
      start_time: c.start_time,
      stop_time: c.stop_time,
      created_time: c.created_time,
      updated_time: c.updated_time,
      special_ad_categories: c.special_ad_categories
    }));

    // Fetch insights for each campaign if requested (parallel, batch up to 10)
    if (includeInsights && campaigns.length > 0) {
      const top = campaigns.slice(0, Math.min(10, campaigns.length));
      const insightsPromises = top.map(c =>
        metaGet(token, `/${c.id}/insights`, {
          fields: 'spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,cpp,actions',
          date_preset: since
        }).then(ir => {
          const d = ir.data?.[0] || {};
          return {
            campaign_id: c.id,
            spend: parseFloat(d.spend || 0),
            impressions: parseInt(d.impressions || 0),
            clicks: parseInt(d.clicks || 0),
            reach: parseInt(d.reach || 0),
            frequency: parseFloat(d.frequency || 0),
            ctr: parseFloat(d.ctr || 0),
            cpc: parseFloat(d.cpc || 0),
            cpm: parseFloat(d.cpm || 0),
            cpp: parseFloat(d.cpp || 0),
            actions: d.actions || []
          };
        }).catch(e => ({ campaign_id: c.id, insights_error: e.message.slice(0, 100) }))
      );
      const insights = await Promise.all(insightsPromises);
      const byId = Object.fromEntries(insights.map(i => [i.campaign_id, i]));
      campaigns = campaigns.map(c => ({ ...c, insights: byId[c.id] }));
    }

    return json({
      ok: true,
      ad_account_id: adAccountId,
      total: campaigns.length,
      campaigns,
      since: includeInsights ? since : null,
      paging: r.paging
    });
  } catch (e) {
    return error('Meta API: ' + e.message, e.status || 502);
  }
}
