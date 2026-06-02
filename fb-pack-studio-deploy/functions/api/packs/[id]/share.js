import { json, error, getCurrentUser } from '../../../_utils.js';
import { getPackRole, can, logActivity, ROLES } from '../../../_permissions.js';

const VALID_ROLES = ['admin', 'editor', 'commenter', 'viewer'];

/* POST /api/packs/:id/share  body: { email, role }
   Invite a user by email. Owner + Admin can invite.
   Admin cannot invite as owner (only owner can transfer). */
export async function onRequestPost({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const packId = params.id;

  const myRole = await getPackRole(env, packId, user.id, user.email);
  if (!can(myRole, 'invite_users')) return error(`Cần role admin+ để invite (role hiện tại: ${myRole || 'none'})`, 403);

  let body;
  try { body = await request.json(); } catch (e) { return error('Invalid JSON'); }
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || 'editor').trim();
  if (!email || !email.includes('@')) return error('Invalid email');
  if (!VALID_ROLES.includes(role)) return error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);

  // Cannot invite yourself
  if (email === user.email.toLowerCase()) return error('Không thể invite chính mày');

  // If admin trying to invite as admin, check they're at least admin
  if (role === 'admin' && myRole !== 'owner' && myRole !== 'admin') {
    return error('Chỉ owner/admin mới invite làm admin');
  }

  // Check if user exists in our system (Google OAuth)
  const existingUser = await env.DB.prepare('SELECT id, name FROM users WHERE LOWER(email) = ?').bind(email).first();

  // Pack owner
  const pack = await env.DB.prepare('SELECT user_id FROM packs WHERE id = ?').bind(packId).first();
  if (!pack) return error('Pack not found', 404);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO pack_shares (pack_id, owner_user_id, collaborator_email, collaborator_user_id, role, invited_at, invited_by_user_id, accepted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pack_id, collaborator_email) DO UPDATE SET
       role = excluded.role,
       invited_at = excluded.invited_at,
       invited_by_user_id = excluded.invited_by_user_id`
  ).bind(packId, pack.user_id, email, existingUser?.id || null, role, now, user.id, existingUser ? now : null).run();

  await logActivity(env, packId, user, 'share', email, { role, alreadyUser: !!existingUser });

  return json({
    ok: true,
    invite: {
      email, role,
      collaborator_user_id: existingUser?.id || null,
      collaborator_name: existingUser?.name || null,
      pending: !existingUser,
      invited_at: now
    }
  });
}

/* GET /api/packs/:id/share — list collaborators of a pack */
export async function onRequestGet({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const packId = params.id;

  const myRole = await getPackRole(env, packId, user.id, user.email);
  if (!can(myRole, 'read_pack')) return error('No access', 403);

  // Owner
  const pack = await env.DB.prepare(
    `SELECT p.user_id, u.email, u.name, u.picture
     FROM packs p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
  ).bind(packId).first();
  if (!pack) return error('Pack not found', 404);

  // Shares
  const shares = await env.DB.prepare(
    `SELECT s.collaborator_email, s.role, s.invited_at, s.accepted_at, s.last_active_at,
            u.id AS user_id, u.name, u.picture
     FROM pack_shares s
     LEFT JOIN users u ON LOWER(u.email) = s.collaborator_email
     WHERE s.pack_id = ? ORDER BY s.invited_at DESC`
  ).bind(packId).all();

  const collaborators = [
    { email: pack.email, name: pack.name, picture: pack.picture, role: 'owner', user_id: pack.user_id, accepted_at: null, isOwner: true },
    ...(shares.results || []).map(s => ({
      email: s.collaborator_email,
      name: s.name,
      picture: s.picture,
      role: s.role,
      user_id: s.user_id,
      invited_at: s.invited_at,
      accepted_at: s.accepted_at,
      last_active_at: s.last_active_at,
      pending: !s.accepted_at,
      isOwner: false
    }))
  ];

  return json({ collaborators, my_role: myRole });
}
