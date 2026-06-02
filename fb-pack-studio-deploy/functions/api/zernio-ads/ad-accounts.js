import { json, error, getCurrentUser } from '../../_utils.js';
import { getZernioKey, zernioGet } from '../_zernio.js';

/* V14.36.1 — GET /api/zernio-ads/ad-accounts?platform=metaads
   List Meta Ad Accounts connected to Zernio.
   Tries multiple endpoint shapes + nested per-account fallback.
   Always returns debug info so frontend can show what was actually fetched.
*/
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || 'metaads';

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  const attemptLog = [];

  // Helper: try a path, log result
  async function tryPath(path) {
    try {
      const r = await zernioGet(apiKey, path);
      attemptLog.push({ path, status: 'ok', shape_keys: Object.keys(r || {}).slice(0, 10) });
      return r;
    } catch (e) {
      attemptLog.push({ path, status: 'fail', http: e.status, msg: (e.message || '').slice(0, 120) });
      return null;
    }
  }

  // Helper: extract list from any shape
  function extractList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    for (const key of ['accounts', 'adAccounts', 'ad_accounts', 'data', 'results', 'items', 'list']) {
      if (Array.isArray(raw[key])) return raw[key];
    }
    return [];
  }

  // PHASE 1 — try dedicated ad-account endpoints
  const directPaths = [
    '/ads/accounts',
    `/ads/accounts?platform=${platform}`,
    '/ads/adAccounts',
    '/ads/ad-accounts',
    '/adAccounts',
    '/ad-accounts',
    `/${platform}/accounts`,
    `/${platform}/ad-accounts`,
    `/integrations/${platform}/ad-accounts`,
    `/integrations/meta/ad-accounts`
  ];

  let rawList = [];
  let firstRawSample = null;

  for (const p of directPaths) {
    const r = await tryPath(p);
    if (r) {
      const list = extractList(r);
      if (list.length > 0) {
        rawList = list;
        firstRawSample = list[0];
        break;
      }
    }
  }

  // PHASE 2 — fallback to /accounts and look for nested adAccounts
  if (rawList.length === 0) {
    const r = await tryPath('/accounts');
    if (r) {
      const accs = extractList(r);
      const flat = [];
      for (const a of accs) {
        // Each FB account may have nested adAccounts
        if (Array.isArray(a.adAccounts) && a.adAccounts.length > 0) {
          for (const ad of a.adAccounts) flat.push({ ...ad, _parent: a.name || a._id });
        } else if (Array.isArray(a.ad_accounts) && a.ad_accounts.length > 0) {
          for (const ad of a.ad_accounts) flat.push({ ...ad, _parent: a.name || a._id });
        } else if ((a.platform || '').toLowerCase() === 'metaads' || (a.platform || '').toLowerCase() === 'meta') {
          flat.push(a);
        }
      }
      rawList = flat;
      if (!firstRawSample && accs.length > 0) firstRawSample = accs[0];
    }
  }

  // PHASE 3 — try GET /accounts/{id}/adAccounts per account
  if (rawList.length === 0) {
    try {
      const r = await tryPath('/accounts');
      const accs = extractList(r);
      // Try fetching ad accounts for first 3 FB pages
      for (const a of accs.slice(0, 3)) {
        const aid = a._id || a.id;
        if (!aid) continue;
        for (const subPath of [`/accounts/${aid}/adAccounts`, `/accounts/${aid}/ad-accounts`, `/accounts/${aid}/ads`]) {
          const sub = await tryPath(subPath);
          if (sub) {
            const subList = extractList(sub);
            for (const ad of subList) rawList.push({ ...ad, _parent: a.name || aid });
            if (subList.length > 0) break;
          }
        }
      }
    } catch (e) {}
  }

  // Normalize — extract every plausible name + currency field
  const accounts = rawList.map(a => {
    // Try every common field for name
    const name = a.name || a.adAccountName || a.ad_account_name || a.title
      || a.business_name || a.businessName || a.account_name
      || (a._parent ? `Sub of ${a._parent}` : null)
      || (a._id || a.id ? `Account ${String(a._id || a.id).slice(-8)}` : 'Unknown');

    // Try every common field for currency
    const currency = a.currency || a.account_currency || a.accountCurrency
      || a.business_currency || a.adAccountCurrency || null;

    // Try every common field for Meta act_ID
    const meta_id = a.adAccountId || a.meta_ad_account_id || a.act_id || a.metaAdAccountId
      || (a.id && String(a.id).startsWith('act_') ? a.id : null)
      || (a._id && String(a._id).startsWith('act_') ? a._id : null);

    return {
      id: a._id || a.id || meta_id,
      meta_id,
      name,
      currency: currency || 'unknown',
      status: a.status || a.account_status,
      timezone: a.timezone || a.timezone_name || a.account_timezone,
      business: a.business || a.business_name,
      parent: a._parent,
      raw_keys: Object.keys(a).slice(0, 15)  // V14.36.1 — expose for debug
    };
  }).filter(a => a.id || a.meta_id);

  return json({
    platform,
    total: accounts.length,
    accounts,
    debug: {
      attempts: attemptLog,
      first_raw_sample: firstRawSample,
      raw_count: rawList.length,
      hint: accounts.length === 0
        ? 'Không endpoint nào trả về ad accounts. Có thể Zernio API ẩn ad accounts ở Pro plan only, hoặc path khác. Paste act_XXX tay trong dropdown.'
        : accounts.every(a => a.name.includes('Unknown') || a.name.includes('Account ')) && accounts.length > 0
        ? 'Endpoint trả về data nhưng KHÔNG có name/currency field. Check first_raw_sample để xem shape thật.'
        : 'OK'
    }
  });
}
