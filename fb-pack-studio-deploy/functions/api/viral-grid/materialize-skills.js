import { json, error, getCurrentUser } from '../../_utils.js';
import { TOOLS } from '../../mcp/_tools.js';

/* V21.2 — POST /api/viral-grid/materialize-skills
   Runs materialize_top_posts + route_skills_for_product MCP tools.
   These DO call Gemini → backend forwards api_key via env injection.
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }
  if (!body.session_id) return error('Missing session_id', 400);

  const apiKey = body.api_key;
  const envWithKey = apiKey ? { ...env, GEMINI_API_KEY: apiKey } : env;
  const fakeAuth = {
    user: { id: user.id, email: user.email, name: user.name },
    label: 'internal:web-ui',
    key_hash: 'internal',
    scopes: ['*'],
    apiKey
  };

  const log = [];
  let materializeData = null;
  let routerData = null;

  // PHASE 5: Materialize (will call Gemini server-side; if geo-block hits, return error)
  const matTool = TOOLS.find(t => t.name === 'materialize_top_posts');
  if (matTool) {
    try {
      const r = await matTool.handler(envWithKey, fakeAuth, {
        session_id: body.session_id,
        count: body.count || 100
      });
      if (!r.isError) {
        materializeData = JSON.parse(r.content[0].text);
        log.push({ step: 'materialize', status: 'ok', count: materializeData.materialized });
      } else {
        log.push({ step: 'materialize', status: 'fail', error: r.content[0].text.slice(0, 200) });
      }
    } catch (e) {
      log.push({ step: 'materialize', status: 'fail', error: e.message.slice(0, 200) });
    }
  }

  // PHASE 6: Skills Router (NO Gemini call, just routing logic)
  if (body.product_type) {
    const routerTool = TOOLS.find(t => t.name === 'route_skills_for_product');
    if (routerTool) {
      try {
        const r = await routerTool.handler(envWithKey, fakeAuth, {
          session_id: body.session_id,
          product_type: body.product_type
        });
        if (!r.isError) {
          routerData = JSON.parse(r.content[0].text);
          log.push({ step: 'route_skills', status: 'ok', count: routerData.skills_routed });
        } else {
          log.push({ step: 'route_skills', status: 'fail', error: r.content[0].text.slice(0, 200) });
        }
      } catch (e) {
        log.push({ step: 'route_skills', status: 'fail', error: e.message.slice(0, 200) });
      }
    }
  }

  return json({
    ok: true,
    session_id: body.session_id,
    pack_id: materializeData?.pack_id,
    materialized: materializeData?.materialized || 0,
    skills_routed: routerData?.skills_routed || 0,
    routing_plan: routerData?.routing_plan,
    log
  });
}
