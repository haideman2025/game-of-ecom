import { json, error, getCurrentUser } from '../../_utils.js';

/* V16 — DELETE /api/mcp-keys/{key_hash}  → revoke a key (soft delete)
   Owner-only. */
export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const keyHash = params.hash;
  if (!keyHash) return error('Missing key_hash', 400);

  // Verify ownership before revoke
  const row = await env.DB.prepare('SELECT user_id FROM mcp_api_keys WHERE key_hash = ?').bind(keyHash).first();
  if (!row) return error('Key không tồn tại', 404);
  if (row.user_id !== user.id) return error('Không phải key của bạn', 403);

  await env.DB.prepare(
    'UPDATE mcp_api_keys SET revoked_at = ? WHERE key_hash = ?'
  ).bind(Date.now(), keyHash).run();

  return json({ ok: true, revoked: keyHash });
}
