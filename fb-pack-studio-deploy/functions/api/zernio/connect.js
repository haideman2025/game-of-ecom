import { json, error, getCurrentUser } from '../../_utils.js';
import { zernioValidateKey } from '../_zernio.js';

/* POST /api/zernio/connect  body: { api_key, account_id? }
   Saves Zernio API key + selected FB account. Validates by listing accounts. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const apiKey = (body.api_key || '').trim();
  if (!apiKey) return error('Missing api_key');
  if (!apiKey.startsWith('sk_') || apiKey.length < 30) {
    return error('API key không hợp lệ — phải bắt đầu bằng "sk_" và dài 67 ký tự');
  }

  // Validate
  const val = await zernioValidateKey(apiKey);
  if (!val.ok) {
    return error(`Zernio API key không hoạt động: ${val.error}`, val.status || 502);
  }

  const fbAccs = val.facebook_accounts || [];
  if (fbAccs.length === 0) {
    return json({
      saved: false,
      warning: 'Key OK nhưng chưa có Facebook account nào connect trên Zernio. Vào zernio.com/dashboard/connections để kết nối FB trước.',
      accounts: val.accounts || []
    });
  }

  // Pick account: client-specified, else first FB account
  let chosen = null;
  if (body.account_id) chosen = fbAccs.find(a => (a._id || a.id) === body.account_id);
  if (!chosen) chosen = fbAccs[0];

  const accountId = chosen._id || chosen.id;
  const accountName = chosen.name || chosen.username || chosen.handle || 'Unknown FB Page';

  // Save to D1
  await env.DB.prepare(
    `UPDATE users SET zernio_api_key = ?, zernio_account_id = ?, zernio_account_name = ?, zernio_connected_at = ? WHERE id = ?`
  ).bind(apiKey, accountId, accountName, Date.now(), user.id).run();

  return json({
    saved: true,
    account: { id: accountId, name: accountName, platform: 'facebook' },
    facebook_accounts: fbAccs.map(a => ({
      id: a._id || a.id,
      name: a.name || a.username || a.handle || 'FB Page',
      profile_id: a.profileId || a.profile_id,
      avatar_url: a.avatarUrl || a.avatar_url
    }))
  });
}

/* GET /api/zernio/connect — return current connection status */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const u = await env.DB.prepare(
    `SELECT zernio_account_id, zernio_account_name, zernio_connected_at FROM users WHERE id = ?`
  ).bind(user.id).first();

  const connected = !!(u?.zernio_account_id);
  return json({
    connected,
    account_id: u?.zernio_account_id || null,
    account_name: u?.zernio_account_name || null,
    connected_at: u?.zernio_connected_at || null
  });
}

/* DELETE /api/zernio/connect — disconnect */
export async function onRequestDelete({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  await env.DB.prepare(
    `UPDATE users SET zernio_api_key = NULL, zernio_account_id = NULL, zernio_account_name = NULL, zernio_connected_at = NULL WHERE id = ?`
  ).bind(user.id).run();
  return json({ disconnected: true });
}
