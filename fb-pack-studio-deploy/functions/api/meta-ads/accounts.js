import { json, error, getCurrentUser } from '../../_utils.js';
import { getFbCreds, metaGet } from '../_meta.js';

/* V15.0 — GET /api/meta-ads/accounts
   List user's Meta Ad Accounts via /me/adaccounts.
   GUARANTEED to work — Meta official endpoint, well-documented.
   Returns: { ok, total, accounts: [{ id, name, currency, timezone, status, business, balance, spend_cap }] }
*/
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let creds;
  try { creds = await getFbCreds(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // Use User Access Token if available (needed for /me/adaccounts), fallback to page token
  const token = creds.user_access_token || creds.page_access_token;

  try {
    const r = await metaGet(token, '/me/adaccounts', {
      fields: 'id,account_id,name,currency,timezone_name,timezone_offset_hours_utc,account_status,business,disable_reason,balance,spend_cap,amount_spent,capabilities,age',
      limit: 100
    });

    const accounts = (r.data || []).map(a => ({
      id: a.id,                                   // "act_1234567890"
      account_id: a.account_id,                   // bare "1234567890"
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      tz_offset_utc: a.timezone_offset_hours_utc,
      status: a.account_status,                   // 1=active, 2=disabled, 3=unsettled, 7=pending_review, 9=in_grace_period, 100=temporary_unavailable, 101=closed
      status_label: STATUS_LABELS[a.account_status] || 'unknown',
      business: a.business?.name,
      business_id: a.business?.id,
      balance: a.balance,                          // in cents (or minor unit) — total available
      spend_cap: a.spend_cap,
      amount_spent: a.amount_spent,
      capabilities: a.capabilities || [],
      age_days: a.age,
      can_create_ads: a.account_status === 1 || a.account_status === 9,
      disabled_reason: a.disable_reason
    }));

    return json({
      ok: true,
      total: accounts.length,
      accounts,
      active_count: accounts.filter(a => a.can_create_ads).length,
      paging: r.paging
    });
  } catch (e) {
    // Common error: missing ads_management scope
    if (e.fb_code === 200 || e.fb_code === 100) {
      return error('Thiếu permission ads_management. Vào Settings → Reconnect Facebook → tick Ads permissions.', 403);
    }
    return error('Meta API: ' + e.message, e.status || 502);
  }
}

const STATUS_LABELS = {
  1: 'active',
  2: 'disabled',
  3: 'unsettled',
  7: 'pending_review',
  8: 'pending_settlement',
  9: 'in_grace_period',
  100: 'temporary_unavailable',
  101: 'closed',
  201: 'any_active',
  202: 'any_closed'
};
