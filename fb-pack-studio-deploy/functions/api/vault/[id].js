import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* GET /api/vault/:id — full content_text (heavy, used by strategist or preview) */
export async function onRequestGet({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const row = await env.DB.prepare(
    `SELECT id, pack_id, filename, mime, size_bytes, content_text, content_summary, category, notes, r2_key, created_at
     FROM vault_files WHERE id = ?`
  ).bind(params.id).first();
  if (!row) return error('Not found', 404);

  try { await requireCap(env, row.pack_id, user, 'read_pack'); }
  catch (e) { return error(e.message, e.status || 403); }

  return json(row);
}

/* DELETE /api/vault/:id — remove file from D1 + R2 */
export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const row = await env.DB.prepare(
    `SELECT id, pack_id, r2_key, user_id FROM vault_files WHERE id = ?`
  ).bind(params.id).first();
  if (!row) return error('Not found', 404);

  try { await requireCap(env, row.pack_id, user, 'edit_settings'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Delete R2 object if exists
  if (row.r2_key && env.MEDIA) {
    try { await env.MEDIA.delete(row.r2_key); } catch (e) { console.warn('R2 delete:', e.message); }
  }

  await env.DB.prepare(`DELETE FROM vault_files WHERE id = ?`).bind(params.id).run();
  return json({ ok: true, id: params.id });
}
