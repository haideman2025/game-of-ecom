import { json, error, getCurrentUser } from '../../../_utils.js';
import { requireCap } from '../../../_permissions.js';
import { getZernioKey, zernioGet } from '../../_zernio.js';

/* GET /api/packs/:id/account — current pack's bound FB account (or fallback to user default) */
export async function onRequestGet({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const packId = params.id;
  if (!packId) return error('Missing pack id');

  try { await requireCap(env, packId, user, 'read_pack'); }
  catch (e) { return error(e.message, e.status || 403); }

  const pack = await env.DB.prepare(
    `SELECT zernio_account_id, zernio_account_name, zernio_account_updated_at FROM packs WHERE id = ?`
  ).bind(packId).first();
  if (!pack) return error('Pack not found', 404);

  // Fallback to user default
  const u = await env.DB.prepare(
    `SELECT zernio_account_id, zernio_account_name FROM users WHERE id = ?`
  ).bind(user.id).first();

  return json({
    pack_account_id: pack.zernio_account_id || null,
    pack_account_name: pack.zernio_account_name || null,
    pack_account_updated_at: pack.zernio_account_updated_at || null,
    user_default_account_id: u?.zernio_account_id || null,
    user_default_account_name: u?.zernio_account_name || null,
    effective_account_id: pack.zernio_account_id || u?.zernio_account_id || null,
    effective_account_name: pack.zernio_account_name || u?.zernio_account_name || null,
    using_pack_override: !!pack.zernio_account_id
  });
}

/* PUT /api/packs/:id/account  body: { account_id, account_name? }
   Bind pack to specific FB account. Pass null/empty account_id to clear (use user default). */
export async function onRequestPut({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const packId = params.id;
  if (!packId) return error('Missing pack id');

  let body = {};
  try { body = await request.json(); } catch (e) {}

  try { await requireCap(env, packId, user, 'edit_settings'); }
  catch (e) { return error(e.message, e.status || 403); }

  const accountId = (body.account_id || '').trim() || null;
  let accountName = (body.account_name || '').trim() || null;

  if (accountId) {
    // Verify account exists in user's Zernio
    try {
      const apiKey = await getZernioKey(env, user.id);
      const accsResp = await zernioGet(apiKey, '/accounts');
      const list = accsResp.accounts || accsResp.data || accsResp || [];
      const found = (Array.isArray(list) ? list : []).find(a => (a._id || a.id) === accountId);
      if (!found) return error('Account ID không tồn tại trên Zernio account của mày', 400);
      // Lookup name if not provided
      if (!accountName) accountName = found.name || found.username || found.handle || 'FB Page';
    } catch (e) {
      return error('Verify Zernio account failed: ' + e.message, e.status || 502);
    }
  }

  await env.DB.prepare(
    `UPDATE packs SET zernio_account_id = ?, zernio_account_name = ?, zernio_account_updated_at = ? WHERE id = ?`
  ).bind(accountId, accountName, Date.now(), packId).run();

  return json({
    ok: true,
    pack_id: packId,
    account_id: accountId,
    account_name: accountName,
    cleared: !accountId
  });
}

/* DELETE /api/packs/:id/account — clear pack override, fall back to user default */
export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const packId = params.id;
  try { await requireCap(env, packId, user, 'edit_settings'); }
  catch (e) { return error(e.message, e.status || 403); }
  await env.DB.prepare(
    `UPDATE packs SET zernio_account_id = NULL, zernio_account_name = NULL, zernio_account_updated_at = ? WHERE id = ?`
  ).bind(Date.now(), packId).run();
  return json({ ok: true, cleared: true });
}
