import { json, error, getCurrentUser } from '../_utils.js';

/* GET /api/profile — current user's profile (nickname, avatar, bounty) */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const u = await env.DB.prepare(
    `SELECT id, email, nickname, avatar_emoji, total_bounty, streak_days, badges_json, bounty_updated_at, show_on_leaderboard FROM users WHERE id = ?`
  ).bind(user.id).first();
  return json({
    id: u.id,
    email: u.email,
    nickname: u.nickname || null,
    avatar_emoji: u.avatar_emoji || '🏴‍☠️',
    total_bounty: u.total_bounty || 0,
    streak_days: u.streak_days || 0,
    badges: u.badges_json ? JSON.parse(u.badges_json) : [],
    show_on_leaderboard: u.show_on_leaderboard !== 0,
    bounty_updated_at: u.bounty_updated_at
  });
}

/* PUT /api/profile  body: { nickname?, avatar_emoji?, show_on_leaderboard? } */
export async function onRequestPut({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}

  const updates = [];
  const args = [];

  if (typeof body.nickname === 'string') {
    const nn = body.nickname.trim().slice(0, 32);
    if (nn.length < 2) return error('Nickname tối thiểu 2 ký tự');
    if (!/^[\p{L}\p{N}\s_\-.👑🏴‍☠️🦜⚓🗡️⚔️🦈🐙🦑🏝️💰🌊⛵🪙🏆💎🔥⚡]+$/u.test(nn)) {
      return error('Nickname chỉ chấp nhận chữ, số, space, _, -, . và emoji pirate');
    }
    updates.push('nickname = ?');
    args.push(nn);
  }
  if (typeof body.avatar_emoji === 'string') {
    const av = body.avatar_emoji.slice(0, 8); // emoji can be multi-byte
    updates.push('avatar_emoji = ?');
    args.push(av);
  }
  if (typeof body.show_on_leaderboard === 'boolean') {
    updates.push('show_on_leaderboard = ?');
    args.push(body.show_on_leaderboard ? 1 : 0);
  }

  if (updates.length === 0) return error('Không có field để update');

  args.push(user.id);
  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...args).run();
  return json({ ok: true });
}
