import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* POST /api/vault/upload
   Body: {
     pack_id, filename, mime, size,
     content_text,       -- already-extracted text from client (PDF/DOCX/TXT/MD/CSV)
     base64?,            -- original file (optional, for download/preview later)
     category?, notes?
   }
   Saves into D1 vault_files + R2 (if base64 provided).
   Enforces 10-file / 100MB total per pack. */
const MAX_FILES_PER_PACK = 10;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_TEXT_CHARS = 200000; // ~50k tokens, safe for Gemini 2.5 Pro context

export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { pack_id, filename, mime, size, content_text, base64, category, notes } = body;
  if (!pack_id) return error('Missing pack_id');
  if (!filename) return error('Missing filename');
  if (!mime) return error('Missing mime');
  if (size == null) return error('Missing size');

  try { await requireCap(env, pack_id, user, 'edit_settings'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Check current pack vault usage
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as total FROM vault_files WHERE pack_id = ?`
  ).bind(pack_id).first();
  if ((stats?.cnt || 0) >= MAX_FILES_PER_PACK) {
    return error(`Pack đã đạt giới hạn ${MAX_FILES_PER_PACK} files. Xóa file cũ trước.`, 409);
  }
  const sizeNum = parseInt(size) || 0;
  if (((stats?.total || 0) + sizeNum) > MAX_TOTAL_BYTES) {
    const remain = Math.max(0, MAX_TOTAL_BYTES - (stats?.total || 0));
    return error(`Vượt quota 100MB · còn lại ${(remain/1024/1024).toFixed(1)}MB. File này ${(sizeNum/1024/1024).toFixed(1)}MB.`, 409);
  }

  // Limit text size to keep D1 row reasonable
  const text = (content_text || '').slice(0, MAX_TEXT_CHARS);

  // Stage original file in R2 (optional)
  let r2Key = null;
  if (base64 && env.MEDIA) {
    try {
      const clean = base64.replace(/^data:[^;]+;base64,/, '');
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = (filename.match(/\.([a-z0-9]+)$/i) || [, 'bin'])[1];
      r2Key = `vault/${user.id}/${pack_id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
      await env.MEDIA.put(r2Key, bytes, {
        httpMetadata: { contentType: mime },
        customMetadata: { user_id: user.id, pack_id, filename: filename.slice(0, 200) }
      });
    } catch (e) { console.warn('Vault R2 upload skipped:', e.message); r2Key = null; }
  }

  // Compute sha for dedupe (lightweight)
  let sha;
  try {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(filename + ':' + sizeNum + ':' + text.slice(0, 1000)));
    sha = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch (e) { sha = null; }

  const id = `vf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    `INSERT INTO vault_files
      (id, pack_id, user_id, filename, mime, size_bytes, sha256, content_text, content_summary, r2_key, category, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, pack_id, user.id,
    filename.slice(0, 200), mime, sizeNum, sha,
    text || null,
    text ? text.slice(0, 300) + (text.length > 300 ? '...' : '') : null,
    r2Key, category || null, notes || null,
    Date.now()
  ).run();

  return json({
    ok: true,
    id, filename, mime, size: sizeNum,
    has_text: !!text,
    text_chars: text.length,
    r2_key: r2Key,
    pack_total: (stats?.cnt || 0) + 1,
    pack_total_bytes: (stats?.total || 0) + sizeNum,
    pack_limit_files: MAX_FILES_PER_PACK,
    pack_limit_bytes: MAX_TOTAL_BYTES
  });
}
