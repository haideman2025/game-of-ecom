import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* GET /api/vault/list?pack_id=X — list vault files (no content_text, just metadata) */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const packId = url.searchParams.get('pack_id');
  if (!packId) return error('Missing pack_id');

  try { await requireCap(env, packId, user, 'read_pack'); }
  catch (e) { return error(e.message, e.status || 403); }

  const r = await env.DB.prepare(
    `SELECT id, filename, mime, size_bytes, category, notes, content_summary,
            (CASE WHEN content_text IS NOT NULL AND LENGTH(content_text) > 0 THEN 1 ELSE 0 END) as has_text,
            LENGTH(content_text) as text_chars,
            r2_key, created_at
     FROM vault_files
     WHERE pack_id = ?
     ORDER BY created_at ASC`
  ).bind(packId).all();

  const rows = r.results || [];
  const totalBytes = rows.reduce((s, x) => s + (x.size_bytes || 0), 0);
  const totalChars = rows.reduce((s, x) => s + (x.text_chars || 0), 0);

  return json({
    files: rows,
    count: rows.length,
    total_bytes: totalBytes,
    total_chars: totalChars,
    limit_files: 10,
    limit_bytes: 100 * 1024 * 1024,
    pct_used: Math.round((totalBytes / (100 * 1024 * 1024)) * 100)
  });
}
