import { json, error, getCurrentUser } from '../../_utils.js';

/* V21.5 — POST /api/viral-grid/save-materialized-pack
   Save pre-built pack (browser materialized) into packs table + link to session. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { session_id, pack_name, brand_with_dna, posts } = body;
  if (!pack_name || !Array.isArray(posts) || posts.length === 0) return error('Missing pack_name or posts[]', 400);

  const packId = crypto.randomUUID();
  const now = Date.now();

  try {
    await env.DB.prepare(
      `INSERT INTO packs (id, user_id, name, brand_json, posts_json, viral_grid_session_id, content_matrix_used_idea_ids, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(
      packId, user.id, pack_name,
      JSON.stringify(brand_with_dna || {}),
      JSON.stringify(posts),
      session_id || null,
      JSON.stringify(posts.map(p => p.source_idea_id).filter(Boolean)),
      now, now
    ).run();
  } catch (e) {
    // Fallback if viral_grid_session_id column doesn't exist (V20 schema not applied)
    try {
      await env.DB.prepare(
        `INSERT INTO packs (id, user_id, name, brand_json, posts_json, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(packId, user.id, pack_name, JSON.stringify(brand_with_dna || {}), JSON.stringify(posts), now, now).run();
    } catch (e2) {
      return error('Save pack: ' + e2.message, 500);
    }
  }

  // Link session
  if (session_id) {
    try {
      await env.DB.prepare(
        'UPDATE viral_grid_sessions SET materialized_pack_id = ?, updated_at = ? WHERE id = ? AND user_id = ?'
      ).bind(packId, Date.now(), session_id, user.id).run();
    } catch (e) {}
  }

  return json({ ok: true, pack_id: packId, name: pack_name, posts_count: posts.length });
}
