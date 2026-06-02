import { getCurrentUser, tierState, uuid, json, error } from '../../_utils.js';

/* List packs — V10: owned + shared (with role) */
export const onRequestGet = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Not authenticated', 401);

  // 1. Owned packs
  const owned = await env.DB.prepare(`SELECT id, name, brand_json, posts_json, mascot_refs_json, product_refs_json,
    image_count, audio_count, video_count, scene_count, created_at, updated_at
    FROM packs WHERE user_id = ? ORDER BY updated_at DESC`).bind(user.id).all();

  // 2. Shared packs (accepted invites)
  const shared = await env.DB.prepare(`SELECT p.id, p.name, p.brand_json, p.posts_json, p.mascot_refs_json, p.product_refs_json,
    p.image_count, p.audio_count, p.video_count, p.scene_count, p.created_at, p.updated_at,
    s.role, s.accepted_at AS share_accepted_at,
    owner.email AS owner_email, owner.name AS owner_name, owner.picture AS owner_picture
    FROM pack_shares s
    JOIN packs p ON p.id = s.pack_id
    JOIN users owner ON owner.id = p.user_id
    WHERE s.collaborator_user_id = ? AND s.accepted_at IS NOT NULL
    ORDER BY p.updated_at DESC`).bind(user.id).all();

  const parsePack = (p, role, owner) => {
    const out = { ...p };
    try { out.brand = p.brand_json ? JSON.parse(p.brand_json) : null; } catch(e) { out.brand = null; }
    try { out.posts = p.posts_json ? JSON.parse(p.posts_json) : []; } catch(e) { out.posts = []; }
    try { out.mascotRefs = p.mascot_refs_json ? JSON.parse(p.mascot_refs_json) : []; } catch(e) { out.mascotRefs = []; }
    try { out.productRefs = p.product_refs_json ? JSON.parse(p.product_refs_json) : []; } catch(e) { out.productRefs = []; }
    delete out.brand_json; delete out.posts_json; delete out.mascot_refs_json; delete out.product_refs_json;
    out.role = role;
    if (owner) {
      out.owner = { email: owner.owner_email, name: owner.owner_name, picture: owner.owner_picture };
    }
    return out;
  };

  const packs = [
    ...(owned.results || []).map(p => parsePack(p, 'owner', null)),
    ...(shared.results || []).map(p => parsePack(p, p.role, p))
  ];

  return json({ packs });
};

/* Create new pack */
export const onRequestPost = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Not authenticated', 401);
  const state = tierState(user);
  if (state.expired) return error('Trial expired. Upgrade to create new packs.', 403);
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM packs WHERE user_id = ?').bind(user.id).first();
  if ((countRow?.c || 0) >= state.maxPacks) {
    return error(`Pack limit reached (${state.maxPacks}). Delete an old pack or upgrade tier.`, 403);
  }
  const body = await request.json().catch(() => ({}));
  const id = body.id || uuid();
  const name = body.name || 'Untitled Pack';
  const now = Date.now();
  /* Note: mascot/product refs stored as JSON only if small (no base64 mass).
     Client should strip base64 before sending if syncing to cloud. */
  await env.DB.prepare(`INSERT INTO packs (id, user_id, name, brand_json, posts_json, mascot_refs_json, product_refs_json,
    image_count, audio_count, video_count, scene_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, user.id, name,
    JSON.stringify(body.brand || null),
    JSON.stringify(body.posts || []),
    JSON.stringify(body.mascotRefs || []),
    JSON.stringify(body.productRefs || []),
    body.image_count || 0, body.audio_count || 0, body.video_count || 0, body.scene_count || 0,
    now, now
  ).run();
  return json({ id, name, created_at: now, updated_at: now });
};
