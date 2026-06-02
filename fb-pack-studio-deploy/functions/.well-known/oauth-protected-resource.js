// V17 — RFC 9728 OAuth 2.0 Protected Resource Metadata
// Tells clients that this resource (the MCP server) requires OAuth, pointing them to the authorization server

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  return new Response(JSON.stringify({
    resource: origin + '/mcp',
    authorization_servers: [origin],
    scopes_supported: ['packs:read', 'packs:write', 'gen:write', 'publish:write', 'ads:read', 'ads:write'],
    bearer_methods_supported: ['header'],
    resource_documentation: origin + '/mcp'
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
