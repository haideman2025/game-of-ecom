import { json, error, getCurrentUser } from '../../_utils.js';
import { getFbCreds, metaPost, metaDelete, toMetaBudgetMinor } from '../_meta.js';

/* V15.0 — POST /api/meta-ads/toggle
   Pause/resume/delete a Meta campaign or update budget.

   Body: {
     id,                       // campaign_id (or adset_id with target='adset')
     target = 'campaign',      // 'campaign' | 'adset' | 'ad'
     action,                   // 'pause' | 'resume' | 'delete' | 'update_budget'
     budget?,                  // for update_budget — amount in major units
     budget_type?,             // 'daily' | 'lifetime'
     currency = 'VND'
   }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { id, target = 'campaign', action, budget, budget_type = 'daily', currency = 'VND' } = body;
  if (!id) return error('Missing id', 400);
  if (!action) return error('Missing action', 400);

  let creds;
  try { creds = await getFbCreds(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  const token = creds.user_access_token || creds.page_access_token;

  try {
    let result;
    if (action === 'pause') {
      result = await metaPost(token, `/${id}`, { status: 'PAUSED' });
    } else if (action === 'resume' || action === 'activate') {
      result = await metaPost(token, `/${id}`, { status: 'ACTIVE' });
    } else if (action === 'delete' || action === 'archive') {
      // Meta soft-archives — use status=DELETED via POST (DELETE method also works)
      try {
        result = await metaDelete(token, `/${id}`);
      } catch (e) {
        // Fallback to POST status=DELETED
        result = await metaPost(token, `/${id}`, { status: 'DELETED' });
      }
    } else if (action === 'update_budget') {
      if (!budget || budget < 1) return error('Missing budget', 400);
      const budgetMinor = toMetaBudgetMinor(budget, currency);
      const field = budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
      // Budget is set on the AdSet, not the Campaign. If user passes campaign_id, list adsets and update each
      if (target === 'campaign') {
        // List adsets, update each
        const { metaGet } = await import('../_meta.js');
        const adsetsRes = await metaGet(token, `/${id}/adsets`, { fields: 'id,name' });
        const adsets = adsetsRes.data || [];
        const updates = [];
        for (const a of adsets) {
          try {
            const r = await metaPost(token, `/${a.id}`, { [field]: budgetMinor });
            updates.push({ adset_id: a.id, name: a.name, status: 'ok', new_budget_minor: budgetMinor });
          } catch (e) {
            updates.push({ adset_id: a.id, name: a.name, status: 'fail', error: e.message });
          }
        }
        result = { ok: true, target: 'campaign-via-adsets', updates };
      } else {
        result = await metaPost(token, `/${id}`, { [field]: budgetMinor });
      }
    } else {
      return error('Invalid action — use pause/resume/delete/update_budget', 400);
    }

    return json({
      ok: true,
      id,
      target,
      action,
      result
    });
  } catch (e) {
    return error(`Meta ${action} fail: ${e.message}`, e.status || 502);
  }
}
