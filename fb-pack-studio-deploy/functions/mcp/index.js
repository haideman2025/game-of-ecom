// V16 — MCP server endpoint (Streamable HTTP transport)
// Speaks JSON-RPC 2.0 per MCP spec 2025-03-26
// POST /mcp  body: { jsonrpc:"2.0", id, method, params }

import { verifyMcpKey, logMcpCall } from '../_mcp_auth.js';
import { TOOLS, TOOLS_BY_NAME, visibleTools } from './_tools.js';

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_INFO = {
  name: 'game-of-ecom',
  version: '16.0',
  description: 'Game of Ecom — TikTok/FB content automation + Meta Ads (Vietnam ecom focus)'
};

// Resources (read-only data exposed to Claude)
const RESOURCES = [
  { uri: 'goe://packs', name: 'All packs', description: 'List of all user content packs', mimeType: 'application/json' },
  { uri: 'goe://status/fb', name: 'FB connection status', description: 'Current Facebook + Meta Ads connection state', mimeType: 'application/json' },
  { uri: 'goe://status/zernio', name: 'Zernio connection status', description: 'Zernio scheduling connection state', mimeType: 'application/json' }
];

// Prompts (templates Claude can use)
const PROMPTS = [
  {
    name: 'brand_strategy_writer',
    description: 'Generate a 10-section brand strategy document from a product brief',
    arguments: [
      { name: 'brief', description: 'Product/brand brief (1-3 paragraphs)', required: true },
      { name: 'industry', description: 'Industry vertical (e.g. mens-care, beauty)', required: false }
    ]
  },
  {
    name: 'viral_hook_generator',
    description: 'Generate 30 viral TikTok/Reels hooks for a niche',
    arguments: [
      { name: 'niche', description: 'Niche/topic', required: true },
      { name: 'audience', description: 'Target audience', required: false }
    ]
  },
  {
    name: 'boost_optimizer',
    description: 'Suggest which posts in a pack to boost + recommended budget split',
    arguments: [
      { name: 'pack_id', description: 'Pack UUID', required: true },
      { name: 'total_budget_vnd', description: 'Total ad budget in VND', required: true }
    ]
  }
];

// ─────────────────────────────────────────────────────────
// CORS — Claude Desktop/Code makes requests, need permissive CORS
// ─────────────────────────────────────────────────────────
function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    ...extra
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// ─────────────────────────────────────────────────────────
// GET /mcp — simple discovery (server info JSON)
// ─────────────────────────────────────────────────────────
export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({
    server: SERVER_INFO,
    protocol_version: PROTOCOL_VERSION,
    transport: 'streamable-http',
    auth: 'Bearer sk_goe_<key>',
    docs: new URL(request.url).origin + '/mcp/docs',
    tool_count: TOOLS.length
  }, null, 2), {
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

// ─────────────────────────────────────────────────────────
// POST /mcp — main JSON-RPC entry point
// ─────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  // Auth — MCP key in Authorization header
  const authHeader = request.headers.get('Authorization');
  const auth = await verifyMcpKey(env, authHeader);
  if (!auth) {
    // V17 — WWW-Authenticate header per RFC 9728 tells client to discover OAuth metadata
    const origin = new URL(request.url).origin;
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id: null,
      error: { code: -32001, message: 'Unauthorized: invalid or missing Bearer token' }
    }), {
      status: 401,
      headers: corsHeaders({
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="MCP", resource_metadata="${origin}/.well-known/oauth-protected-resource"`
      })
    });
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return jsonRpcError(null, -32700, 'Parse error', 400); }

  // Support batched requests (array) per JSON-RPC 2.0
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map(req => handleSingle(req, env, auth)));
    // Filter out null (notifications)
    const filtered = responses.filter(r => r !== null);
    return new Response(JSON.stringify(filtered), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }

  const result = await handleSingle(body, env, auth);
  if (result === null) {
    // Notification — no response per spec
    return new Response(null, { status: 202, headers: corsHeaders() });
  }
  return new Response(JSON.stringify(result), {
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

// ─────────────────────────────────────────────────────────
// Single JSON-RPC request dispatcher
// ─────────────────────────────────────────────────────────
async function handleSingle(req, env, auth) {
  const { jsonrpc, id, method, params } = req || {};

  // Notifications (no id) → no response
  const isNotification = id === undefined || id === null;

  if (jsonrpc !== '2.0') {
    return isNotification ? null : { jsonrpc: '2.0', id: id || null, error: { code: -32600, message: 'Invalid Request — missing jsonrpc 2.0' } };
  }

  try {
    let result;
    switch (method) {
      case 'initialize':
        result = handleInitialize(params, auth);
        break;
      case 'initialized':
      case 'notifications/initialized':
        return null;  // notification — no response
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: visibleTools(auth.scopes).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema || { type: 'object' }
        })) };
        break;
      case 'tools/call':
        result = await handleToolCall(params, env, auth);
        break;
      case 'resources/list':
        result = { resources: RESOURCES };
        break;
      case 'resources/read':
        result = await handleResourceRead(params, env, auth);
        break;
      case 'prompts/list':
        result = { prompts: PROMPTS };
        break;
      case 'prompts/get':
        result = await handlePromptGet(params);
        break;
      case 'logging/setLevel':
        result = {};
        break;
      default:
        if (isNotification) return null;
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, result };
  } catch (e) {
    console.error('[MCP]', method, e);
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, error: { code: e.code || -32603, message: e.message || 'Internal error' } };
  }
}

// ─────────────────────────────────────────────────────────
// initialize handler
// ─────────────────────────────────────────────────────────
function handleInitialize(params, auth) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
      logging: {}
    },
    serverInfo: {
      ...SERVER_INFO,
      authenticated_as: { user: auth.user.email, label: auth.label, scopes: auth.scopes }
    },
    instructions: `Game of Ecom MCP — content + Meta Ads automation cho Vietnam ecom.
Connected as ${auth.user.email} (key: ${auth.label}, scopes: ${auth.scopes.join(',')}).
${TOOLS.length} tools across packs, gen, publish, ads. Use list_packs to start.`
  };
}

// ─────────────────────────────────────────────────────────
// tools/call dispatcher — routes to TOOL.handler
// ─────────────────────────────────────────────────────────
async function handleToolCall(params, env, auth) {
  const { name, arguments: args } = params || {};
  if (!name) throw rpcErr(-32602, 'Missing tool name');
  const tool = TOOLS_BY_NAME[name];
  if (!tool) throw rpcErr(-32601, `Unknown tool: ${name}`);

  const start = Date.now();
  let result;
  try {
    result = await tool.handler(env, auth, args || {});
  } catch (e) {
    const r = {
      content: [{ type: 'text', text: 'Error: ' + (e.message || String(e)) }],
      isError: true
    };
    logMcpCall(env, auth, name, args, { error: e.message, duration_ms: Date.now() - start });
    return r;
  }
  logMcpCall(env, auth, name, args, { duration_ms: Date.now() - start });
  return result;
}

// ─────────────────────────────────────────────────────────
// resources/read
// ─────────────────────────────────────────────────────────
async function handleResourceRead(params, env, auth) {
  const { uri } = params || {};
  if (!uri) throw rpcErr(-32602, 'Missing uri');

  if (uri === 'goe://packs') {
    const r = await env.DB.prepare(
      `SELECT id, name, brand_name, created_at, updated_at FROM packs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
    ).bind(auth.user.id).all();
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(r.results || []) }]
    };
  }

  if (uri === 'goe://status/fb') {
    const cred = await env.DB.prepare(
      'SELECT page_id, page_name, scopes, ads_scopes, user_access_token IS NOT NULL AS has_user_token FROM fb_credentials WHERE user_id = ?'
    ).bind(auth.user.id).first();
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({
        connected: !!cred,
        page: cred ? { id: cred.page_id, name: cred.page_name } : null,
        ads_ready: !!cred?.has_user_token && (cred?.ads_scopes || '').includes('ads_management')
      }) }]
    };
  }

  if (uri === 'goe://status/zernio') {
    const u = await env.DB.prepare('SELECT zernio_account_id, zernio_api_key IS NOT NULL AS has_key FROM users WHERE id = ?').bind(auth.user.id).first();
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({
        connected: !!u?.has_key,
        active_account_id: u?.zernio_account_id
      }) }]
    };
  }

  throw rpcErr(-32602, 'Unknown resource: ' + uri);
}

