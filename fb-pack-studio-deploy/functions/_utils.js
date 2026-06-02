/* Shared helpers for Pages Functions */

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, { status });
}

export function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function uuid() {
  return crypto.randomUUID();
}

export function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setSessionCookie(token, maxAgeSec = 60 * 60 * 24 * 30) {
  return `fbps_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie() {
  return `fbps_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getCurrentUser(request, env) {
  const token = getCookie(request, 'fbps_session');
  if (!token) return null;
  const now = Date.now();
  const session = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').bind(token).first();
  if (!session || session.expires_at < now) return null;
  const user = await env.DB.prepare('SELECT id, email, name, picture, tier, tier_started_at, tier_expires_at, max_packs, created_at, is_admin FROM users WHERE id = ?').bind(session.user_id).first();
  return user;
}

export function tierState(user) {
  const TRIAL_DAYS = 30;
  const MAX_PACKS = { trial: 5, tier1: 5, tier2: 20 };
  const tier = user.tier || 'trial';
  const startedAt = user.tier_started_at || Date.now();
  const elapsed = Date.now() - startedAt;
  const days = elapsed / (1000 * 60 * 60 * 24);
  const daysLeft = Math.max(0, TRIAL_DAYS - days);
  const expired = tier === 'trial' && daysLeft <= 0;
  return {
    tier: expired ? 'expired' : tier,
    daysLeft: Math.ceil(daysLeft),
    maxPacks: expired ? 0 : (MAX_PACKS[tier] || 5),
    expired
  };
}
