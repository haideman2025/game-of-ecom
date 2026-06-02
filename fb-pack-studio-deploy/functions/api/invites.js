import { json, error, getCurrentUser } from '../_utils.js';
import { logActivity } from '../_permissions.js';

/* GET /api/invites — list pending invites for current user (by email match) */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Find shares where email matches but accepted_at is NULL
  const rows = await env.DB.prepare(
    `SELECT s.pack_id, s.role, s.invited_at, s.invited_by_user_id,
            p.name AS pack_name,
            inviter.name AS invited_by_name, inviter.email AS invited_by_email, inviter.picture AS invited_by_picture
     FROM pack_shares s
     JOIN packs p ON p.id = s.pack_id
     LEFT JOIN users inviter ON inviter.id = s.invited_by_user_id
     WHERE s.collaborator_email = LOWER(?) AND s.accepted_at IS NULL
     ORDER BY s.invited_at DESC`
  ).bind(user.email).all();

  return json({ invites: rows.results || [] });
}
