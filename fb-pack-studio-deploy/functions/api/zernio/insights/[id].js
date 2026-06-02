import { json, error, getCurrentUser } from '../../../_utils.js';
import { getZernioKey, zernioGet } from '../../_zernio.js';

/* GET /api/zernio/insights/{zernio_post_id}
   Fetches post status + analytics from Zernio for a specific post. */
export async function onRequestGet({ request, env, params }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const postId = params.id;
  if (!postId) return error('Missing post id');

  let apiKey;
  try { apiKey = await getZernioKey(env, user.id); }
  catch (e) { return error(e.message, e.status || 401); }

  // Ownership check
  const row = await env.DB.prepare(
    `SELECT * FROM scheduled_posts WHERE zernio_post_id = ? AND user_id = ?`
  ).bind(postId, user.id).first();
  if (!row) return error('Post not found in your account', 404);

  let live;
  try {
    live = await zernioGet(apiKey, `/posts/${postId}`);
  } catch (e) {
    return error('Zernio: ' + e.message, e.status || 502);
  }

  // Extract insights (FB Graph metrics surfaced by Zernio)
  const insights = {
    status: live.status,
    published_at: live.publishedAt || live.published_at,
    likes: live.likes ?? live.metrics?.likes ?? null,
    comments: live.comments ?? live.metrics?.comments ?? null,
    shares: live.shares ?? live.metrics?.shares ?? null,
    reach: live.reach ?? live.metrics?.reach ?? null,
    impressions: live.impressions ?? live.metrics?.impressions ?? null,
    clicks: live.clicks ?? live.metrics?.clicks ?? null,
    engagement_rate: live.engagementRate ?? live.metrics?.engagementRate ?? null,
    fb_post_id: live.platformPostId || live.platformPostIds?.facebook || null,
    fb_permalink: live.permalink || live.permalinks?.facebook || null,
    error_code: live.errorCode,
    error_subcode: live.errorSubcode,
    error_message: live.errorMessage
  };

  // Persist snapshot
  try {
    await env.DB.prepare(
      `UPDATE scheduled_posts SET insights_json = ?, insights_fetched_at = ?, status = ?, updated_at = ? WHERE id = ?`
    ).bind(
      JSON.stringify(insights),
      Date.now(),
      live.status || row.status,
      Date.now(),
      row.id
    ).run();
  } catch (e) {}

  return json({ zernio_post_id: postId, insights, raw_status: live.status });
}
