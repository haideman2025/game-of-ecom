import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* POST /api/strategist/analyze
   Body: { pack_id, api_key, model?, project_meta? }
   Loads all vault_files content for pack → composes prompt → calls Gemini 2.5 Pro
   → returns structured strategy JSON + HTML report.
   GROUNDED: every claim must cite source files. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { pack_id, api_key, model: modelOverride, project_meta } = body;
  if (!pack_id) return error('Missing pack_id');
  if (!api_key) return error('Missing api_key (Gemini)');

  try { await requireCap(env, pack_id, user, 'edit_settings'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Load vault files
  const vaultRes = await env.DB.prepare(
    `SELECT id, filename, mime, size_bytes, content_text, content_summary, category, notes
     FROM vault_files WHERE pack_id = ? ORDER BY created_at ASC`
  ).bind(pack_id).all();
  const vault = vaultRes.results || [];

  if (vault.length === 0) {
    return error('Vault rỗng — upload ít nhất 1 file (brief, market research, brand doc...) trước khi run Strategist.', 400);
  }

  // Project meta (brand name, industry, etc.) — frontend can pre-fill
  const meta = project_meta || {};

  // Compose source documents block
  const sourceBlocks = vault.map((v, i) => {
    const text = (v.content_text || '').slice(0, 30000);
    return `── SOURCE [${i + 1}] · ${v.filename} (${v.mime}, ${Math.round((v.size_bytes||0)/1024)}KB) ${v.category ? '· cat: ' + v.category : ''}${v.notes ? '\nNotes: ' + v.notes : ''}\n${text || '(no extractable text — file binary, maybe image)'}`;
  }).join('\n\n');

  const systemPrompt = `Bạn là AI Brand Strategist chuyên nghiệp với 15 năm kinh nghiệm DTC/Ecom Việt Nam.
NGUYÊN TẮC TUYỆT ĐỐI:
1. TUYỆT ĐỐI KHÔNG bịa data — chỉ rút insight từ SOURCE DOCUMENTS được cung cấp.
2. Mỗi claim cần cite source: [SOURCE N] hoặc nếu lý luận chủ quan thì ghi rõ "[suy luận chung]".
3. Nếu source không đủ data cho 1 mục → ghi rõ "Cần thêm: ..." thay vì bịa.
4. Output strict JSON theo schema yêu cầu.
5. Văn phong: business pro nhưng dễ hiểu, target Vietnamese audience.`;

  const userPrompt = `# Project Context
${meta.brand_name ? `- Brand name (sơ bộ): ${meta.brand_name}` : ''}
${meta.industry ? `- Industry: ${meta.industry}` : ''}
${meta.goal_30d ? `- 30-day goal: ${meta.goal_30d}` : ''}
${meta.audience_hint ? `- Audience hint: ${meta.audience_hint}` : ''}
${meta.usp_hint ? `- USP hint: ${meta.usp_hint}` : ''}

# SOURCE DOCUMENTS (${vault.length} files)
${sourceBlocks}

# Yêu cầu
Phân tích toàn bộ source documents, sinh strategy JSON đầy đủ với schema:

\`\`\`json
{
  "brand_dna": {
    "name": "string (tên brand, refine từ meta + sources)",
    "tagline": "string ≤80 chars",
    "industry": "string",
    "audience": "string (target persona, 1-2 câu)",
    "audience_detail": "string (insight sâu hơn về pain/desire/behavior — cite [SOURCE N])",
    "usp": "string (Unique Selling Point, 1-2 câu, cite source)",
    "insight": "string (customer insight gốc, cite source)",
    "voice": "string (tone of voice 3-5 tính từ)",
    "positioning": "string (1 câu — vs who, for whom, why)"
  },
  "pillars": [
    {"name": "string", "purpose": "string (vai trò pillar)", "ratio_pct": 50, "themes": ["string"]},
    {"name": "string", "purpose": "string", "ratio_pct": 30, "themes": ["string"]},
    {"name": "string", "purpose": "string", "ratio_pct": 20, "themes": ["string"]}
  ],
  "content_calendar_30d": [
    {"day": 1, "pillar": 1, "theme": "string (cụ thể, không generic)", "hook": "string ≤100 chars", "format": "image|video|carousel|reel"},
    ... (đủ 30 days)
  ],
  "competitor_analysis": [
    {"name": "string (từ source nếu có, nếu không skip)", "strength": "string", "weakness": "string", "differentiator_for_us": "string"}
  ],
  "risks_and_blockers": ["string (top 3-5 risks dựa trên data)"],
  "kpi_30d": [
    {"metric": "string", "target": "string (số cụ thể nếu source có baseline)"}
  ],
  "next_actions_for_user": [
    "string (3-5 việc user cần làm thêm để strategy thực thi tốt)"
  ],
  "source_citations": [
    {"source_idx": 1, "filename": "string", "key_insights_extracted": ["string"]}
  ],
  "ungrounded_warnings": [
    "string (mục nào trong strategy không có source backing → user cần verify)"
  ]
}
\`\`\`

Output JSON only, no preamble.`;

  const model = modelOverride || 'gemini-2.5-pro';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const runId = `sr_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  try {
    await env.DB.prepare(
      `INSERT INTO strategist_runs (id, pack_id, user_id, status, vault_file_ids, model_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(runId, pack_id, user.id, 'running', JSON.stringify(vault.map(v=>v.id)), model, Date.now()).run();
  } catch(e) {}

  let gemResp;
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api_key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 65536
        }
      })
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Gemini ${r.status}: ${err.slice(0, 300)}`);
    }
    gemResp = await r.json();
  } catch (e) {
    await env.DB.prepare(`UPDATE strategist_runs SET status = 'failed', error_msg = ?, completed_at = ? WHERE id = ?`)
      .bind(e.message.slice(0, 500), Date.now(), runId).run();
    return error('Strategist call failed: ' + e.message, 502);
  }

  const txt = gemResp.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let strategy;
  try {
    strategy = JSON.parse(txt);
  } catch (e) {
    try {
      const cleaned = txt.replace(/```(?:json)?/g, '').trim();
      strategy = JSON.parse(cleaned);
    } catch (e2) {
      return error('Strategy JSON parse failed: ' + e2.message + ' · raw text length: ' + txt.length, 500);
    }
  }

  // Render minimal HTML report (full version client-side has better fonts)
  const html = renderStrategyHTML(strategy, vault);

  // Save run
  try {
    await env.DB.prepare(
      `UPDATE strategist_runs SET status = 'completed', strategy_json = ?, html_report = ?, tokens_input = ?, tokens_output = ?, completed_at = ? WHERE id = ?`
    ).bind(
      JSON.stringify(strategy).slice(0, 200000),
      html.slice(0, 200000),
      gemResp.usageMetadata?.promptTokenCount || null,
      gemResp.usageMetadata?.candidatesTokenCount || null,
      Date.now(), runId
    ).run();
  } catch(e) {}

  return json({
    ok: true,
    run_id: runId,
    strategy,
    html_preview: html,
    vault_used: vault.length,
    sources: vault.map((v, i) => ({ idx: i + 1, filename: v.filename })),
    model,
    tokens: gemResp.usageMetadata
  });
}

