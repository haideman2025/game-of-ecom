import { json, error, getCurrentUser } from '../../_utils.js';
import { logActivity } from '../../_permissions.js';

/* POST /api/invites/:packId — accept an invite */
export async function onRequestPost({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const packId = params.packId;
  const email = user.email.toLowerCase();

  const share = await env.DB.prepare(
    `SELECT role, accepted_at FROM pack_shares WHERE pack_id = ? AND collaborator_email = ?`
  ).bind(packId, email).first();

  if (!share) return error('No invite for this pack', 404);
  if (share.accepted_at) return json({ ok: true, alreadyAccepted: true, role: share.role });

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE pack_shares SET accepted_at = ?, collaborator_user_id = ?, last_active_at = ? WHERE pack_id = ? AND collaborator_email = ?`
  ).bind(now, user.id, now, packId, email).run();

  await logActivity(env, packId, user, 'accept_invite', email, { role: share.role });
  return json({ ok: true, role: share.role });
}

/* DELETE /api/invites/:packId — decline an invite */
export async function onRequestDelete({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const packId = params.packId;
  const email = user.email.toLowerCase();
  await env.DB.prepare('DELETE FROM pack_shares WHERE pack_id = ? AND collaborator_email = ?').bind(packId, email).run();
  return json({ ok: true });
}
