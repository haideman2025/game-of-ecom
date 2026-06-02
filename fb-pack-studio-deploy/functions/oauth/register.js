import { randomHex } from '../_oauth.js';

/* V17 — RFC 7591 Dynamic Client Registration
   POST /oauth/register
   Body: { client_name, redirect_uris[], grant_types[], response_types[], scope, token_endpoint_auth_method, ... }
   Returns: { client_id, client_id_issued_at, client_secret?, ... } */
export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); }
  catch (e) {
    return jsonErr(400, 'invalid_client_metadata', 'Invalid JSON');
  }

  const {
    client_name = 'Unknown Client',
    redirect_uris = [],
    grant_types = ['authorization_code', 'refresh_token'],
    response_types = ['code'],
    scope = 'packs:read packs:write gen:write publish:write ads:read',
    token_endpoint_auth_method = 'none',     // public clients (Cowork, claude.ai web)
    software_id,
    software_version
  } = body;

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return jsonErr(400, 'invalid_redirect_uri', 'redirect_uris required');
  }

  // Validate redirect URIs — must be https or http://localhost (for dev)
  for (const uri of redirect_uris) {
    try {
      const u = new URL(uri);
      const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol !== 'https:' && !isLocal) {
        return jsonErr(400, 'invalid_redirect_uri', `Non-HTTPS redirect_uri not allowed: ${uri}`);
      }
    } catch (e) {
      return jsonErr(400, 'invalid_redirect_uri', `Malformed URI: ${uri}`);
    }
  }

  const clientId = 'cl_' + randomHex(16);
  // Public clients (PKCE) — no secret. Confidential clients — issue secret.
  let clientSecret = null;
  let clientSecretHash = null;
  if (token_endpoint_auth_method !== 'none') {
    clientSecret = 'sec_' + randomHex(32);
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(clientSecret));
    clientSecretHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types, scope, token_endpoint_auth_method, software_id, software_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    clientId, clientSecretHash, client_name.slice(0, 200),
    JSON.stringify(redirect_uris),
    JSON.stringify(grant_types),
    JSON.stringify(response_types),
    scope, token_endpoint_auth_method,
    software_id || null, software_version || null,
    now
  ).run();

  return new Response(JSON.stringify({
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    client_id_issued_at: Math.floor(now / 1000),
    redirect_uris,
    grant_types,
    response_types,
    scope,
    token_endpoint_auth_method,
    client_name
  }, null, 2), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
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

function jsonErr(status, error, description) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
