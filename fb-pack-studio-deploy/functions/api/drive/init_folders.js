import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap, logActivity } from '../../_permissions.js';
import { getDriveAccessToken, driveEnsureFolder } from '../../_drive.js';

/* POST /api/drive/init_folders
   Body: { pack_id }
   Pre-creates entire Drive folder structure for pack:
     Pack/Pillar N/Day NN - Post NN/🎬 Video Final
   Idempotent — uses driveEnsureFolder (find or create).
   Run once per pack first time user wants to upload video manually to Drive. */

const PILLAR_NAMES = {
  1: 'Pillar 1 - Awareness',
  2: 'Pillar 2 - Consideration',
  3: 'Pillar 3 - Conversion'
};

export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const packId = body.pack_id;
  if (!packId) return error('Missing pack_id');

  try {
    await requireCap(env, packId, user, 'upload_media');
  } catch (e) {
    return error(e.message, e.status || 403);
  }

  let accessToken;
  try {
    accessToken = await getDriveAccessToken(env, user.id);
  } catch (e) {
    return error(e.message, e.status || 500);
  }

  // Load pack
  const pack = await env.DB.prepare(
    `SELECT id, name, posts_json, drive_folder_id, user_id FROM packs WHERE id = ?`
  ).bind(packId).first();
  if (!pack) return error('Pack not found', 404);

  // V11.5.1 — Prefer posts from request body (client has full state), fallback to posts_json
  let posts = [];
  if (Array.isArray(body.posts) && body.posts.length > 0) {
    posts = body.posts;
  } else {
    try {
      const parsed = JSON.parse(pack.posts_json || '[]');
      posts = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      posts = [];
    }
  }

  if (posts.length === 0) {
    // V11.5.1 — Soft-fail: still create root + pack folder so user can manually drop files
    try {
      const userRow = await env.DB.prepare('SELECT drive_root_folder_id FROM users WHERE id = ?').bind(user.id).first();
      let rootId = userRow?.drive_root_folder_id;
      if (!rootId) {
        const root = await driveEnsureFolder(accessToken, 'FB Pack Studio');
        rootId = root.id;
        await env.DB.prepare('UPDATE users SET drive_root_folder_id = ?, drive_connected_at = ? WHERE id = ?').bind(rootId, Date.now(), user.id).run();
      }
      let packFolderId = pack.drive_folder_id;
      if (!packFolderId) {
        const packName = (pack.name || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
        const folder = await driveEnsureFolder(accessToken, packName, rootId);
        packFolderId = folder.id;
        await env.DB.prepare('UPDATE packs SET drive_folder_id = ? WHERE id = ?').bind(packFolderId, packId).run();
      }
      return json({
        ok: true,
        warning: 'Pack chưa có posts trong content plan. Đã tạo pack folder. Thêm posts trong app rồi init lại để tạo subfolder Day/Pillar.',
        pillars: 0, posts: 0, final_folders: 0,
        pack_folder_id: packFolderId,
        pack_web_link: `https://drive.google.com/drive/folders/${packFolderId}`,
        folders: []
      });
    } catch (e) {
      return error(`Init root failed: ${e.message}`, 500);
    }
  }

  // Ensure root folder
  let rootId;
  try {
    const userRow = await env.DB.prepare('SELECT drive_root_folder_id FROM users WHERE id = ?').bind(user.id).first();
    rootId = userRow?.drive_root_folder_id;
    if (!rootId) {
      const root = await driveEnsureFolder(accessToken, 'FB Pack Studio');
      rootId = root.id;
      await env.DB.prepare('UPDATE users SET drive_root_folder_id = ?, drive_connected_at = ? WHERE id = ?').bind(rootId, Date.now(), user.id).run();
    }
  } catch (e) {
    return error(`Ensure root folder failed: ${e.message}. Drive permission may have expired — try re-login.`, 502);
  }

  // Ensure pack folder
  let packFolderId = pack.drive_folder_id;
  try {
    if (!packFolderId) {
      const packName = (pack.name || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const folder = await driveEnsureFolder(accessToken, packName, rootId);
      packFolderId = folder.id;
      await env.DB.prepare('UPDATE packs SET drive_folder_id = ? WHERE id = ?').bind(packFolderId, packId).run();
    }
  } catch (e) {
    return error(`Ensure pack folder failed: ${e.message}`, 502);
  }

  // Group posts by pillar
  const byPillar = {};
  for (const p of posts) {
    const pn = p.pillar || 1;
    if (!byPillar[pn]) byPillar[pn] = [];
    byPillar[pn].push(p);
  }

  // Brand Assets folder (best-effort)
  let brandFolderId;
  try {
    const brandF = await driveEnsureFolder(accessToken, 'Brand Assets', packFolderId);
    brandFolderId = brandF.id;
  } catch (e) { /* non-fatal */ }

  const createdFolders = [];
  const skippedPosts = [];
  let pillarCount = 0, postCount = 0, finalCount = 0;

  for (const [pillarN, postList] of Object.entries(byPillar)) {
    const pillarName = PILLAR_NAMES[pillarN] || `Pillar ${pillarN}`;
    let pillarFolder;
    try {
      pillarFolder = await driveEnsureFolder(accessToken, pillarName, packFolderId);
      pillarCount++;
    } catch (e) {
      console.warn('Pillar folder failed:', pillarName, e.message);
      skippedPosts.push(...postList.map(p => ({ post_n: p.n, error: 'pillar folder fail' })));
      continue;
    }

    // V11.5.1 — Sequential creation (more reliable than parallel for rate-limited Drive API)
    // Parallel caused timeouts on packs >20 posts. Sequential ~150ms/folder is OK.
    for (const post of postList) {
      const dayN = post.day_n || post.day || post.n;
      const postN = post.n;
      const dayLabel = `Day ${String(dayN).padStart(2, '0')}`;
      const postLabel = `Post ${String(postN).padStart(2, '0')}`;
      const postFolderName = `${dayLabel} - ${postLabel}`;
      try {
        const postFolder = await driveEnsureFolder(accessToken, postFolderName, pillarFolder.id);
        postCount++;
        // Video Final subfolder — non-fatal if fails
        let finalFolderId = null;
        try {
          const f = await driveEnsureFolder(accessToken, 'Video Final', postFolder.id);
          finalFolderId = f.id;
          finalCount++;
        } catch (e) { console.warn('Final folder failed for post', postN, e.message); }
        createdFolders.push({
          post_n: postN, day_n: dayN, pillar_n: parseInt(pillarN),
          folder_id: postFolder.id,
          path: `${pillarName}/${postFolderName}`,
          web_link: `https://drive.google.com/drive/folders/${postFolder.id}`,
          final_folder_id: finalFolderId
        });
      } catch (e) {
        console.warn('Post folder failed:', postN, e.message);
        skippedPosts.push({ post_n: postN, error: e.message.slice(0, 100) });
      }
    }
  }

  // Mark in D1 that pack has been initialized
  try {
    await env.DB.prepare('UPDATE packs SET drive_folder_id = ?, updated_at = ? WHERE id = ?')
      .bind(packFolderId, Date.now(), packId).run();
  } catch (e) {}

  await logActivity(env, packId, user, 'init_drive_folders', null, { pillars: pillarCount, posts: postCount, skipped: skippedPosts.length });

  return json({
    ok: true,
    pillars: pillarCount,
    posts: postCount,
    final_folders: finalCount,
    skipped: skippedPosts,
    brand_folder_id: brandFolderId,
    pack_folder_id: packFolderId,
    pack_web_link: `https://drive.google.com/drive/folders/${packFolderId}`,
    folders: createdFolders
  });
}
