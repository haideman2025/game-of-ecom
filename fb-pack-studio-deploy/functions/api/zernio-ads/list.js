import { json, error, getCurrentUser } from '../../_utils.js';
import { getZernioKey, zernioGet } from '../_zernio.js';

/* V14.35 — GET /api/zernio-ads/list?platform=metaads
   List ad campaigns + insights summary for a user.
   Optional: ?include_insights=1 to fetch analytics per campaign (slow). */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || 'metaads';
  const includeInsights = url.searchParams.get('include_insights') === '1';

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  try {
    const r = await zernioGet(apiKey, '/ads', { platform });
    const ads = r.ads || r.data || (Array.isArray(r) ? r : []) || [];
    const list = Array.isArray(ads) ? ads : [];

    if (includeInsights && list.length > 0) {
      // Fetch insights for first 10 only (avoid quota burn)
      const top = list.slice(0, 10);
      for (const a of top) {
        try {
          const ins = await zernioGet(apiKey, `/ads/${a._id || a.id}/analytics`);
          a.insights = ins.summary || ins;
        } catch (e) { a.insights_error = e.message.slice(0, 80); }
      }
    }

    return json({
      platform,
      total: list.length,
      ads: list.map(a => ({
        id: a._id || a.id,
        name: a.name,
        platform: a.platform,
        status: a.status,
        goal: a.goal,
        budget: a.budget,
        spend: a.spend || a.totalSpend,
        impressions: a.impressions,
        clicks: a.clicks,
        ctr: a.ctr,
        cpc: a.cpc,
        cpm: a.cpm,
        conversions: a.conversions,
        roas: a.roas,
        ad_count: a.adCount || a.ad_count || (Array.isArray(a.ads) ? a.ads.length : null),
        created_at: a.createdAt || a.created_at,
        schedule: a.schedule,
        insights: a.insights
      }))
    });
  } catch (e) {
    return error('Zernio Ads list: ' + e.message, e.status || 502);
  }
}
