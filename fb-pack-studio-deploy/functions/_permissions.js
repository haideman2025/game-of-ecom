/* V10 — Role-based pack access helper */

/* Roles ranking — higher = more permissions */
export const ROLES = {
  owner: 100,
  admin: 80,
  editor: 60,
  commenter: 40,
  viewer: 20,
};

/* What each role can do */
export const CAPABILITIES = {
  // viewer
  read_pack: 20,
  download_media: 20,
  // commenter
  add_comment: 40,
  // editor
  edit_pack: 60,
  gen_content: 60,
  upload_media: 60,
  publish_fb: 60,
  // admin
  invite_users: 80,
  remove_users: 80,
  change_role: 80,
  // owner only
  delete_pack: 100,
  transfer_ownership: 100,
};

/* Get effective role of a user for a pack.
   Returns: 'owner', 'admin', 'editor', 'commenter', 'viewer', or null (no access) */
export async function getPackRole(env, packId, userId, userEmail) {
  // Check ownership first
  const pack = await env.DB.prepare('SELECT user_id FROM packs WHERE id = ?').bind(packId).first();
  if (!pack) return null;
  if (pack.user_id === userId) return 'owner';

  // Check pack_shares (by user_id if accepted, or by email if invited but not accepted)
  let share = null;
  if (userId) {
    share = await env.DB.prepare(
      `SELECT role FROM pack_shares WHERE pack_id = ? AND collaborator_user_id = ? AND accepted_at IS NOT NULL`
    ).bind(packId, userId).first();
  }
  if (!share && userEmail) {
    // Also allow checking by email even before accept (for showing pending invite)
    share = await env.DB.prepare(
      `SELECT role FROM pack_shares WHERE pack_id = ? AND collaborator_email = ?`
    ).bind(packId, userEmail.toLowerCase()).first();
  }
  return share?.role || null;
}

/* Check if role has a specific capability */
export function can(role, capability) {
  if (!role) return false;
  const userLevel = ROLES[role] || 0;
  const needLevel = CAPABILITIES[capability] || 100;
  return userLevel >= needLevel;
}

/* Helper: require a capability or throw 403 response */
export async function requireCap(env, packId, user, capability) {
  const role = await getPackRole(env, packId, user.id, user.email);
  if (!can(role, capability)) {
    const err = new Error(`Forbidden: need ${capability} (your role: ${role || 'none'})`);
    err.status = 403;
    err.role = role;
    throw err;
  }
  return role;
}

/* Touch last_active_at for collaborator (so we can show "active 5m ago") */
export async function touchActivity(env, packId, userId) {
  const now = Date.now();
  try {
    await env.DB.prepare(
      `UPDATE pack_shares SET last_active_at = ? WHERE pack_id = ? AND collaborator_user_id = ?`
    ).bind(now, packId, userId).run();
  } catch (e) { /* ignore */ }
}

/* Log activity for audit + UI awareness */
export async function logActivity(env, packId, user, action, target = null, meta = null) {
  try {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO pack_activity (id, pack_id, user_id, user_email, user_name, action, target, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, packId, user.id, user.email, user.name || null, action, target, meta ? JSON.stringify(meta) : null, Date.now()).run();
  } catch (e) { console.warn('logActivity', e); }
}
