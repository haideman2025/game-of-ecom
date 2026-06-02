// V17 — OAuth 2.1 helpers (PKCE, DCR, token issuance)
import { hashMcpKey, generateMcpKey } from './_mcp_auth.js';

/** Generate random ID/code in given format */
export function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hash → base64url (for PKCE verification) */
export async function sha256Base64Url(input) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return base64UrlEncode(new Uint8Array(buf));
}

export function base64UrlEncode(bytes) {
  const bin = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Verify PKCE — code_verifier matches code_challenge */
export async function verifyPkce(verifier, challenge, method) {
  if (!challenge) return true;   // no PKCE requested
  if (method !== 'S256' && method !== 'plain') return false;
  if (method === 'plain') return verifier === challenge;
  const computed = await sha256Base64Url(verifier);
  return computed === challenge;
}

/** Issue an access token — saves to mcp_api_keys, returns plain token */
export async function issueAccessToken(env, userId, clientId, scopes, ttlSeconds = 60 * 60 * 24 * 90) {
  const token = generateMcpKey();   // "sk_goe_<64hex>"
  const tokenHash = await hashMcpKey(token);
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  await env.DB.prepare(
    `INSERT INTO mcp_api_keys (key_hash, user_id, label, scopes, prefix, created_at, expires_at, issued_via, oauth_client_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'oauth', ?)`
  ).bind(
    tokenHash, userId,
    `OAuth ${clientId.slice(0, 12)}`,
    Array.isArray(scopes) ? scopes.join(',') : scopes,
    token.slice(0, 16) + '...',
    now, expiresAt, clientId
  ).run();

  return { token, expires_at: expiresAt, expires_in: ttlSeconds };
}

/** Issue refresh token paired with an access token */
export async function issueRefreshToken(env, accessTokenHash, ttlSeconds = 60 * 60 * 24 * 365) {
  const refreshToken = 'rt_' + randomHex(32);
  const refreshHash = await hashMcpKey(refreshToken);
  const expiresAt = Date.now() + ttlSeconds * 1000;
  await env.DB.prepare(
    `UPDATE mcp_api_keys SET refresh_token_hash = ?, refresh_expires_at = ? WHERE key_hash = ?`
  ).bind(refreshHash, expiresAt, accessTokenHash).run();
  return { refresh_token: refreshToken, refresh_expires_at: expiresAt };
}

/** Validate redirect_uri against client's registered URIs */
export function isValidRedirectUri(client, uri) {
  if (!uri) return false;
  let allowed = [];
  try { allowed = JSON.parse(client.redirect_uris || '[]'); } catch (e) {}
  // Exact match required per OAuth 2.1
  return allowed.includes(uri);
}

/** All scopes that OAuth flow grants by default (matches mcp_auth ALL_SCOPES) */
export const DEFAULT_OAUTH_SCOPES = ['packs:read', 'packs:write', 'gen:write', 'publish:write', 'ads:read'];
export const ALL_OAUTH_SCOPES = ['packs:read', 'packs:write', 'gen:write', 'publish:write', 'ads:read', 'ads:write'];
