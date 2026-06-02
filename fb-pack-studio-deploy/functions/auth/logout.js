import { getCookie, clearSessionCookie, json } from '../_utils.js';

export const onRequestPost = async ({ request, env }) => {
  const token = getCookie(request, 'fbps_session');
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
};
