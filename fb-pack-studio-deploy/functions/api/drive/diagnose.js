import { json, error, getCurrentUser } from '../../_utils.js';
import { getDriveAccessToken, driveListFolder } from '../../_drive.js';

/* GET /api/drive/diagnose?pack_id=X
   Full diagnostic info for debugging Drive integration issues. */
export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const packId = url.searchParams.get('pack_id');

  const diag = {
    user: { id: user.id, email: user.email },
    drive_status: 'unknown',
    scope_check: 'pending',
    token_info: null,
    pack_folder: null,
    pillar_folders: [],
    sample_post_folder: null,
    sample_final_folder: null,
    errors: []
  };

  // 1. Check refresh token exists
  const u = await env.DB.prepare(
    'SELECT drive_refresh_token, drive_root_folder_id, drive_connected_at FROM users WHERE id = ?'
  ).bind(user.id).first();

  if (!u?.drive_refresh_token) {
    diag.drive_status = 'NOT_CONNECTED';
    diag.fix = 'Sign out → Sign in lại → Allow Drive permission';
    return json(diag);
  }

  diag.drive_status = 'TOKEN_FOUND';
  diag.root_folder_id = u.drive_root_folder_id || null;
  diag.connected_at = u.drive_connected_at || null;

  // 2. Try to get access token
  let accessToken;
  try {
    accessToken = await getDriveAccessToken(env, user.id);
    diag.drive_status = 'TOKEN_VALID';
  } catch (e) {
    diag.drive_status = 'TOKEN_REVOKED';
    diag.error = e.message;
    diag.fix = 'Refresh token bị Google revoke. Sign out → Sign in lại.';
    return json(diag);
  }

  // 3. Check granted scopes via token info endpoint
  try {
    const r = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (r.ok) {
      const info = await r.json();
      diag.token_info = {
        scope: info.scope || '',
        expires_in: info.expires_in,
        audience: info.aud
      };
      // Check scope
      if ((info.scope || '').includes('auth/drive ')|| (info.scope || '').endsWith('auth/drive')) {
        diag.scope_check = 'FULL_DRIVE_OK';
      } else if ((info.scope || '').includes('drive.file')) {
        diag.scope_check = 'DRIVE_FILE_ONLY';
        diag.fix = 'Scope hiện tại chỉ là "drive.file" (app-created files only). Cần re-login với scope "drive" full. Trong Google Console → OAuth Consent → Edit App → Add Scope: https://www.googleapis.com/auth/drive → Update. Sau đó Sign out + Sign in lại app.';
      } else {
        diag.scope_check = 'NO_DRIVE_SCOPE';
        diag.fix = 'Token không có Drive scope. Re-login.';
      }
    }
  } catch (e) { diag.errors.push('tokeninfo: ' + e.message); }

  // 4. Probe pack folder if packId given
  if (packId) {
    const pack = await env.DB.prepare('SELECT id, name, drive_folder_id FROM packs WHERE id = ?').bind(packId).first();
    if (pack) {
      diag.pack_folder = { id: pack.drive_folder_id, name: pack.name };
      if (pack.drive_folder_id) {
        try {
          const pillars = await driveListFolder(accessToken, pack.drive_folder_id);
          diag.pillar_folders = pillars
            .filter(f => f.mimeType === 'application/vnd.google-apps.folder')
            .map(f => ({ id: f.id, name: f.name }));
          // Sample 1 post folder
          for (const pf of diag.pillar_folders) {
            const posts = (await driveListFolder(accessToken, pf.id))
              .filter(f => f.mimeType === 'application/vnd.google-apps.folder');
            if (posts.length > 0) {
              diag.sample_post_folder = { pillar: pf.name, post: posts[0].name, id: posts[0].id };
              // Sample Video Final subfolder
              const subs = (await driveListFolder(accessToken, posts[0].id))
                .filter(f => f.mimeType === 'application/vnd.google-apps.folder' &&
                  ((f.name || '').toLowerCase().includes('video final') || (f.name || '').toLowerCase().includes('final video')));
              if (subs.length > 0) {
                diag.sample_final_folder = { id: subs[0].id, name: subs[0].name };
                // List files inside
                const files = await driveListFolder(accessToken, subs[0].id);
                diag.sample_final_folder.files = files.map(f => ({
                  name: f.name, mime: f.mimeType, size: f.size, id: f.id
                }));
              }
              break;
            }
          }
        } catch (e) {
          diag.errors.push('list pack folder: ' + e.message);
        }
      }
    }
  }

  return json(diag);
}
