import { verifyPkce, issueAccessToken, issueRefreshToken } from '../_oauth.js';
import { hashMcpKey } from '../_mcp_auth.js';

/* V17 — OAuth 2.1 Token Endpoint
   POST /oauth/token  (application/x-www-form-urlencoded)

   Grant types:
   - authorization_code: code, redirect_uri, client_id, code_verifier
   - refresh_token: refresh_token, client_id

   Returns: { access_token, token_type:"Bearer", expires_in, refresh_token?, scope }
*/
export async function onRequestPost({ request, env }) {
  const ct = request.headers.get('Content-Type') || '';
  let params;
  if (ct.includes('application/json')) {
    const body = await request.json();
    params = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  } else {
    params = new URLSearchParams(await request.text());
  }

  const grantType = params.get('grant_type');
  if (grantType === 'authorization_code') return await handleAuthCode(params, env);
  if (grantType === 'refresh_token') return await handleRefresh(params, env);
  return tokenErr('unsupported_grant_type', `Grant "${grantType}" not supported`);
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

async function handleAuthCode(params, env) {
  const code = params.get('code');
  const redirectUri = params.get('redirect_uri');
  const clientId = params.get('client_id');
  const codeVerifier = params.get('code_verifier');
  const clientSecret = params.get('client_secret');

  if (!code) return tokenErr('invalid_request', 'Missing code');
  if (!clientId) return tokenErr('invalid_request', 'Missing client_id');
  if (!redirectUri) return tokenErr('invalid_request', 'Missing redirect_uri');

  // Lookup code
  const codeRow = await env.DB.prepare(
    'SELECT * FROM oauth_codes WHERE code = ?'
  ).bind(code).first();
  if (!codeRow) return tokenErr('invalid_grant', 'Code not found');
  if (codeRow.used_at) return tokenErr('invalid_grant', 'Code already used');
  if (codeRow.expires_at < Date.now()) return tokenErr('invalid_grant', 'Code expired');
  if (codeRow.client_id !== clientId) return tokenErr('invalid_grant', 'Code does not match client_id');
  if (codeRow.redirect_uri !== redirectUri) return tokenErr('invalid_grant', 'redirect_uri mismatch');

  // PKCE verification
  if (codeRow.code_challenge) {
    if (!codeVerifier) return tokenErr('invalid_request', 'Missing code_verifier (PKCE required)');
    const valid = await verifyPkce(codeVerifier, codeRow.code_challenge, codeRow.code_challenge_method);
    if (!valid) return tokenErr('invalid_grant', 'PKCE verification failed');
  }

  // Validate client (confidential clients must send secret)
  const client = await env.DB.prepare(
    'SELECT * FROM oauth_clients WHERE client_id = ?'
  ).bind(clientId).first();
  if (!client) return tokenErr('invalid_client', 'Unknown client');
  if (client.token_endpoint_auth_method !== 'none') {
    if (!clientSecret) return tokenErr('invalid_client', 'Missing client_secret');
    const hash = await hashMcpKey(clientSecret);
    if (hash !== client.client_secret_hash) return tokenErr('invalid_client', 'Bad client_secret');
  }

  // Mark code as used (one-time)
  await env.DB.prepare('UPDATE oauth_codes SET used_at = ? WHERE code = ?').bind(Date.now(), code).run();

  // Issue access token
  const scopes = (codeRow.scopes || '').split(/\s+/).filter(Boolean);
  const access = await issueAccessToken(env, codeRow.user_id, clientId, scopes);
  const tokenHash = await hashMcpKey(access.token);
  const refresh = await issueRefreshToken(env, tokenHash);

  return jsonOk({
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: access.expires_in,
    refresh_token: refresh.refresh_token,
    scope: scopes.join(' ')
  });
}

async function handleRefresh(params, env) {
  const refreshToken = params.get('refresh_token');
  const clientId = params.get('client_id');
  if (!refreshToken) return tokenErr('invalid_request', 'Missing refresh_token');

  const refreshHash = await hashMcpKey(refreshToken);
  const keyRow = await env.DB.prepare(
    'SELECT user_id, scopes, oauth_client_id, refresh_expires_at FROM mcp_api_keys WHERE refresh_token_hash = ?'
  ).bind(refreshHash).first();

  if (!keyRow) return tokenErr('invalid_grant', 'Unknown refresh token');
  if (keyRow.refresh_expires_at && keyRow.refresh_expires_at < Date.now()) {
    return tokenErr('invalid_grant', 'Refresh token expired');
  }
  if (clientId && keyRow.oauth_client_id && clientId !== keyRow.oauth_client_id) {
    return tokenErr('invalid_grant', 'Client mismatch');
  }

  // Issue new access token (and rotate refresh per OAuth 2.1)
  const scopes = (keyRow.scopes || '').split(/[,\s]+/).filter(Boolean);
  const access = await issueAccessToken(env, keyRow.user_id, keyRow.oauth_client_id || clientId, scopes);
  const newTokenHash = await hashMcpKey(access.token);
  const newRefresh = await issueRefreshToken(env, newTokenHash);

  return jsonOk({
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: access.expires_in,
    refresh_token: newRefresh.refresh_token,
    scope: scopes.join(' ')
  });
}

function jsonOk(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function tokenErr(error, description, status = 400) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
