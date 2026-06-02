import { json, error, getCurrentUser, uuid } from '../../_utils.js';
import { requireCap, logActivity, touchActivity } from '../../_permissions.js';

/* POST /api/media/upload — multipart form data
   Required fields: file (Blob), pack_id, asset_type ('image'|'audio'|'video'|'storyboard'|'mascot'|'product')
   Optional: post_n, scene_n, sequence_n, from_scene_n, to_scene_n, source, time_range, prompt, brand_name
   Returns: { ok, id, r2_key, size, downloadUrl }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!env.MEDIA_BUCKET) return error('R2 bucket MEDIA_BUCKET not bound. Run wrangler r2 bucket create + bind in dashboard.', 500);

  const form = await request.formData();
  const file = form.get('file');
  const packId = form.get('pack_id');
  const assetType = form.get('asset_type');
  if (!file || !packId || !assetType) return error('Missing file/pack_id/asset_type');
  if (!(file instanceof File) && !(file instanceof Blob)) return error('Invalid file');

  // Check permission: editor+ to upload
  try {
    await requireCap(env, packId, user, 'upload_media');
  } catch (e) {
    return error(e.message, e.status || 403);
  }

  // Quota check
  const quotaRow = await env.DB.prepare('SELECT storage_used_bytes, storage_quota_bytes FROM users WHERE id = ?').bind(user.id).first();
  const used = quotaRow?.storage_used_bytes || 0;
  const quota = quotaRow?.storage_quota_bytes || 10737418240; // 10GB default
  if (used + file.size > quota) {
    return error(`Storage quota exceeded: ${Math.round(used/1024/1024)}MB used / ${Math.round(quota/1024/1024)}MB quota`, 413);
  }

  // Build R2 key: pack/{packId}/{assetType}/{uuid}.{ext}
  const id = uuid();
  const ext = (file.type && file.type.split('/')[1]) || 'bin';
  const r2Key = `pack/${packId}/${assetType}/${id}.${ext}`;

  // Upload to R2
  try {
    await env.MEDIA_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: {
        userId: user.id,
        packId,
        assetType,
        uploadedAt: String(Date.now())
      }
    });
  } catch (e) {
    return error(`R2 upload failed: ${e.message}`, 502);
  }

  // Save metadata to D1
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO media_files (id, pack_id, uploader_user_id, asset_type, post_n, scene_n, sequence_n, from_scene_n, to_scene_n,
       source, time_range, prompt, r2_key, size_bytes, mime, brand_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, packId, user.id, assetType,
    parseIntOrNull(form.get('post_n')), parseIntOrNull(form.get('scene_n')),
    parseIntOrNull(form.get('sequence_n')), parseIntOrNull(form.get('from_scene_n')), parseIntOrNull(form.get('to_scene_n')),
    form.get('source') || null,
    form.get('time_range') || null,
    (form.get('prompt') || '').slice(0, 500) || null,
    r2Key, file.size, file.type || 'application/octet-stream',
    form.get('brand_name') || null,
    now
  ).run();

  // Bump user storage_used
  await env.DB.prepare('UPDATE users SET storage_used_bytes = storage_used_bytes + ? WHERE id = ?').bind(file.size, user.id).run();

  // Touch activity
  await touchActivity(env, packId, user.id);
  await logActivity(env, packId, user, 'upload_media', `${assetType}_${id.slice(0,6)}`, { size: file.size });

  return json({ ok: true, id, r2_key: r2Key, size: file.size, downloadUrl: `/api/media/${id}` });
}

function parseIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}
