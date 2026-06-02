import { json, error, getCurrentUser } from '../../_utils.js';
import { TOOLS } from '../../mcp/_tools.js';

/* V20.D — POST /api/viral-grid/run — frontend wrapper around run_viral_grid_master MCP tool */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  // V21.1 — Extract api_key forwarded từ frontend localStorage
  const apiKey = body.api_key;
  delete body.api_key;  // strip before passing to MCP tool

  const fakeAuth = {
    user: { id: user.id, email: user.email, name: user.name },
    label: 'internal:web-ui',
    key_hash: 'internal',
    scopes: ['*'],
    apiKey  // V21.1 — MCP callGemini will pick this up via opts.apiKey
  };

  // V21.1 — Set env override so callGemini auto-picks up
  const envWithKey = apiKey ? { ...env, GEMINI_API_KEY: apiKey } : env;

  const tool = TOOLS.find(t => t.name === 'run_viral_grid_master');
  if (!tool) return error('run_viral_grid_master tool not found', 500);

  try {
    const result = await tool.handler(envWithKey, fakeAuth, body);
    if (result.isError) {
      const text = result.content?.[0]?.text || 'Unknown error';
      return error(text.replace(/^Error: /, ''), 502);
    }
    const data = JSON.parse(result.content[0].text);
    return json(data);
  } catch (e) {
    return error('Internal: ' + e.message, 500);
  }
}
