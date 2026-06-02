import { json, error, getCurrentUser } from '../_utils.js';

/* GET /api/leaderboard?top=50&period=all|week|month — Public leaderboard of top captains by bounty
   Time-windowed query inspired by ActiDoo/gamification-engine pattern.
   period=week filters users active in last 7 days, period=month last 30 days. */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const top = Math.min(100, parseInt(url.searchParams.get('top') || '50'));
  const period = url.searchParams.get('period') || 'all';

  const user = await getCurrentUser(request, env);

  // Time filter for activity-based leaderboards (proxy: bounty_updated_at)
  let timeFilter = '';
  if (period === 'week') {
    const weekAgo = Date.now() - 7 * 86400000;
    timeFilter = ` AND bounty_updated_at >= ${weekAgo}`;
  } else if (period === 'month') {
    const monthAgo = Date.now() - 30 * 86400000;
    timeFilter = ` AND bounty_updated_at >= ${monthAgo}`;
  }

  const rows = await env.DB.prepare(
    `SELECT id, nickname, avatar_emoji, total_bounty, streak_days,
            CASE WHEN id = ? THEN 1 ELSE 0 END as is_me
     FROM users
     WHERE total_bounty > 0 AND show_on_leaderboard != 0${timeFilter}
     ORDER BY total_bounty DESC, bounty_updated_at ASC
     LIMIT ?`
  ).bind(user?.id || '', top).all();

  // Mask user IDs (just position + nick + avatar)
  const list = (rows.results || []).map((r, i) => ({
    rank: i + 1,
    nickname: r.nickname || `Captain ${(r.id || '').slice(-4)}`,
    avatar: r.avatar_emoji || '🏴‍☠️',
    bounty: r.total_bounty,
    streak: r.streak_days || 0,
    is_me: !!r.is_me
  }));

  // Find my rank if not in top
  let my_rank = null;
  let my_bounty = null;
  if (user) {
    const me = await env.DB.prepare(
      `SELECT total_bounty FROM users WHERE id = ?`
    ).bind(user.id).first();
    my_bounty = me?.total_bounty || 0;
    if (my_bounty > 0) {
      const above = await env.DB.prepare(
        `SELECT COUNT(*) as c FROM users WHERE total_bounty > ? AND show_on_leaderboard != 0`
      ).bind(my_bounty).first();
      my_rank = (above?.c || 0) + 1;
    }
  }

  // Total count (period-aware)
  const total = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM users WHERE total_bounty > 0 AND show_on_leaderboard != 0${timeFilter}`
  ).first();

  return json({
    period,
    leaderboard: list,
    my_rank,
    my_bounty,
    total_captains: total?.c || 0
  });
}
