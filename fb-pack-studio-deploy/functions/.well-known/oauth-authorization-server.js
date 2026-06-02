// V17 — RFC 8414 OAuth 2.0 Authorization Server Metadata
// Discoverable config — what endpoints exist, what algos supported, what scopes

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  return new Response(JSON.stringify({
    issuer: origin,
    authorization_endpoint: origin + '/oauth/authorize',
    token_endpoint: origin + '/oauth/token',
    registration_endpoint: origin + '/oauth/register',
    revocation_endpoint: origin + '/oauth/revoke',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['packs:read', 'packs:write', 'gen:write', 'publish:write', 'ads:read', 'ads:write'],
    service_documentation: origin + '/mcp',
    response_modes_supported: ['query'],
    subject_types_supported: ['public']
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
