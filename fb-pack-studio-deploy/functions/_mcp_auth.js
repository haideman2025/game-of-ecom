// V16 — MCP API key auth helper
// Keys format: sk_goe_<64hex> — stored as sha256 hash

/** Hash a full key to its DB storage form */
export async function hashMcpKey(fullKey) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(fullKey));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a fresh key — random 64 hex chars */
export function generateMcpKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `sk_goe_${hex}`;
}

/** Verify a Bearer token from Authorization header.
    Returns { user, scopes[], key_hash } or null if invalid. */
export async function verifyMcpKey(env, authHeader) {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(sk_goe_[a-f0-9]{64})$/i);
  if (!match) return null;
  const fullKey = match[1];
  const keyHash = await hashMcpKey(fullKey);

  const row = await env.DB.prepare(
    `SELECT k.*, u.id AS uid, u.email, u.name
       FROM mcp_api_keys k
       JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = ?
        AND (k.revoked_at IS NULL)
        AND (k.expires_at IS NULL OR k.expires_at > ?)`
  ).bind(keyHash, Date.now()).first();

  if (!row) return null;

  // Update last_used + count (fire & forget)
  env.DB.prepare(
    `UPDATE mcp_api_keys SET last_used_at = ?, call_count = COALESCE(call_count, 0) + 1 WHERE key_hash = ?`
  ).bind(Date.now(), keyHash).run().catch(() => {});

  return {
    user: { id: row.uid, email: row.email, name: row.name },
    key_hash: keyHash,
    label: row.label,
    scopes: (row.scopes || '').split(',').filter(Boolean)
  };
}

/** Throw if scope not granted to this key */
export function requireScope(auth, scope) {
  if (!auth.scopes.includes(scope) && !auth.scopes.includes('*')) {
    const err = new Error(`MCP key thiếu scope "${scope}"`);
    err.code = -32603;
    throw err;
  }
}

/** Log a tool call (fire-and-forget). */
export async function logMcpCall(env, auth, toolName, args, result) {
  try {
    await env.DB.prepare(
      `INSERT INTO mcp_call_log (user_id, key_hash, tool_name, args_preview, status, error_msg, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      auth.user.id,
      auth.key_hash,
      toolName,
      JSON.stringify(args || {}).slice(0, 500),
      result.error ? 'error' : 'ok',
      result.error ? String(result.error).slice(0, 300) : null,
      result.duration_ms || null,
      Date.now()
    ).run();
  } catch (e) {}
}

/** All scope tokens — used by frontend scope picker */
export const ALL_SCOPES = [
  { id: 'packs:read',     label: 'Đọc packs/posts',          desc: 'List packs, get post details' },
  { id: 'packs:write',    label: 'Tạo + sửa packs',          desc: 'Create pack, extend day, edit posts' },
  { id: 'gen:write',      label: 'Generate content',          desc: 'Image, voice, video, storyboard via Gemini/Veo' },
  { id: 'publish:write',  label: 'Schedule + publish posts',   desc: 'Schedule Zernio, publish-now to FB Page' },
  { id: 'ads:read',       label: 'Đọc Meta Ads',              desc: 'List campaigns, insights, ad accounts' },
  { id: 'ads:write',      label: 'Tạo + sửa Meta Ads',        desc: 'Create campaign, boost post, pause/resume — TIÊU TIỀN' }
];