// ─────────────────────────────────────────────────────────
// prompts/get
// ─────────────────────────────────────────────────────────
async function handlePromptGet(params) {
  const { name, arguments: args = {} } = params || {};
  if (name === 'brand_strategy_writer') {
    return {
      description: 'Generate brand strategy document',
      messages: [{
        role: 'user',
        content: { type: 'text', text:
`You are a senior brand strategist for Vietnamese ecom brands.
Generate a complete 10-section brand strategy document for this brief:

BRIEF:
${args.brief || '<no brief>'}

INDUSTRY: ${args.industry || 'general'}

Output sections:
1. Context analysis (PESTLE + 3C)
2. Consumer insight + JTBD
3. POP/POD positioning
4. Brand DNA (mission, vision, values, personality)
5. Visual identity direction
6. Touchpoint system
7. Content funnel (Awareness/Consideration/Conversion)
8. Channel strategy (FB/TikTok/IG mix)
9. 90-day execution roadmap
10. KPIs + measurement framework

Vietnamese language. Concrete and actionable.` }
      }]
    };
  }
  if (name === 'viral_hook_generator') {
    return {
      description: '30 viral hooks',
      messages: [{
        role: 'user',
        content: { type: 'text', text:
`Generate 30 viral TikTok/Reels hooks for niche: ${args.niche}
Audience: ${args.audience || 'general VN consumers 18-45'}

Mix of:
- 10x curiosity gap hooks
- 10x pain point hooks
- 10x social proof / before-after hooks

Vietnamese. 1 line each, < 15 words.` }
      }]
    };
  }
  if (name === 'boost_optimizer') {
    return {
      description: 'Boost strategy recommendation',
      messages: [{
        role: 'user',
        content: { type: 'text', text:
`Pack ID: ${args.pack_id}
Total budget VND: ${args.total_budget_vnd}

Use list_campaigns + get_pack tools to fetch current engagement data, then recommend:
- Which 5 posts to boost (highest organic engagement)
- Budget split per post (80/20 rule)
- Targeting refinement
- Goal selection per post (engagement vs traffic vs leads)
- Expected ROAS based on current spend benchmarks` }
      }]
    };
  }
  throw rpcErr(-32602, 'Unknown prompt: ' + name);
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function rpcErr(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function jsonRpcError(id, code, message, httpStatus = 200) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status: httpStatus,
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}
