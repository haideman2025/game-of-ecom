/* V11 — Google Drive API helpers
   Uses refresh_token saved at /auth/callback to get fresh access_token, then call Drive API. */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/* Exchange refresh_token → fresh access_token (1h TTL) */
export async function getDriveAccessToken(env, userId) {
  const u = await env.DB.prepare('SELECT drive_refresh_token FROM users WHERE id = ?').bind(userId).first();
  if (!u?.drive_refresh_token) {
    const e = new Error('Drive not connected. User needs to re-login with Drive scope.');
    e.status = 401;
    e.code = 'DRIVE_NOT_CONNECTED';
    throw e;
  }
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: u.drive_refresh_token,
      grant_type: 'refresh_token'
    })
  });
  if (!r.ok) {
    const err = await r.text();
    if (err.includes('invalid_grant')) {
      // Refresh token revoked — clear it
      await env.DB.prepare('UPDATE users SET drive_refresh_token = NULL WHERE id = ?').bind(userId).run();
      const e = new Error('Drive refresh token revoked. Re-login required.');
      e.status = 401;
      e.code = 'DRIVE_TOKEN_REVOKED';
      throw e;
    }
    throw new Error(`Refresh token failed: ${err.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.access_token;
}

/* Create a folder in Drive. Returns folderId */
export async function driveCreateFolder(accessToken, name, parentId = null) {
  const meta = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {})
  };
  const r = await fetch(`${DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(meta)
  });
  if (!r.ok) throw new Error(`Drive folder create failed: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

/* Search for folder by name (within parent or root). Returns first match or null */
export async function driveFindFolder(accessToken, name, parentId = null) {
  const q = parentId
    ? `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!r.ok) return null;
  const data = await r.json();
  return (data.files && data.files[0]) || null;
}

/* Ensure folder exists (find or create) */
export async function driveEnsureFolder(accessToken, name, parentId = null) {
  const existing = await driveFindFolder(accessToken, name, parentId);
  if (existing) return existing;
  return await driveCreateFolder(accessToken, name, parentId);
}

/* Upload a file (multipart). Returns { id, webViewLink, webContentLink } */
export async function driveUploadFile(accessToken, { name, mime, body, parentId }) {
  // Use multipart upload (metadata + media in one request)
  const boundary = 'fbp_boundary_' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({
    name,
    ...(parentId ? { parents: [parentId] } : {})
  });
  // body is a Blob (or Uint8Array) — convert to ArrayBuffer
  const bodyBuffer = body instanceof Uint8Array ? body : new Uint8Array(await (body.arrayBuffer ? body.arrayBuffer() : body));
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${meta}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mime}\r\n\r\n`
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);
  const combined = new Uint8Array(preamble.length + bodyBuffer.length + closing.length);
  combined.set(preamble, 0);
  combined.set(bodyBuffer, preamble.length);
  combined.set(closing, preamble.length + bodyBuffer.length);

  const r = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,size,webViewLink,webContentLink,mimeType`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: combined
  });
  if (!r.ok) throw new Error(`Drive upload failed: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

/* Download file content. Returns ReadableStream */
export async function driveDownloadFile(accessToken, fileId) {
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new Error(`Drive download failed: ${r.status}`);
  return r; // caller streams r.body
}

/* List files in folder */
export async function driveListFolder(accessToken, folderId, pageSize = 1000) {
  const q = `'${folderId}' in parents and trashed=false`;
  const r = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,mimeType,createdTime,webViewLink)&pageSize=${pageSize}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new Error(`Drive list failed: ${r.status}`);
  const data = await r.json();
  return data.files || [];
}

/* Delete file (move to trash actually) */
export async function driveDeleteFile(accessToken, fileId) {
  const r = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return r.ok;
}
