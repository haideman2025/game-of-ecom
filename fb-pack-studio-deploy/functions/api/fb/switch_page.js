import { json, error, getCurrentUser } from '../../_utils.js';

/* POST /api/fb/switch_page  body: { pageId }
   Re-fetches /me/accounts using stored user-derived token + switches Page selection.
   Since we don't store user_token (only page_token), we need another OAuth round-trip if user wants a different page.
   ALTERNATIVE: at /auth/fb/callback we already saved the first page; user clicks "Add another page" → re-runs /auth/fb (no decline) → callback now picks specified page_id.
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // For now, just clear the credential — user re-clicks "Connect Facebook" to pick another page from picker UI
  await env.DB.prepare('DELETE FROM fb_credentials WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true, message: 'Disconnected. Reconnect to pick another page.' });
}
