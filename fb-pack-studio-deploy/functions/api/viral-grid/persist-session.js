import { json, error, getCurrentUser } from '../../_utils.js';
import { stageMediaToR2 } from '../_zernio.js';

/* V21.2 — POST /api/viral-grid/persist-session
   Receive 4-phase Gemini outputs from BROWSER (bypass CF geo-block),
   save to viral_grid_sessions D1 + render dashboard HTML → R2 public URL.
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { brand, product_type, phase_1_keyword_tree, phase_2_content_matrix, phase_3_visual_dna, phase_4_execution_plan } = body;
  if (!brand?.brand_name) return error('Missing brand.brand_name', 400);
  // V21.4 — Allow partial saves (any phase may be null if Gemini failed)
  const phasesCompleted = [phase_1_keyword_tree, phase_2_content_matrix, phase_3_visual_dna, phase_4_execution_plan].filter(p => p && typeof p === 'object').length;

  const sessionId = crypto.randomUUID();
  const now = Date.now();

  const masterJson = {
    version: '1.0.0',
    session_id: sessionId,
    brand,
    phase_1_keyword_tree,
    phase_2_content_matrix,
    phase_3_visual_dna,
    phase_4_execution_plan,
    meta: {
      total_leaves: phase_1_keyword_tree.stats?.total_leaves || 0,
      total_ideas: phase_2_content_matrix.total || 0,
      viral_ratio: phase_2_content_matrix.viral_ratio || 60,
      calendar_days: phase_4_execution_plan?.calendar?.length || 0,
      hook_count: phase_4_execution_plan?.hook_bank?.length || 0,
      kpi_count: phase_4_execution_plan?.kpis?.length || 0,
      sop_count: phase_4_execution_plan?.sops?.length || 0,
      generated_at: new Date().toISOString()
    }
  };

  // Save to D1 — V21.4 allow partial (status='partial' nếu < 4 phases)
  const status = phasesCompleted === 4 ? 'done' : (phasesCompleted > 0 ? 'partial' : 'failed');
  try {
    await env.DB.prepare(
      `INSERT INTO viral_grid_sessions (id, user_id, brand_name, intake_json, phase1_keyword_tree_json, phase2_content_matrix_json, phase3_visual_dna_json, phase4_execution_plan_json, master_json, status, phases_completed, total_leaves, total_ideas, viral_ratio, calendar_days, product_type, created_at, updated_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sessionId, user.id, brand.brand_name,
      JSON.stringify(brand),
      phase_1_keyword_tree ? JSON.stringify(phase_1_keyword_tree) : null,
      phase_2_content_matrix ? JSON.stringify(phase_2_content_matrix) : null,
      phase_3_visual_dna ? JSON.stringify(phase_3_visual_dna) : null,
      phase_4_execution_plan ? JSON.stringify(phase_4_execution_plan) : null,
      JSON.stringify(masterJson),
      status, phasesCompleted,
      masterJson.meta.total_leaves, masterJson.meta.total_ideas,
      masterJson.meta.viral_ratio, masterJson.meta.calendar_days,
      product_type || null,
      now, now, now
    ).run();
  } catch (e) {
    return error('DB save: ' + e.message, 500);
  }

  // Render dashboard HTML → R2
  let dashboardUrl = null;
  try {
    const { TOOLS } = await import('../../mcp/_tools.js');
    // Access render function indirectly — we'll inline minimal render here
    const html = renderQuickDashboard(masterJson);
    const bytes = new TextEncoder().encode(html);
    const staged = await stageMediaToR2(env, request, user.id, {
      filename: `dashboard-${brand.brand_name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.html`,
      mime: 'text/html',
      bytes
    });
    dashboardUrl = staged.url;
    await env.DB.prepare('UPDATE viral_grid_sessions SET dashboard_url = ? WHERE id = ?').bind(dashboardUrl, sessionId).run();
  } catch (e) {
    console.error('Dashboard render fail:', e);
  }

  return json({
    ok: true,
    session_id: sessionId,
    dashboard_url: dashboardUrl,
    meta: masterJson.meta
  });
}

function renderQuickDashboard(m) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tree = m.phase_1_keyword_tree || {};
  const matrix = m.phase_2_content_matrix || {};
  const dna = m.phase_3_visual_dna || {};
  const plan = m.phase_4_execution_plan || {};
  const brand = m.brand || {};

  const ideasHtml = (matrix.ideas || []).slice(0, 100).map(i =>
    `<tr><td>${esc(i.id)}</td><td>${esc(i.title)}</td><td>${esc(i.tier)}</td><td>${esc(i.format)}</td><td>${esc(i.hook_angle)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard · ${esc(brand.brand_name)}</title>
<style>
body{font-family:Inter,sans-serif;background:#0A0F1E;color:#F1F5F9;padding:30px;line-height:1.6}
h1{font-size:36px;color:#F59E0B;margin-bottom:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:30px}
.stat{background:#131A2E;border-radius:14px;padding:18px;text-align:center}
.n{font-size:36px;color:#F59E0B;font-weight:900}
.l{font-size:11px;color:#94A3B8;text-transform:uppercase;margin-top:6px}
.section{background:#131A2E;border-radius:16px;padding:24px;margin-bottom:16px}
h2{color:#06B6D4;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1A2240;padding:10px;text-align:left;color:#F59E0B}
td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.05);color:#94A3B8}
pre{background:#0A0F1E;padding:12px;border-radius:8px;font-size:11px;overflow-x:auto;white-space:pre-wrap}
</style></head><body>
<h1>🌟 ${esc(brand.brand_name)} — Master Dashboard</h1>
<p style="color:#94A3B8">Session ${esc(m.session_id.slice(0,8))}... · ${esc(m.meta.generated_at)}</p>

<div class="stats">
  <div class="stat"><div class="n">${m.meta.total_leaves}</div><div class="l">Leaves</div></div>
  <div class="stat"><div class="n">${m.meta.total_ideas}</div><div class="l">Ideas</div></div>
  <div class="stat"><div class="n">${m.meta.viral_ratio}%</div><div class="l">Viral</div></div>
  <div class="stat"><div class="n">${m.meta.calendar_days}</div><div class="l">Days</div></div>
  <div class="stat"><div class="n">${m.meta.hook_count}</div><div class="l">Hooks</div></div>
  <div class="stat"><div class="n">${m.meta.kpi_count}</div><div class="l">KPIs</div></div>
</div>

<div class="section">
  <h2>🌳 Keyword Tree (${m.meta.total_leaves} leaves)</h2>
  <pre>${esc(JSON.stringify(tree.pillars, null, 2))}</pre>
</div>

<div class="section">
  <h2>📋 Content Matrix (${matrix.total} ideas, ${matrix.viral_ratio}% viral)</h2>
  <table><thead><tr><th>ID</th><th>Title</th><th>Tier</th><th>Format</th><th>Hook</th></tr></thead>
  <tbody>${ideasHtml}</tbody></table>
  <p style="font-size:11px;color:#64748B;margin-top:12px">Hiển thị 100 ideas đầu. Total ${matrix.total} ideas.</p>
</div>

<div class="section">
  <h2>🎨 Visual DNA</h2>
  <p style="color:#F59E0B;font-weight:bold">${esc(dna.signature_pattern?.name || '')}</p>
  <p>${esc(dna.signature_pattern?.description || '')}</p>
  <pre>${esc(JSON.stringify(dna, null, 2))}</pre>
</div>

<div class="section">
  <h2>📅 Execution Plan</h2>
  <p>${(plan.calendar || []).length} days · ${(plan.hook_bank || []).length} hooks · ${(plan.kpis || []).length} KPIs · ${(plan.sops || []).length} SOPs</p>
  <pre>${esc(JSON.stringify(plan, null, 2).slice(0, 5000))}...</pre>
</div>

</body></html>`;
}
