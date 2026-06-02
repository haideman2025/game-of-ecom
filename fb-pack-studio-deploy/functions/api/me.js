import { getCurrentUser, tierState, json, error } from '../_utils.js';

export const onRequestGet = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Not authenticated', 401);
  const state = tierState(user);
  const packsCount = await env.DB.prepare('SELECT COUNT(*) as c FROM packs WHERE user_id = ?').bind(user.id).first();
  return json({
    user: { id: user.id, email: user.email, name: user.name, picture: user.picture, is_admin: !!user.is_admin },
    tier: state,
    packs_count: packsCount?.c || 0
  });
};
