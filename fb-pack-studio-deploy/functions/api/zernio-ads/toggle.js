import { json, error, getCurrentUser } from '../../_utils.js';
import { getZernioKey, zernioPatch, zernioDelete } from '../_zernio.js';

/* V14.35 — POST /api/zernio-ads/toggle
   Body: { ad_id, action: 'pause' | 'resume' | 'delete' | 'update_budget', budget_daily_vnd? }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { ad_id, action, budget_daily_vnd } = body;
  if (!ad_id) return error('Missing ad_id');
  if (!action) return error('Missing action');

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  try {
    let resp;
    if (action === 'pause') {
      resp = await zernioPatch(apiKey, `/ads/${ad_id}`, { status: 'paused' });
    } else if (action === 'resume') {
      resp = await zernioPatch(apiKey, `/ads/${ad_id}`, { status: 'active' });
    } else if (action === 'delete') {
      resp = await zernioDelete(apiKey, `/ads/${ad_id}`);
    } else if (action === 'update_budget') {
      if (!budget_daily_vnd || budget_daily_vnd < 30000) return error('Min budget 30,000 VND/day');
      resp = await zernioPatch(apiKey, `/ads/${ad_id}`, {
        budget: { amount: budget_daily_vnd, type: 'daily', currency: 'VND' }
      });
    } else {
      return error('Invalid action — use pause/resume/delete/update_budget');
    }
    return json({ ok: true, ad_id, action, result: resp });
  } catch (e) {
    return error('Ad ' + action + ' fail: ' + e.message, e.status || 502);
  }
}
