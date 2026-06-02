import { json, error, getCurrentUser } from '../../../../_utils.js';
import { getPackRole, can, logActivity } from '../../../../_permissions.js';

const VALID_ROLES = ['admin', 'editor', 'commenter', 'viewer'];

/* PATCH /api/packs/:id/share/:email  body: { role } — change collaborator role */
export async function onRequestPatch({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const packId = params.id;
  const email = decodeURIComponent(params.email).toLowerCase();

  const myRole = await getPackRole(env, packId, user.id, user.email);
  if (!can(myRole, 'change_role')) return error('Cần role admin+', 403);

  let body;
  try { body = await request.json(); } catch (e) { return error('Invalid JSON'); }
  const newRole = String(body.role || '').trim();
  if (!VALID_ROLES.includes(newRole)) return error(`Invalid role`);

  // Admin can't promote to admin (only owner can)
  if (newRole === 'admin' && myRole !== 'owner') return error('Chỉ owner mới promote admin');

  const r = await env.DB.prepare(
    `UPDATE pack_shares SET role = ? WHERE pack_id = ? AND collaborator_email = ?`
  ).bind(newRole, packId, email).run();

  if (!r.meta.changes) return error('Collaborator not found', 404);
  await logActivity(env, packId, user, 'role_change', email, { newRole });
  return json({ ok: true, email, role: newRole });
}

/* DELETE /api/packs/:id/share/:email — revoke access */
export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const packId = params.id;
  const email = decodeURIComponent(params.email).toLowerCase();

  const myRole = await getPackRole(env, packId, user.id, user.email);
  // Admin can remove, OR user can remove themselves
  const isSelfRemove = user.email.toLowerCase() === email;
  if (!can(myRole, 'remove_users') && !isSelfRemove) return error('No permission', 403);

  // Cannot remove owner (only transfer ownership)
  const pack = await env.DB.prepare('SELECT user_id FROM packs WHERE id = ?').bind(packId).first();
  if (pack) {
    const target = await env.DB.prepare('SELECT id FROM users WHERE LOWER(email) = ?').bind(email).first();
    if (target && target.id === pack.user_id) return error('Không thể remove owner', 400);
  }

  await env.DB.prepare('DELETE FROM pack_shares WHERE pack_id = ? AND collaborator_email = ?').bind(packId, email).run();
  await logActivity(env, packId, user, 'unshare', email);
  return json({ ok: true });
}
