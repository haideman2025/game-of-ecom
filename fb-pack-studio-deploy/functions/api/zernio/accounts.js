import { json, error, getCurrentUser } from '../../_utils.js';
import { getZernioKey, zernioGet } from '../_zernio.js';

/* GET /api/zernio/accounts — list connected FB accounts on Zernio */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  try {
    const r = await zernioGet(apiKey, '/accounts');
    const url = new URL(request.url);
    const raw = url.searchParams.get('raw') === '1';
    if (raw) return json({ _raw: r }); // Debug: dump full Zernio response

    const accs = r.accounts || r.data || r || [];
    const list = Array.isArray(accs) ? accs : [];
    const fb = list.filter(a => (a.platform || '').toLowerCase() === 'facebook');
    const tt = list.filter(a => (a.platform || '').toLowerCase() === 'tiktok');

    // V12.10.1 — Flatten any nested "pages" array if Zernio embeds them per-account
    const flat = [];
    for (const a of fb) {
      // 1. The account itself (if it represents a page)
      flat.push({
        id: a._id || a.id,
        name: a.name || a.username || a.handle || 'FB Page',
        platform: 'facebook',
        profile_id: a.profileId || a.profile_id,
        avatar_url: a.avatarUrl || a.avatar_url || a.pictureUrl || a.picture_url,
        connected_at: a.connectedAt || a.connected_at,
        is_active: true,
        parent_account_id: null,
        page_id: a.pageId || a.page_id || a.fbPageId || null
      });
      // 2. Any nested pages array (different naming conventions)
      const nestedPages = a.pages || a.managedPages || a.facebookPages || a.fb_pages || [];
      if (Array.isArray(nestedPages)) {
        for (const p of nestedPages) {
          // Skip if same as parent
          const pid = p._id || p.id || p.pageId || p.page_id;
          if (pid && pid === (a._id || a.id)) continue;
          flat.push({
            id: pid,
            name: p.name || p.title || 'FB Page',
            platform: 'facebook',
            profile_id: a.profileId || a.profile_id,
            avatar_url: p.avatarUrl || p.avatar_url || p.pictureUrl || p.picture,
            connected_at: a.connectedAt || a.connected_at,
            is_active: false,
            parent_account_id: a._id || a.id,
            page_id: pid
          });
        }
      }
    }

    // V14.25 — TikTok accounts (flat, no nested pages concept on TikTok)
    const ttFlat = [];
    for (const a of tt) {
      ttFlat.push({
        id: a._id || a.id,
        name: a.name || a.username || a.handle || 'TikTok',
        platform: 'tiktok',
        profile_id: a.profileId || a.profile_id,
        avatar_url: a.avatarUrl || a.avatar_url || a.pictureUrl || a.picture_url,
        connected_at: a.connectedAt || a.connected_at,
        username: a.username || a.handle,
        is_active: true
      });
    }

    // V14.25 — Combined list with platform field exposed (for unified dropdown UI)
    const combined = [...flat, ...ttFlat];

    return json({
      total: list.length,
      facebook_count: flat.length,
      tiktok_count: ttFlat.length,
      facebook_accounts: flat,
      tiktok_accounts: ttFlat,
      combined_accounts: combined,
      all_accounts: list.map(a => ({
        id: a._id || a.id,
        platform: a.platform,
        name: a.name || a.username || a.handle
      })),
      // Hint for user when only 1 result
      hint: combined.length === 0
        ? 'Chưa có account nào kết nối Zernio. Mở zernio.com/dashboard/connections → connect Facebook hoặc TikTok.'
        : (flat.length <= 1 && ttFlat.length === 0)
        ? 'Zernio chỉ trả 1 FB page. Để thấy nhiều pages, mở zernio.com/dashboard/connections → "Manage Pages" trên Facebook connection. Để publish TikTok, connect thêm TikTok ở cùng dashboard.'
        : (ttFlat.length === 0)
        ? 'Chưa connect TikTok. Mở zernio.com/dashboard/connections → connect TikTok để publish video lên TikTok.'
        : null
    });
  } catch (e) {
    return error('Zernio: ' + e.message, e.status || 502);
  }
}

/* PUT /api/zernio/accounts  body: { account_id }
   Switch the active FB account user wants to publish to. */
export async function onRequestPut({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  if (!body.account_id) return error('Missing account_id');

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // Verify account belongs to this Zernio key
  try {
    const r = await zernioGet(apiKey, '/accounts');
    const list = (r.accounts || r.data || r || []);
    const found = (Array.isArray(list) ? list : []).find(a => (a._id || a.id) === body.account_id);
    if (!found) return error('Account ID không tồn tại trên Zernio account này');

    // V14.25 — Persist platform so frontend can show platform badge for default account
    const accountName = found.name || found.username || found.handle || 'Account';
    const accountPlatform = (found.platform || 'facebook').toLowerCase();
    await env.DB.prepare(
      `UPDATE users SET zernio_account_id = ?, zernio_account_name = ? WHERE id = ?`
    ).bind(body.account_id, `[${accountPlatform.toUpperCase()}] ${accountName}`, user.id).run();

    return json({ ok: true, account: { id: body.account_id, name: accountName, platform: accountPlatform } });
  } catch (e) {
    return error('Zernio: ' + e.message, e.status || 502);
  }
}