function renderStrategyHTML(s, vault) {
  const cite = (sources) => Array.isArray(sources) ? sources.map(idx => `<sup class="cite">[${idx.source_idx || idx}]</sup>`).join('') : '';
  const escape = (str) => (str || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"/>
<title>Brand Strategy — ${escape(s?.brand_dna?.name || 'Brand')}</title>
<style>
body{font-family:'Be Vietnam Pro',system-ui,sans-serif;max-width:920px;margin:0 auto;padding:24px;background:#FFFCF5;color:#0F0A05;line-height:1.6}
h1{font-family:'Bowlby One',sans-serif;font-size:42px;margin:0 0 8px;color:#C2691A}
h2{font-family:'Bowlby One',sans-serif;font-size:24px;margin:32px 0 12px;color:#0F0A05;border-bottom:3px solid #F59E0B;padding-bottom:4px}
h3{margin:18px 0 6px;color:#44372A}
.tag{display:inline-block;padding:2px 8px;border-radius:8px;background:#FFE9B8;color:#7A3F0E;font-size:11px;font-weight:700;margin-right:4px}
.card{background:#fff;border-radius:18px;padding:18px;margin:12px 0;box-shadow:0 4px 12px rgba(196,132,26,0.1)}
.pillar{border-left:6px solid #F59E0B;padding-left:14px;margin:8px 0}
.cite{color:#0EA5E9;font-weight:600;font-size:11px}
.warn{background:#FEF2F2;border-left:4px solid #E11D48;padding:12px;margin:12px 0;color:#9F1239;border-radius:8px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{text-align:left;padding:8px;border-bottom:1px solid #E8DFD0;font-size:13px}
th{background:#F5EFE0;font-weight:700}
.sources{background:#F5EFE0;padding:12px;border-radius:12px;margin:24px 0;font-size:12px}
</style>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&family=Bowlby+One&display=swap" rel="stylesheet">
</head><body>
<div class="tag">🤖 AI BRAND STRATEGY · ${new Date().toLocaleDateString('vi-VN')}</div>
<h1>${escape(s?.brand_dna?.name || 'Brand')}</h1>
<p style="font-size:18px;color:#44372A">${escape(s?.brand_dna?.tagline || '')}</p>

<h2>🧬 Brand DNA</h2>
<div class="card">
<table>
<tr><th width="180">Industry</th><td>${escape(s?.brand_dna?.industry || '')}</td></tr>
<tr><th>Audience</th><td>${escape(s?.brand_dna?.audience || '')}</td></tr>
<tr><th>Audience detail</th><td>${escape(s?.brand_dna?.audience_detail || '')}</td></tr>
<tr><th>USP</th><td>${escape(s?.brand_dna?.usp || '')}</td></tr>
<tr><th>Customer Insight</th><td>${escape(s?.brand_dna?.insight || '')}</td></tr>
<tr><th>Voice</th><td>${escape(s?.brand_dna?.voice || '')}</td></tr>
<tr><th>Positioning</th><td>${escape(s?.brand_dna?.positioning || '')}</td></tr>
</table>
</div>

<h2>📌 Content Pillars</h2>
${(s?.pillars || []).map((p, i) => `
<div class="card pillar">
<h3>P${i+1} · ${escape(p.name)} <span class="tag">${p.ratio_pct||0}%</span></h3>
<p><b>Purpose:</b> ${escape(p.purpose)}</p>
<p><b>Themes:</b> ${(p.themes||[]).map(t=>`<span class="tag">${escape(t)}</span>`).join(' ')}</p>
</div>`).join('')}

<h2>📅 30-Day Content Calendar</h2>
<div class="card">
<table>
<tr><th>Day</th><th>Pillar</th><th>Theme</th><th>Hook</th><th>Format</th></tr>
${(s?.content_calendar_30d || []).map(c => `
<tr><td><b>${c.day}</b></td><td>P${c.pillar}</td><td>${escape(c.theme)}</td><td>${escape(c.hook)}</td><td>${escape(c.format)}</td></tr>
`).join('')}
</table>
</div>

${(s?.competitor_analysis || []).length > 0 ? `
<h2>⚔️ Competitor Analysis</h2>
${s.competitor_analysis.map(c => `
<div class="card">
<h3>${escape(c.name)}</h3>
<p><b>Strength:</b> ${escape(c.strength)}</p>
<p><b>Weakness:</b> ${escape(c.weakness)}</p>
<p><b>Differentiator for us:</b> ${escape(c.differentiator_for_us)}</p>
</div>`).join('')}
` : ''}

${(s?.risks_and_blockers || []).length > 0 ? `
<h2>⚠️ Risks & Blockers</h2>
<ul>${s.risks_and_blockers.map(r => `<li>${escape(r)}</li>`).join('')}</ul>
` : ''}

${(s?.kpi_30d || []).length > 0 ? `
<h2>🎯 30-Day KPIs</h2>
<table>
<tr><th>Metric</th><th>Target</th></tr>
${s.kpi_30d.map(k => `<tr><td>${escape(k.metric)}</td><td><b>${escape(k.target)}</b></td></tr>`).join('')}
</table>
` : ''}

${(s?.next_actions_for_user || []).length > 0 ? `
<h2>✅ Next Actions cho Captain</h2>
<ul>${s.next_actions_for_user.map(a => `<li>${escape(a)}</li>`).join('')}</ul>
` : ''}

${(s?.ungrounded_warnings || []).length > 0 ? `
<h2>🚨 Ungrounded Warnings — cần verify</h2>
${s.ungrounded_warnings.map(w => `<div class="warn">${escape(w)}</div>`).join('')}
` : ''}

<div class="sources">
<h3>📚 Source Documents Used</h3>
<ol>${vault.map((v, i) => `<li><b>[${i+1}]</b> ${escape(v.filename)} (${Math.round((v.size_bytes||0)/1024)}KB)</li>`).join('')}</ol>
</div>

<div style="text-align:center;margin-top:40px;color:#7C6A52;font-size:11px">
Generated by 🎮 Game of Ecom · AI Strategist · ${new Date().toISOString()}
</div>
</body></html>`;
}
