import { getCurrentUser, json, error } from '../../_utils.js';

const parsePack = (p) => {
  const out = { ...p };
  try { out.brand = p.brand_json ? JSON.parse(p.brand_json) : null; } catch(e) { out.brand = null; }
  try { out.posts = p.posts_json ? JSON.parse(p.posts_json) : []; } catch(e) { out.posts = []; }
  try { out.mascotRefs = p.mascot_refs_json ? JSON.parse(p.mascot_refs_json) : []; } catch(e) { out.mascotRefs = []; }
  try { out.productRefs = p.product_refs_json ? JSON.parse(p.product_refs_json) : []; } catch(e) { out.productRefs = []; }
  delete out.brand_json; delete out.posts_json; delete out.mascot_refs_json; delete out.product_refs_json;
  return out;
};

export const onRequestGet = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Not authenticated', 401);
  const p = await env.DB.prepare('SELECT * FROM packs WHERE id = ? AND user_id = ?').bind(params.id, user.id).first();
  if (!p) return error('Pack not found', 404);
  return json(parsePack(p));
};

export const onRequestPut = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Not authenticated', 401);
  const existing = await env.DB.prepare('SELECT id FROM packs WHERE id = ? AND user_id = ?').bind(params.id, user.id).first();
  if (!existing) return error('Pack not found', 404);
  const body = await request.json().catch(() => ({}));
  const now = Date.now();
  await env.DB.prepare(`UPDATE packs SET name=?, brand_json=?, posts_json=?, mascot_refs_json=?, product_refs_json=?,
    image_count=?, audio_count=?, video_count=?, scene_count=?, updated_at=? WHERE id=? AND user_id=?`).bind(
    body.name || 'Untitled',
    JSON.stringify(body.brand || null),
    JSON.stringify(body.posts || []),
    JSON.stringify(body.mascotRefs || []),
    JSON.stringify(body.productRefs || []),
    body.image_count || 0, body.audio_count || 0, body.video_count || 0, body.scene_count || 0,
    now, params.id, user.id
  ).run();
  return json({ ok: true, updated_at: now });
};

export const onRequestDelete = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Not authenticated', 401);

  // V17.1 — Verify ownership first, then cascade delete related rows manually
  // (in case FK constraints don't have ON DELETE CASCADE)
  const existing = await env.DB.prepare(
    'SELECT id FROM packs WHERE id = ? AND user_id = ?'
  ).bind(params.id, user.id).first();
  if (!existing) return error('Pack not found', 404);

  const packId = params.id;
  const cleanup = [];

  // Cascade delete related tables (best-effort — ignore errors per table)
  const relatedTables = [
    'pack_shares',
    'scheduled_posts',
    'vault_files',
    'video_projects',
    'ads_log',
    'media_files',
    'pack_posts'
  ];

  for (const table of relatedTables) {
    try {
      const r = await env.DB.prepare(`DELETE FROM ${table} WHERE pack_id = ?`).bind(packId).run();
      if (r.meta?.changes) cleanup.push({ table, deleted: r.meta.changes });
    } catch (e) {
      // Table may not exist or have no pack_id column — skip
    }
  }

  // Finally delete the pack itself
  try {
    const r = await env.DB.prepare('DELETE FROM packs WHERE id = ? AND user_id = ?').bind(packId, user.id).run();
    if (!r.meta?.changes) return error('Pack deletion failed (no rows affected)', 500);
  } catch (e) {
    return error('Pack delete error: ' + e.message, 500);
  }

  return json({ ok: true, pack_id: packId, cascaded: cleanup });
};
