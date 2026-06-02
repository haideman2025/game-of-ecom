import { json, error, getCurrentUser } from '../_utils.js';

/* POST /api/waitlist  body: { email, tier_interest, vn_phone?, notes? }
   Captures pre-launch interest for paid tiers (Stripe not ready yet). */
export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }
  const email = (body.email || '').trim().toLowerCase();
  const tier = (body.tier_interest || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Email không hợp lệ', 400);
  if (!['starter', 'pro', 'agency', 'lifetime'].includes(tier)) return error('Tier không hợp lệ', 400);

  const user = await getCurrentUser(request, env);
  const id = `wl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO waitlist (id, email, user_id, tier_interest, vn_phone, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, user?.id || null, tier, body.vn_phone || null, body.notes || null, Date.now()).run();
  } catch (e) {
    return error('Save failed: ' + e.message, 500);
  }

  // Optionally count current waitlist for the tier
  let count = 0;
  try {
    const r = await env.DB.prepare(`SELECT COUNT(*) as c FROM waitlist WHERE tier_interest = ?`).bind(tier).first();
    count = r?.c || 0;
  } catch(e) {}

  return json({ saved: true, tier, count, message: 'Đã ghi nhận. Bạn sẽ nhận email khi Stripe launch (dự kiến 2-4 tuần).' });
}

/* GET /api/waitlist?tier=X — owner-only stats (returns count, not emails) */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const tier = url.searchParams.get('tier');
  try {
    const sql = tier
      ? `SELECT tier_interest, COUNT(*) as c FROM waitlist WHERE tier_interest = ? GROUP BY tier_interest`
      : `SELECT tier_interest, COUNT(*) as c FROM waitlist GROUP BY tier_interest`;
    const args = tier ? [tier] : [];
    const r = await env.DB.prepare(sql).bind(...args).all();
    return json({ stats: r.results || [] });
  } catch (e) {
    return error('Query failed', 500);
  }
}
