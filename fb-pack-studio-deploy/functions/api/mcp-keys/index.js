import { json, error, getCurrentUser } from '../../_utils.js';
import { generateMcpKey, hashMcpKey, ALL_SCOPES } from '../../_mcp_auth.js';

/* V16 — POST /api/mcp-keys  → create new MCP API key
   Body: { label, scopes[], expires_days? }
   Returns: { ok, key (FULL — show once!), prefix, key_hash, label, scopes, expires_at }

   GET /api/mcp-keys  → list user's keys (NO full key, just metadata)
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { label = 'Claude Desktop', scopes = ['packs:read', 'packs:write', 'gen:write', 'publish:write', 'ads:read'], expires_days } = body;

  // Validate scopes
  const validIds = ALL_SCOPES.map(s => s.id).concat(['*']);
  const filtered = scopes.filter(s => validIds.includes(s));
  if (filtered.length === 0) return error('Cần ít nhất 1 scope hợp lệ', 400);

  // Generate key
  const fullKey = generateMcpKey();
  const keyHash = await hashMcpKey(fullKey);
  const prefix = fullKey.slice(0, 16) + '...';

  const expiresAt = expires_days ? Date.now() + expires_days * 86400 * 1000 : null;
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO mcp_api_keys (key_hash, user_id, label, scopes, prefix, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(keyHash, user.id, label.slice(0, 100), filtered.join(','), prefix, now, expiresAt).run();

  return json({
    ok: true,
    key: fullKey,                  // FULL KEY — ONLY RETURNED ONCE
    key_hash: keyHash,
    prefix,
    label,
    scopes: filtered,
    expires_at: expiresAt,
    created_at: now,
    mcp_url: new URL(request.url).origin + '/mcp',
    warning: 'Lưu key này ngay — sẽ KHÔNG hiện lại. Mất → revoke + tạo mới.'
  });
}

export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const rows = await env.DB.prepare(
    `SELECT key_hash, label, scopes, prefix, created_at, last_used_at, expires_at, revoked_at, call_count
       FROM mcp_api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC`
  ).bind(user.id).all();

  return json({
    ok: true,
    keys: (rows.results || []).map(k => ({
      key_hash: k.key_hash,
      label: k.label,
      scopes: (k.scopes || '').split(',').filter(Boolean),
      prefix: k.prefix,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      expires_at: k.expires_at,
      revoked: !!k.revoked_at,
      call_count: k.call_count || 0,
      status: k.revoked_at ? 'revoked' : (k.expires_at && k.expires_at < Date.now() ? 'expired' : 'active')
    })),
    mcp_url: new URL(request.url).origin + '/mcp',
    available_scopes: ALL_SCOPES
  });
}
