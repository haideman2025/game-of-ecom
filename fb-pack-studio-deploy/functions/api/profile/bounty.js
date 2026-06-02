import { json, error, getCurrentUser } from '../../_utils.js';

/* PUT /api/profile/bounty  body: { total_bounty, streak_days?, badges? }
   Auto-called from frontend whenever localStorage XP changes (debounced). */
export async function onRequestPut({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const bounty = parseInt(body.total_bounty) || 0;
  const streak = parseInt(body.streak_days) || 0;
  const badges = Array.isArray(body.badges) ? body.badges.slice(0, 100) : [];

  if (bounty < 0 || bounty > 100000000) return error('Bounty out of range');

  await env.DB.prepare(
    `UPDATE users SET total_bounty = ?, streak_days = ?, badges_json = ?, bounty_updated_at = ? WHERE id = ?`
  ).bind(bounty, streak, JSON.stringify(badges), Date.now(), user.id).run();

  return json({ ok: true, total_bounty: bounty, streak_days: streak, badge_count: badges.length });
}
