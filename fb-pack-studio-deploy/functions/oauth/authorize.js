import { getCurrentUser } from '../_utils.js';
import { randomHex, isValidRedirectUri } from '../_oauth.js';

/* V17 — OAuth 2.1 Authorization Endpoint
   GET /oauth/authorize?response_type=code&client_id=...&redirect_uri=...&code_challenge=...&code_challenge_method=S256&state=...&scope=...

   - If user not logged in → redirect to login (returnUrl=this URL)
   - If logged in → show consent HTML page with Allow/Deny
   - On Allow → generate code, redirect to redirect_uri?code=...&state=...
*/
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get('response_type');
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') || 'plain';
  const state = url.searchParams.get('state') || '';
  const scope = url.searchParams.get('scope') || 'packs:read packs:write gen:write publish:write ads:read';

  if (responseType !== 'code') return errorPage('unsupported_response_type', 'Only "code" supported');
  if (!clientId) return errorPage('invalid_request', 'Missing client_id');
  if (!redirectUri) return errorPage('invalid_request', 'Missing redirect_uri');

  // Lookup client
  const client = await env.DB.prepare(
    'SELECT client_id, client_name, redirect_uris, scope FROM oauth_clients WHERE client_id = ?'
  ).bind(clientId).first();
  if (!client) return errorPage('invalid_client', 'Unknown client_id');
  if (!isValidRedirectUri(client, redirectUri)) return errorPage('invalid_redirect_uri', `redirect_uri "${redirectUri}" not registered for this client`);

  // Check user logged in (Google session)
  const user = await getCurrentUser(request, env);
  if (!user) {
    // Redirect to login with returnUrl back to this authorize URL
    const baseUrl = env.BASE_URL || url.origin;
    const returnUrl = encodeURIComponent(url.toString());
    return Response.redirect(`${baseUrl}/?login_required=1&return_to=${returnUrl}`, 302);
  }

  // Render consent page
  const requestedScopes = scope.split(/\s+/).filter(Boolean);
  return new Response(consentHtml({
    user: user.email,
    clientName: client.client_name,
    clientId,
    redirectUri,
    state,
    scope,
    codeChallenge,
    codeChallengeMethod,
    requestedScopes
  }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/* POST /oauth/authorize — user clicked Allow on consent page
   Form fields: client_id, redirect_uri, state, scope, code_challenge, code_challenge_method, action (allow|deny)
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return errorPage('access_denied', 'Session expired, sign in again', null, null);

  const form = await request.formData();
  const clientId = form.get('client_id');
  const redirectUri = form.get('redirect_uri');
  const state = form.get('state') || '';
  const scope = form.get('scope') || '';
  const codeChallenge = form.get('code_challenge');
  const codeChallengeMethod = form.get('code_challenge_method') || 'plain';
  const action = form.get('action');

  if (action !== 'allow') {
    // User denied → redirect back with error
    const u = new URL(redirectUri);
    u.searchParams.set('error', 'access_denied');
    u.searchParams.set('error_description', 'User denied consent');
    if (state) u.searchParams.set('state', state);
    return Response.redirect(u.toString(), 302);
  }

  // Verify client + redirect
  const client = await env.DB.prepare(
    'SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id = ?'
  ).bind(clientId).first();
  if (!client || !isValidRedirectUri(client, redirectUri)) {
    return errorPage('invalid_request', 'Invalid client or redirect_uri');
  }

  // Generate authorization code (10 min TTL)
  const code = randomHex(32);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await env.DB.prepare(
    `INSERT INTO oauth_codes (code, client_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(code, clientId, user.id, redirectUri, scope, codeChallenge || null, codeChallengeMethod, expiresAt).run();

  // Redirect back with code
  const u = new URL(redirectUri);
  u.searchParams.set('code', code);
  if (state) u.searchParams.set('state', state);
  return Response.redirect(u.toString(), 302);
}

function consentHtml({ user, clientName, clientId, redirectUri, state, scope, codeChallenge, codeChallengeMethod, requestedScopes }) {
  const scopeLabels = {
    'packs:read': '📚 Đọc content packs của bạn',
    'packs:write': '✏️ Tạo + sửa packs',
    'gen:write': '🎨 Generate ảnh/voice/video qua Gemini/Veo',
    'publish:write': '📤 Schedule + publish posts lên FB Page',
    'ads:read': '📊 Đọc Meta Ads campaigns + insights',
    'ads:write': '⚠️ Tạo + sửa Meta Ads (TIÊU TIỀN từ ad account)'
  };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Authorize ${clientName} · Game of Ecom</title>
<style>
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{margin:0;background:linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#4338ca 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:white;border-radius:24px;max-width:500px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);overflow:hidden}
.header{background:linear-gradient(135deg,#DE6332,#F59E0B);color:white;padding:24px;text-align:center}
.header h1{margin:0;font-size:22px;font-weight:900}
.header p{margin:6px 0 0;font-size:13px;opacity:.95}
.body{padding:24px}
.who{background:#f3f4f6;border-radius:12px;padding:12px;margin-bottom:16px;font-size:13px}
.who b{color:#1f2937}
.scopes{list-style:none;padding:0;margin:16px 0}
.scopes li{padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;font-size:13px;background:#fafafa}
.scopes li.danger{background:#fef2f2;border-color:#fca5a5;color:#991b1b}
.warning{background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:10px;font-size:12px;color:#92400e;margin:12px 0}
.btns{display:flex;gap:10px;margin-top:20px}
button{flex:1;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
.deny{background:#f3f4f6;color:#374151}.deny:hover{background:#e5e7eb}
.allow{background:linear-gradient(135deg,#10B981,#0891B2);color:white}.allow:hover{opacity:.9}
.footer{padding:12px 24px;background:#fafafa;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:center}
</style></head><body>
<div class="card">
  <div class="header">
    <h1>🔌 ${escapeHtml(clientName)}</h1>
    <p>muốn truy cập Game of Ecom của bạn</p>
  </div>
  <form method="POST" action="/oauth/authorize" class="body">
    <input type="hidden" name="client_id" value="${escapeHtml(clientId)}"/>
    <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}"/>
    <input type="hidden" name="state" value="${escapeHtml(state)}"/>
    <input type="hidden" name="scope" value="${escapeHtml(scope)}"/>
    <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge || '')}"/>
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}"/>

    <div class="who">Đăng nhập với <b>${escapeHtml(user)}</b></div>

    <div style="font-size:13px;color:#374151;margin-bottom:10px"><b>${escapeHtml(clientName)}</b> sẽ được:</div>
    <ul class="scopes">
      ${requestedScopes.map(s => `<li class="${s === 'ads:write' ? 'danger' : ''}">${scopeLabels[s] || s}</li>`).join('')}
    </ul>

    ${requestedScopes.includes('ads:write') ? `<div class="warning">⚠️ <b>Cảnh báo</b>: Scope <code>ads:write</code> cho phép client tạo Meta Ad campaigns thật — sẽ tiêu tiền từ ad account của bạn. Chỉ allow nếu tin tưởng client này.</div>` : ''}

    <div class="btns">
      <button type="submit" name="action" value="deny" class="deny">Từ chối</button>
      <button type="submit" name="action" value="allow" class="allow">✓ Cho phép</button>
    </div>
  </form>
  <div class="footer">
    Game of Ecom · V17 OAuth 2.1 + PKCE · You can revoke access anytime in Settings → MCP keys
  </div>
</div>
</body></html>`;
}

function errorPage(error, description) {
  return new Response(`<html><body style="font-family:sans-serif;padding:40px;max-width:500px;margin:auto">
<h2 style="color:#dc2626">OAuth Error: ${escapeHtml(error)}</h2>
<p>${escapeHtml(description)}</p>
<p><a href="/">← Back to app</a></p>
</body></html>`, {
    status: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
