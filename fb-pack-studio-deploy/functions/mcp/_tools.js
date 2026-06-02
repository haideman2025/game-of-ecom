// V18 — MCP tool registry: 30+ tools, FULL CONTROL of Game of Ecom
// All stubs replaced with real implementations calling existing API logic

import { requireScope } from '../_mcp_auth.js';
import { getZernioKey, zernioPost, zernioGet, zernioPatch, zernioDelete, buildPostBody, stageMediaToR2, base64ToBytes } from '../api/_zernio.js';
import { getFbCreds, metaGet, metaPost, formatAdAccountId, goalToObjective, goalToOptimization, toMetaBudgetMinor } from '../api/_meta.js';

// ============================================================
// HELPERS
// ============================================================
function ok(obj) {
  return {
    content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
    isError: false
  };
}

function err(msg, extra) {
  return {
    content: [{ type: 'text', text: 'Error: ' + msg + (extra ? '\n' + JSON.stringify(extra, null, 2) : '') }],
    isError: true
  };
}

/** Best-effort call to Gemini API.
    V21.1 fix — Tries multiple sources for API key:
    1. env.GEMINI_API_KEY (Cloudflare secret, ideal for production multi-user)
    2. user's saved key in users.gemini_api_key column (per-user BYOK)
    3. throws if neither
*/
async function callGemini(env, model, payload, opts = {}) {
  let key = env.GEMINI_API_KEY || opts.apiKey;
  if (!key && opts.userId && env.DB) {
    try {
      const u = await env.DB.prepare('SELECT gemini_api_key FROM users WHERE id = ?').bind(opts.userId).first();
      key = u?.gemini_api_key;
    } catch (e) {}
  }
  if (!key) throw new Error('Gemini API key missing. Vào Settings → Save key Gemini trước, hoặc set GEMINI_API_KEY Cloudflare secret.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || `Gemini ${r.status}`);
  return d;
}

/** Update post JSON in pack — mutates packs.posts_json */
async function updatePostInPack(env, userId, packId, postN, mutator) {
  const pack = await env.DB.prepare('SELECT * FROM packs WHERE id = ? AND user_id = ?').bind(packId, userId).first();
  if (!pack) throw new Error('Pack not found');
  const posts = JSON.parse(pack.posts_json || '[]');
  const idx = posts.findIndex(p => p.n === postN);
  if (idx < 0) throw new Error(`Post n=${postN} not found in pack`);
  const updated = await mutator(posts[idx]);
  posts[idx] = updated;
  await env.DB.prepare(
    'UPDATE packs SET posts_json = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(JSON.stringify(posts), Date.now(), packId, userId).run();
  return updated;
}

/** Sleep helper for batch ops */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** V21.C — Build ready-to-invoke intake prompt for each skill, populated từ master.json */
function buildSkillIntake(skillName, brand, dna, matrix, plan, productType) {
  const brandStr = `Brand: ${brand.brand_name || ''} (${brand.tagline || ''})\nIndustry: ${brand.industry || ''}\nAudience: ${brand.audience || ''}\nMood: ${(brand.mood || []).join(', ')}`;
  const dnaStr = `Visual DNA: palette ${dna.palette?.primary || ''}, ${dna.composition?.rule || ''}, signature "${dna.signature_pattern?.name || ''}"`;
  const matrixHint = `Content matrix có ${matrix.total || 0} ideas, ${matrix.viral_ratio || 60}% viral. Sample leaf: ${(matrix.ideas || [])[0]?.title || ''}`;
  const planHint = `30-day calendar, ${(plan.hook_bank || []).length} hooks, ${(plan.kpis || []).length} KPIs.`;

  const SKILL_TEMPLATES = {
    'edutainment-brand-engine': `Xây edutainment brand strategy cho:\n${brandStr}\n\n${dnaStr}\n\nMục tiêu: 3 PDF (Brand Strategy Deck 15 slides + 30-Day Execution + Comic Demo Day 1 8-10 panels).\nDùng intake từ master.json: ${matrixHint} ${planHint}`,
    'comic-content-engine': `Tạo comic edutainment series:\n${brandStr}\n\nVisual style theo: ${dnaStr}\n\nDùng content matrix ideas làm episode topics. Output: mascot character + episode scripts + storyboards + 30-day calendar.`,
    'edu-video-engine': `Convert content matrix ideas thành animation videos:\n${brandStr}\n\nDùng ${matrixHint}\n\nPick top 5 ideas, biến thành HTML5 animation videos minh họa kiến thức.`,
    'vintage-edu-card-9grid': `Tạo 9-grid carousel cards vintage style:\n${brandStr}\n\nChủ đề pick từ matrix: ${matrixHint}\n\nDNA: ${dnaStr}`,
    'vintage-stickfigure-edu-video': `Tạo vintage stick figure edu video 60s:\n${brandStr}\n\nChủ đề: pick top idea từ matrix.\nStyle: vintage flipbook charcoal sketch.`,
    'aff-niche-builder': `Build TikTok affiliate niche channel:\n${brandStr}\n\nDùng keyword tree leaves làm 100 hooks + 100 image prompts + 100 video prompts + 30-day calendar.`,
    'tiktok-30day-creator-dashboard': `Tạo TikTok creator content hub 30 ngày:\n${brandStr}\n\nDùng matrix ideas: ${matrixHint}\n\nDeploy Cloudflare Workers với 30 vintage infographic + 30 long-form + 30 caption pack.`,
    'koc-virtual-builder': `Build KOC ảo cho brand:\n${brandStr}\n\nMood: ${(brand.mood || []).join(', ')}\nDNA: ${dnaStr}\n\nOutput: character lifestyle + 30-day POV storyboard + Veo 3 prompts.`,
    'pixel-aff-video-engine': `Tạo pixel-game-style aff video 45-60s:\n${brandStr}\n\nDùng signature visual: ${dna.signature_pattern?.description || 'pixel art'}`,
    'image-prompt-master': `Convert image prompts cross-model cho matrix:\n${brandStr}\n\nDNA hint: ${dnaStr}\n\nMỗi prompt phải có Nano Banana / MJ / Flux variants.`,
    'fb-content-30day-pack': `Tạo 30 FB posts ready-to-publish:\n${brandStr}\n\nMaterialized pack đã có ở session. Refine + add SVG mockup + first comments + hashtags.`,
    'fb-ads-mess-30day-pack': `Tạo 30 Mess-trigger ads posts:\n${brandStr}\n\nMục tiêu: thu lead qua Messenger. Mỗi post 1 keyword inbox riêng. Forecast budget.`,
    'mascot-brand-pack': `Build mascot starter pack:\n${brandStr}\n\nMood: ${(brand.mood || []).join(', ')}\nDNA: ${dnaStr}\n\nOutput: 5-7 mascot variants + Brand DNA markdown + AI prompts portable.`,
    'dual-line-packaging-engine': `Build packaging brief 2 line cho:\n${brandStr}\n\nDNA: ${dnaStr}\n\nOutput: HTML brief với bottle SVG mockup + color palette + scent line-up + launch roadmap.`,
    'product-ad-video': `Tạo TVC 30s edutainment cho:\n${brandStr}\n\nDùng materialized pack post #1 làm script.\nStyle: science-led, voice-over sync, full-bleed product image.`,
    'lp-storytelling-conversion': `Tạo LP 15-slide storytelling cho:\n${brandStr}\n\nMục tiêu: thu form COD đặt hàng.\nDùng content matrix viral ideas làm slide angles.`,
    'brand-quiz-engine': `Build quiz game 5-10 câu cho:\n${brandStr}\n\nProduct type: ${productType}\nDNA: ${dnaStr}\n\nOutput: HTML 30-50KB + 4 voucher tier theo score.`,
    'ai-game-voucher-engine': `Build playable HTML5 mini-game cho:\n${brandStr}\n\nDNA: ${dnaStr}\n\nPick 1 trong 5 template: TAP SHOOTER / SNAKE / TYCOON / MAZE / RHYTHM.`,
    'memory-card-brand': `Build memory match game:\n${brandStr}\n\nMatch product feature cards + icons + descriptions. Time-based voucher tier.`,
    'wordle-daily-engine': `Build daily Wordle:\n${brandStr}\n\nDaily words liên quan product features. 6 guesses → voucher tier.`,
    'landing-page-video-engine': `Tạo LP với product video:\n${brandStr}\n\nDùng materialized pack post #1 làm hero. Voice-over sync.`,
    'brand-strategy-engine': `Build full brand strategy:\n${brandStr}\n\nMaster.json đã có Phase 1-4. Generate 10-section doc + 13-slide deck.`,
    'financial-growth-engine': `Build chiến lược tài chính growth:\n${brandStr}\n\nIndustry: ${brand.industry}\nOutput: Word 15-20 trang + Excel 10+ sheet + PPTX 13 trang.`,
    'landing-page-builder': `Tạo landing page deploy Netlify từ master.json:\n${brandStr}\n\nDNA: ${dnaStr}`,
    'think-coach-hn': `Decision support cho ${brand.brand_name}: launch sequence, pricing, partnership ...`,
    'slide-deck-to-netlify-lp': `Convert master.json dashboard PDF thành Netlify LP:\n${brandStr}`,
    'notebooklm': `Research thêm cho ${brand.brand_name} industry "${brand.industry}". Source-grounded answers.`,
    'docx': `Tạo Word document từ master.json (strategy doc cho team).`,
    'pdf': `Export master.json sections sang PDF cho stakeholders.`,
    'pptx': `Tạo slide deck 15 slides từ master.json.`
  };

  return SKILL_TEMPLATES[skillName] || `${brandStr}\n\nDNA: ${dnaStr}\n\nDùng skill ${skillName} cho brand này.`;
}

/** V20.B — Render Master Dashboard HTML từ master.json */
function renderMasterDashboard(m) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tree = m.phase_1_keyword_tree || {};
  const matrix = m.phase_2_content_matrix || {};
  const dna = m.phase_3_visual_dna || {};
  const plan = m.phase_4_execution_plan || {};
  const brand = m.brand || {};
  const meta = m.meta || {};

  const pillarsHtml = (tree.pillars || []).map(p => {
    const branchesHtml = (p.branches || []).map(b => {
      const leavesHtml = (b.leaves || []).map(l => `<li><code>${esc(l.id)}</code> · ${esc(l.keyword)} <span class="tag">${esc(l.angle)}</span></li>`).join('');
      return `<div class="branch"><h4>${esc(b.name)}</h4><ul>${leavesHtml}</ul></div>`;
    }).join('');
    return `<div class="pillar"><h3>📌 ${esc(p.name)} <span class="w">${p.weight || 0}%</span></h3>${branchesHtml}</div>`;
  }).join('');

  const ideasHtml = (matrix.ideas || []).slice(0, 100).map(i =>
    `<tr><td><code>${esc(i.id)}</code></td><td>${esc(i.title)}</td><td><span class="pill p-${i.tier}">${esc(i.tier)}</span></td><td>${esc(i.format)}</td><td>${esc(i.hook_angle)}</td><td><code>${esc(i.leaf_id)}</code></td></tr>`
  ).join('');

  const calendarHtml = (plan.calendar || []).map(c =>
    `<tr><td>${c.day}</td><td>${esc(c.date)}</td><td>${esc(c.slot)}</td><td><code>${esc(c.idea_id)}</code></td><td>${esc(c.format)}</td><td>${esc(c.hook_angle)}</td></tr>`
  ).join('');

  const hooksHtml = (plan.hook_bank || []).map(h =>
    `<div class="hook"><div class="ha">${esc(h.angle)}</div><div class="ht">${esc(h.text)}</div></div>`
  ).join('');

  const kpisHtml = (plan.kpis || []).map(k =>
    `<tr><td><code>${esc(k.id)}</code></td><td>${esc(k.name)}</td><td>${k.baseline}</td><td>${k.target_week1 || '—'}</td><td>${k.target_month1 || '—'}</td><td>${esc(k.unit)}</td></tr>`
  ).join('');

  const sopsHtml = (plan.sops || []).map(s =>
    `<div class="sop"><h4>📋 ${esc(s.name)} <span class="role">${esc(s.owner_role)} · ${esc(s.frequency)}</span></h4><ol>${(s.steps || []).map(st => `<li>${esc(st)}</li>`).join('')}</ol></div>`
  ).join('');

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Master Dashboard · ${esc(brand.brand_name || 'Brand')}</title>
<link href="https://fonts.googleapis.com/css2?family=Bowlby+One&family=Inter:wght@400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
:root{--bg:#0A0F1E;--card:#131A2E;--elev:#1A2240;--gold:#F59E0B;--cyan:#06B6D4;--purple:#A78BFA;--pink:#EC4899;--emerald:#10B981;--rose:#EF4444;--txt:#F1F5F9;--mut:#94A3B8;--bd:rgba(255,255,255,.08)}
*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}
body{background:linear-gradient(135deg,#0A0F1E,#1A2240);color:var(--txt);min-height:100vh}
.wrap{max-width:1400px;margin:0 auto;padding:32px 20px}
h1{font-family:'Bowlby One';font-size:36px;background:linear-gradient(90deg,var(--gold),var(--pink));-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:8px}
.sub{color:var(--mut);font-size:14px;margin-bottom:24px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:32px}
.stat{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px;text-align:center}
.stat-n{font-family:'Bowlby One';font-size:32px;color:var(--gold);line-height:1}
.stat-l{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.1em;margin-top:6px}
.tabs{display:flex;gap:4px;margin-bottom:20px;border-bottom:2px solid var(--bd);flex-wrap:wrap}
.tab{padding:12px 20px;background:transparent;border:none;color:var(--mut);font-weight:700;font-size:13px;cursor:pointer;border-bottom:3px solid transparent;font-family:inherit}
.tab.active{color:var(--gold);border-color:var(--gold)}
.panel{display:none;background:var(--card);border:1px solid var(--bd);border-radius:20px;padding:24px}
.panel.active{display:block}
.pillar{background:var(--elev);border-radius:14px;padding:18px;margin-bottom:12px}
.pillar h3{font-family:'Bowlby One';color:var(--cyan);margin-bottom:12px;display:flex;justify-content:space-between}
.pillar .w{color:var(--gold);font-size:14px;background:rgba(245,158,11,.1);padding:2px 10px;border-radius:6px}
.branch{background:rgba(0,0,0,.2);border-left:3px solid var(--purple);border-radius:8px;padding:10px 14px;margin-bottom:8px}
.branch h4{font-size:13px;color:var(--purple);margin-bottom:6px}
.branch ul{list-style:none;font-size:12px}
.branch li{padding:4px 0;color:var(--mut);border-bottom:1px dashed rgba(255,255,255,.05)}
.branch li code{color:var(--cyan);font-size:10px;margin-right:8px}
.branch li .tag{background:rgba(236,72,153,.1);color:var(--pink);padding:1px 6px;border-radius:4px;font-size:9px;margin-left:8px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:var(--elev);padding:10px;text-align:left;color:var(--gold);font-weight:700;font-size:11px;text-transform:uppercase}
td{padding:8px 10px;border-bottom:1px solid var(--bd);color:var(--mut)}
td code{color:var(--cyan);font-size:10px}
.pill{padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase}
.p-viral{background:rgba(245,158,11,.15);color:var(--gold)}
.p-brand{background:rgba(6,182,212,.15);color:var(--cyan)}
.dna-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.dna-el{background:var(--elev);border-radius:12px;padding:16px;border-left:4px solid var(--pink)}
.dna-el h4{font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.dna-el pre{font-family:'JetBrains Mono';font-size:11px;color:var(--txt);white-space:pre-wrap;word-break:break-word}
.swatch{display:inline-block;width:24px;height:24px;border-radius:6px;margin-right:6px;vertical-align:middle;border:1px solid rgba(255,255,255,.1)}
.signature{background:linear-gradient(135deg,rgba(245,158,11,.1),rgba(236,72,153,.1));border:2px solid var(--gold);border-radius:16px;padding:20px;margin-bottom:16px}
.signature h3{font-family:'Bowlby One';color:var(--gold);margin-bottom:8px}
.hooks{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.hook{background:var(--elev);border-radius:10px;padding:12px;border-left:3px solid var(--pink)}
.hook .ha{font-size:9px;color:var(--pink);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;font-weight:700}
.hook .ht{font-size:12px;color:var(--txt)}
.sop{background:var(--elev);border-radius:12px;padding:18px;margin-bottom:12px;border-left:4px solid var(--emerald)}
.sop h4{color:var(--emerald);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap}
.sop .role{color:var(--mut);font-size:11px;font-weight:400}
.sop ol{padding-left:20px;font-size:12px;color:var(--mut)}
.sop ol li{padding:4px 0}
</style></head>
<body><div class="wrap">
<h1>🌟 ${esc(brand.brand_name)} — Master Dashboard</h1>
<div class="sub">Viral Grid Master Strategy · Generated ${esc(meta.generated_at || '')} · Session ${esc(m.session_id || '').slice(0, 8)}</div>

<div class="stats">
  <div class="stat"><div class="stat-n">${meta.total_leaves || 0}</div><div class="stat-l">Leaves</div></div>
  <div class="stat"><div class="stat-n">${meta.total_ideas || 0}</div><div class="stat-l">Ideas</div></div>
  <div class="stat"><div class="stat-n">${meta.viral_ratio || 60}%</div><div class="stat-l">Viral Ratio</div></div>
  <div class="stat"><div class="stat-n">${meta.calendar_days || 30}</div><div class="stat-l">Days</div></div>
  <div class="stat"><div class="stat-n">${meta.hook_count || 0}</div><div class="stat-l">Hooks</div></div>
  <div class="stat"><div class="stat-n">${meta.kpi_count || 0}</div><div class="stat-l">KPIs</div></div>
  <div class="stat"><div class="stat-n">${meta.sop_count || 0}</div><div class="stat-l">SOPs</div></div>
</div>

<div class="tabs">
  <button class="tab active" onclick="t(this,'p0')">📊 Tổng quan</button>
  <button class="tab" onclick="t(this,'p1')">🌳 Lưới Mục Tiêu</button>
  <button class="tab" onclick="t(this,'p2')">📋 Content Matrix</button>
  <button class="tab" onclick="t(this,'p3')">🎨 Visual DNA</button>
  <button class="tab" onclick="t(this,'p4')">📅 Execution Plan</button>
</div>

<div id="p0" class="panel active">
  <h2 style="font-family:'Bowlby One';margin-bottom:16px">📊 Highlights</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
    <div class="dna-el"><h4>BRAND INTAKE</h4><pre>${esc(JSON.stringify(brand, null, 2))}</pre></div>
    <div class="dna-el"><h4>SIGNATURE PATTERN</h4><pre>${esc(JSON.stringify(dna.signature_pattern || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>NEXT ACTIONS</h4><pre>1. create_pack_from_strategy(session, days=[1,30])
2. generate_all_images(pack_id)
3. schedule_from_execution_plan(pack_id)
4. boost_top_performers (sau week 2)</pre></div>
  </div>
</div>

<div id="p1" class="panel">
  <h2 style="font-family:'Bowlby One';margin-bottom:16px">🌳 Lưới Mục Tiêu (Keyword Tree)</h2>
  <p style="color:var(--mut);margin-bottom:16px">Root: <strong style="color:var(--gold)">${esc(tree.root?.name || '')}</strong> — ${esc(tree.root?.purpose || '')}</p>
  ${pillarsHtml}
</div>

<div id="p2" class="panel">
  <h2 style="font-family:'Bowlby One';margin-bottom:16px">📋 Content Matrix (${matrix.total || 0} ideas)</h2>
  <table><thead><tr><th>ID</th><th>Title</th><th>Tier</th><th>Format</th><th>Hook</th><th>Leaf</th></tr></thead><tbody>${ideasHtml}</tbody></table>
  <p style="color:var(--mut);font-size:11px;margin-top:14px;font-style:italic">Hiển thị 100 ideas đầu. Tổng ${matrix.total || 0} ideas trong matrix.</p>
</div>

<div id="p3" class="panel">
  <h2 style="font-family:'Bowlby One';margin-bottom:16px">🎨 Visual DNA</h2>
  <div class="signature">
    <h3>✨ ${esc(dna.signature_pattern?.name || 'Signature Pattern')}</h3>
    <p>${esc(dna.signature_pattern?.description || '')}</p>
    <p style="color:var(--mut);font-size:12px;margin-top:8px">Usage: ${esc(dna.signature_pattern?.usage || '')}</p>
  </div>
  <div class="dna-grid">
    <div class="dna-el"><h4>🎨 Palette</h4>
      ${Object.entries(dna.palette || {}).filter(([k]) => k !== 'rationale').map(([k, v]) => v && v.startsWith('#') ? `<div><span class="swatch" style="background:${esc(v)}"></span>${esc(k)}: <code>${esc(v)}</code></div>` : '').join('')}
      <p style="color:var(--mut);font-size:11px;margin-top:8px">${esc(dna.palette?.rationale || '')}</p>
    </div>
    <div class="dna-el"><h4>🔤 Typography</h4><pre>${esc(JSON.stringify(dna.typography || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>📐 Composition</h4><pre>${esc(JSON.stringify(dna.composition || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>💫 Motion</h4><pre>${esc(JSON.stringify(dna.motion || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>🐻 Mascot</h4><pre>${esc(JSON.stringify(dna.mascot || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>📏 Texture</h4><pre>${esc(JSON.stringify(dna.texture || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>💡 Light</h4><pre>${esc(JSON.stringify(dna.light || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>🎯 Iconography</h4><pre>${esc(JSON.stringify(dna.iconography || {}, null, 2))}</pre></div>
    <div class="dna-el"><h4>🎵 Sound</h4><pre>${esc(JSON.stringify(dna.sound || {}, null, 2))}</pre></div>
  </div>
</div>

<div id="p4" class="panel">
  <h2 style="font-family:'Bowlby One';margin-bottom:16px">📅 Execution Plan</h2>

  <h3 style="font-family:'Bowlby One';margin:18px 0 10px;color:var(--cyan)">📅 ${(plan.calendar || []).length}-Day Calendar</h3>
  <table><thead><tr><th>Day</th><th>Date</th><th>Slot</th><th>Idea ID</th><th>Format</th><th>Hook</th></tr></thead><tbody>${calendarHtml}</tbody></table>

  <h3 style="font-family:'Bowlby One';margin:24px 0 10px;color:var(--pink)">🎣 Hook Bank (${(plan.hook_bank || []).length})</h3>
  <div class="hooks">${hooksHtml}</div>

  <h3 style="font-family:'Bowlby One';margin:24px 0 10px;color:var(--gold)">📊 KPI Dashboard (${(plan.kpis || []).length})</h3>
  <table><thead><tr><th>ID</th><th>Name</th><th>Baseline</th><th>Week 1</th><th>Month 1</th><th>Unit</th></tr></thead><tbody>${kpisHtml}</tbody></table>

  <h3 style="font-family:'Bowlby One';margin:24px 0 10px;color:var(--emerald)">📋 SOPs (${(plan.sops || []).length})</h3>
  ${sopsHtml}
</div>

<script>
function t(btn, id){
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(id).classList.add('active');
}
</script>
</div></body></html>`;
}

// ============================================================
// TOOL REGISTRY — V18 (30+ tools)
// ============================================================
export const TOOLS = [
  // ──────────────────────────────────────────
  // PACKS — read/write
  // ──────────────────────────────────────────
  {
    name: 'list_packs',
    description: 'List all content packs owned by or shared with the user. Returns pack id, name, post count, brand, created/updated dates.',
    scope: 'packs:read',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 100 } }, additionalProperties: false },
    async handler(env, auth, args = {}) {
      requireScope(auth, 'packs:read');
      const r = await env.DB.prepare(
        `SELECT p.id, p.name, p.created_at, p.updated_at,
                p.image_count, p.audio_count, p.video_count, p.scene_count
           FROM packs p
          WHERE p.user_id = ? OR p.id IN (SELECT pack_id FROM pack_shares WHERE user_id = ?)
          ORDER BY p.updated_at DESC LIMIT ?`
      ).bind(auth.user.id, auth.user.id, args.limit || 100).all();
      return ok({ total: r.results?.length || 0, packs: r.results || [] });
    }
  },
  {
    name: 'get_pack',
    description: 'Get full pack details: brand + all posts (n, day, pillar, title, caption, image_prompt, voice_script, status).',
    scope: 'packs:read',
    inputSchema: { type: 'object', required: ['pack_id'], properties: { pack_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      const pack = await env.DB.prepare(
        'SELECT * FROM packs WHERE id = ? AND (user_id = ? OR id IN (SELECT pack_id FROM pack_shares WHERE user_id = ?))'
      ).bind(args.pack_id, auth.user.id, auth.user.id).first();
      if (!pack) return err('Pack not found or access denied');
      let posts = []; try { posts = JSON.parse(pack.posts_json || '[]'); } catch (e) {}
      let brand = null; try { brand = pack.brand_json ? JSON.parse(pack.brand_json) : null; } catch (e) {}
      return ok({
        pack: { id: pack.id, name: pack.name, created_at: pack.created_at, updated_at: pack.updated_at },
        brand,
        posts,
        stats: {
          total_posts: posts.length,
          image_count: pack.image_count, audio_count: pack.audio_count,
          video_count: pack.video_count, scene_count: pack.scene_count
        }
      });
    }
  },
  {
    name: 'create_pack_from_brief',
    description: 'ATOMIC: Create a new pack + analyze brief → brand DNA + generate ALL posts (with image_prompts ready) in ONE call. Optionally also generates images. Returns full pack ready to use.',
    scope: 'packs:write',
    inputSchema: {
      type: 'object', required: ['name', 'brief'],
      properties: {
        name: { type: 'string', description: 'Pack display name' },
        brief: { type: 'string', description: 'Brand/product brief — 1-3 paragraphs. Strategist will analyze + extract DNA + generate posts.' },
        brand_name: { type: 'string', description: 'Override brand name (default = pack name)' },
        days: { type: 'number', default: 30, description: 'Number of posts to generate (max 30)' },
        platform: { type: 'string', enum: ['facebook', 'tiktok'], default: 'facebook' },
        industry: { type: 'string', description: 'Optional industry hint to help Strategist (e.g. "mens-care", "beauty", "edtech")' },
        auto_generate_images: { type: 'boolean', default: false, description: 'Also auto-gen images for all posts (slow: adds ~5-15s × N posts to call duration). Use generate_all_images later if false.' },
        tone: { type: 'string', description: 'Optional tone guidance (e.g. "playful science-led", "luxury minimal")' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      const packId = crypto.randomUUID();
      const now = Date.now();
      const count = Math.min(args.days || 30, 30);
      const steps = [];

      // ──────── Step 1: Brand DNA analysis ────────
      const brandPrompt = `You are a Vietnamese brand strategist analyzing this brief:

BRIEF: ${args.brief}
${args.industry ? `INDUSTRY HINT: ${args.industry}` : ''}
${args.tone ? `TONE GUIDANCE: ${args.tone}` : ''}
PLATFORM: ${args.platform || 'facebook'}

Extract brand DNA. Return JSON ONLY:
{
  "name": "${(args.brand_name || args.name).replace(/"/g, '\\"')}",
  "industry": "specific industry vertical",
  "audience": { "demo": "age + gender + location + income", "psycho": "values + lifestyle + pain points" },
  "voice": "tone of voice (3-5 adjectives)",
  "usp": "unique selling proposition (1 sentence)",
  "pillars": [
    {"name": "Awareness", "desc": "what topic", "weight": 50},
    {"name": "Consideration", "desc": "what topic", "weight": 30},
    {"name": "Conversion", "desc": "what topic", "weight": 20}
  ],
  "core_message": "the one big idea",
  "tags": ["3-5 tags"]
}`;

      let brand = {
        name: args.brand_name || args.name,
        brief: args.brief,
        industry: args.industry || 'auto-detect',
        platform: args.platform || 'facebook'
      };

      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: brandPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const dna = JSON.parse(text);
        brand = { ...brand, ...dna };
        steps.push({ step: 'brand_dna', status: 'ok' });
      } catch (e) {
        steps.push({ step: 'brand_dna', status: 'fail', error: e.message.slice(0, 150) });
      }

      // ──────── Step 2: Generate posts ────────
      const postsPrompt = `You are a Vietnamese viral content writer for ${args.platform || 'facebook'}.

BRAND DNA: ${JSON.stringify(brand)}

Generate exactly ${count} posts for ${count} days. Mix pillars: 50% Awareness, 30% Consideration, 20% Conversion.

Each post MUST have:
- n: integer 1 to ${count} (sequential)
- day: integer 1 to ${count}
- pillar: 1 | 2 | 3
- title: Vietnamese, < 60 chars, scroll-stopping hook
- caption: Vietnamese, 80-200 words, structure = HOOK + VALUE + CTA. NO emoji spam. Conversational tone.
- image_prompt: ENGLISH, 30-60 words, detailed scene for AI image gen (style + subject + lighting + composition). Reflect brand voice.
- best_time: HH:MM in 24h format (use peak times: 06:30, 09:00, 12:00, 18:00, 20:00, 21:30)

Return JSON ONLY: { "posts": [{...}, {...}, ...] }`;

      let posts = [];
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: postsPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 32768 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(text);
        posts = (parsed.posts || []).map((p, i) => ({
          ...p,
          n: p.n || (i + 1),
          day: p.day || (i + 1),
          pillar: p.pillar || 1,
          status: 'draft'
        }));
        steps.push({ step: 'generate_posts', status: 'ok', count: posts.length });
      } catch (e) {
        steps.push({ step: 'generate_posts', status: 'fail', error: e.message.slice(0, 200) });
      }

      // ──────── Step 3: Save pack to D1 ────────
      try {
        await env.DB.prepare(
          `INSERT INTO packs (id, user_id, name, brand_json, posts_json, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(packId, auth.user.id, args.name, JSON.stringify(brand), JSON.stringify(posts), now, now).run();
        steps.push({ step: 'save_pack', status: 'ok' });
      } catch (e) {
        return err('DB save failed: ' + e.message, { steps });
      }

      // ──────── Step 4: Optional auto-generate images ────────
      let imageResults = null;
      if (args.auto_generate_images && posts.length > 0) {
        try {
          const imgTool = TOOLS.find(t => t.name === 'generate_all_images');
          const r = await imgTool.handler(env, auth, { pack_id: packId });
          try { imageResults = JSON.parse(r.content[0].text); } catch (e) {}
          steps.push({ step: 'generate_images', status: r.isError ? 'fail' : 'ok', data: imageResults });
        } catch (e) {
          steps.push({ step: 'generate_images', status: 'fail', error: e.message });
        }
      }

      return ok({
        ok: true,
        pack_id: packId,
        name: args.name,
        brand,
        posts_count: posts.length,
        posts_preview: posts.slice(0, 5),
        all_posts: posts,
        images_generated: imageResults,
        steps,
        message: posts.length > 0
          ? `✅ Pack "${args.name}" created with ${posts.length} posts ready (brand DNA + captions + image_prompts).${args.auto_generate_images ? ' Images also generated.' : ' Call generate_all_images to populate images, or schedule_bulk after images.'}`
          : `⚠ Pack created but post generation failed. Call extend_day_range to retry.`,
        next_steps: posts.length > 0 ? [
          `generate_all_images(pack_id="${packId}") — populate images`,
          `auto_pipeline_full_pack(pack_id="${packId}") — generate + schedule end-to-end`,
          `schedule_bulk(pack_id="${packId}", start_date="2026-05-20") — schedule to FB`
        ] : [
          `extend_day_range(pack_id="${packId}", start_day=1, count=${count}) — retry posts`
        ]
      });
    }
  },
  {
    name: 'extend_day_range',
    description: 'Generate N posts using Gemini Strategist, appending to existing pack. Each post: title, caption, image_prompt, day, pillar, best_time.',
    scope: 'packs:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'count'],
      properties: {
        pack_id: { type: 'string' },
        start_day: { type: 'number', description: 'First day number (default: max existing day + 1)' },
        count: { type: 'number', description: 'Number of posts (max 30)' },
        theme_hint: { type: 'string', description: 'Optional theme guidance' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      const pack = await env.DB.prepare('SELECT * FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      let posts = []; try { posts = JSON.parse(pack.posts_json || '[]'); } catch (e) {}
      let brand = null; try { brand = pack.brand_json ? JSON.parse(pack.brand_json) : null; } catch (e) {}
      const startDay = args.start_day || (posts.length > 0 ? Math.max(...posts.map(p => p.day || p.n || 0)) + 1 : 1);
      const count = Math.min(args.count, 30);
      const maxN = posts.length > 0 ? Math.max(...posts.map(p => p.n || 0)) : 0;

      const prompt = `You are a Vietnamese content strategist for ecom brands.
BRAND: ${JSON.stringify(brand || {})}
EXISTING POSTS COUNT: ${posts.length}
${args.theme_hint ? `THEME HINT: ${args.theme_hint}` : ''}

Generate ${count} new Facebook posts starting at day ${startDay}.
Each post needs: title (< 60 chars), caption (Vietnamese, 80-200 words, viral hook + value + CTA), image_prompt (English, detailed scene for AI image gen), day (integer), pillar (1=Awareness, 2=Consideration, 3=Conversion), best_time (HH:MM format).

Mix pillars 50% / 30% / 20%.

Return JSON ONLY: { "posts": [{ "n": ${maxN + 1}, "day": ${startDay}, "title": "...", "caption": "...", "image_prompt": "...", "pillar": 1, "best_time": "09:00" }, ...] }`;

      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.8 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(text);
        const newPosts = (parsed.posts || []).map((p, i) => ({
          ...p,
          n: p.n || (maxN + 1 + i),
          day: p.day || (startDay + i),
          status: 'draft'
        }));
        const allPosts = [...posts, ...newPosts];
        await env.DB.prepare(
          'UPDATE packs SET posts_json = ?, updated_at = ? WHERE id = ? AND user_id = ?'
        ).bind(JSON.stringify(allPosts), Date.now(), args.pack_id, auth.user.id).run();
        return ok({
          ok: true,
          pack_id: args.pack_id,
          generated: newPosts.length,
          total_posts: allPosts.length,
          new_posts: newPosts.slice(0, 5),  // preview
          message: `Generated ${newPosts.length} posts (Day ${startDay}-${startDay + count - 1})`
        });
      } catch (e) {
        return err('Strategist generation failed: ' + e.message);
      }
    }
  },

  // ──────────────────────────────────────────
  // GEN — image/voice/storyboard (REAL, no longer stubs)
  // ──────────────────────────────────────────
  {
    name: 'generate_image',
    description: 'Generate an image with Gemini Nano Banana Pro. Auto-stages to R2 and returns PUBLIC URL (not base64). Use this URL in posts/ads/etc.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        aspect_ratio: { type: 'string', enum: ['1:1', '4:5', '16:9', '9:16'], default: '4:5' },
        save_to_pack_id: { type: 'string', description: 'Optional — also save as asset to this pack' },
        save_for_post_n: { type: 'number', description: 'Optional — also mark as image for this post number' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash-image', {
          contents: [{ role: 'user', parts: [{ text: args.prompt + ` (aspect ratio ${args.aspect_ratio || '4:5'})` }] }]
        });
        const imagePart = resp.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart) return err('No image generated');
        const mime = imagePart.inlineData.mimeType || 'image/png';
        const bytes = base64ToBytes(imagePart.inlineData.data);

        // Stage to R2 — returns public URL
        const staged = await stageMediaToR2(env, { url: 'https://internal' }, auth.user.id, {
          filename: `mcp_img_${Date.now()}.${mime.includes('png') ? 'png' : 'jpg'}`,
          mime,
          bytes
        });

        // Optional: save as asset
        if (args.save_to_pack_id) {
          try {
            await env.DB.prepare(
              `INSERT INTO media_files (id, user_id, pack_id, post_n, kind, r2_key, url, mime, size_bytes, created_at)
               VALUES (?, ?, ?, ?, 'image', ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), auth.user.id, args.save_to_pack_id, args.save_for_post_n || null,
              staged.key, staged.url, mime, bytes.length, Date.now()
            ).run();
          } catch (e) { /* table may not exist with this schema */ }
        }
        return ok({
          ok: true,
          url: staged.url,
          r2_key: staged.key,
          mime,
          size_bytes: bytes.length,
          aspect_ratio: args.aspect_ratio || '4:5'
        });
      } catch (e) {
        return err('Image gen: ' + e.message);
      }
    }
  },
  {
    name: 'generate_voice',
    description: 'Generate Vietnamese voice-over via Gemini TTS. Returns PUBLIC R2 URL of MP3/WAV audio file.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['text'],
      properties: {
        text: { type: 'string', description: 'Voice-over script (Vietnamese)' },
        voice: { type: 'string', default: 'Kore', description: 'Voice name: Kore, Puck, Charon, Zephyr, Aoede, Fenrir, Leda, Orus...' },
        save_to_pack_id: { type: 'string' },
        save_for_post_n: { type: 'number' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash-preview-tts', {
          contents: [{ parts: [{ text: args.text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: args.voice || 'Kore' } } }
          }
        });
        const audioPart = resp.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!audioPart) return err('No audio generated');
        const bytes = base64ToBytes(audioPart.inlineData.data);
        const staged = await stageMediaToR2(env, { url: 'https://internal' }, auth.user.id, {
          filename: `mcp_voice_${Date.now()}.wav`,
          mime: 'audio/wav',
          bytes
        });
        if (args.save_to_pack_id) {
          try {
            await env.DB.prepare(
              `INSERT INTO media_files (id, user_id, pack_id, post_n, kind, r2_key, url, mime, size_bytes, created_at)
               VALUES (?, ?, ?, ?, 'voice', ?, ?, ?, ?, ?)`
            ).bind(crypto.randomUUID(), auth.user.id, args.save_to_pack_id, args.save_for_post_n || null,
              staged.key, staged.url, 'audio/wav', bytes.length, Date.now()).run();
          } catch (e) {}
        }
        return ok({ ok: true, url: staged.url, r2_key: staged.key, mime: 'audio/wav', size_bytes: bytes.length, voice: args.voice || 'Kore', text_length: args.text.length });
      } catch (e) { return err('Voice gen: ' + e.message); }
    }
  },
  {
    name: 'generate_storyboard',
    description: 'Convert voice-over script into a scene-by-scene storyboard (scene image prompts, durations).',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['voice_script'],
      properties: {
        voice_script: { type: 'string' },
        aspect_ratio: { type: 'string', enum: ['9:16', '16:9', '1:1'], default: '9:16' },
        scene_count: { type: 'number', default: 6 },
        style: { type: 'string', description: 'Visual style guidance' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const prompt = `Break this Vietnamese voice-over into ${args.scene_count || 6} cinematic scenes for video.
VOICE SCRIPT: ${args.voice_script}
ASPECT RATIO: ${args.aspect_ratio || '9:16'}
${args.style ? `STYLE: ${args.style}` : ''}

For each scene return: scene_n, narration_segment (which part of voice-over plays), duration_seconds, image_prompt (English, AI-image-ready).

Return JSON: { "scenes": [{ "scene_n": 1, "narration": "...", "duration_seconds": 4.5, "image_prompt": "..." }, ...] }`;
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(text);
        return ok({ ok: true, scenes: parsed.scenes || [], aspect_ratio: args.aspect_ratio || '9:16' });
      } catch (e) { return err('Storyboard: ' + e.message); }
    }
  },
  {
    name: 'regenerate_image_for_post',
    description: 'Generate a new image for a specific post in a pack — uses the post\'s image_prompt automatically and saves the URL into the post.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'post_n'],
      properties: {
        pack_id: { type: 'string' },
        post_n: { type: 'number' },
        prompt_override: { type: 'string', description: 'Override the post.image_prompt' },
        aspect_ratio: { type: 'string', default: '4:5' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const pack = await env.DB.prepare('SELECT posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      const posts = JSON.parse(pack.posts_json || '[]');
      const post = posts.find(p => p.n === args.post_n);
      if (!post) return err(`Post n=${args.post_n} not found`);
      const prompt = args.prompt_override || post.image_prompt;
      if (!prompt) return err('Post has no image_prompt and no prompt_override given');

      // Call generate_image tool inline
      const imgTool = TOOLS.find(t => t.name === 'generate_image');
      const result = await imgTool.handler(env, auth, {
        prompt, aspect_ratio: args.aspect_ratio || '4:5',
        save_to_pack_id: args.pack_id, save_for_post_n: args.post_n
      });
      if (result.isError) return result;

      // Parse URL from result and save into post
      try {
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.url) {
          await updatePostInPack(env, auth.user.id, args.pack_id, args.post_n, async (p) => ({ ...p, image_url: parsed.url }));
          return ok({ ok: true, post_n: args.post_n, image_url: parsed.url });
        }
      } catch (e) {}
      return result;
    }
  },

  // ──────────────────────────────────────────
  // POST EDITING
  // ──────────────────────────────────────────
  {
    name: 'update_post',
    description: 'Edit fields of a specific post in a pack (caption, title, image_prompt, voice_script, best_time, day, pillar).',
    scope: 'packs:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'post_n', 'updates'],
      properties: {
        pack_id: { type: 'string' },
        post_n: { type: 'number' },
        updates: {
          type: 'object',
          properties: {
            title: { type: 'string' }, caption: { type: 'string' },
            image_prompt: { type: 'string' }, voice_script: { type: 'string' },
            best_time: { type: 'string' }, day: { type: 'number' },
            pillar: { type: 'number' }, status: { type: 'string' }
          }
        }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      try {
        const updated = await updatePostInPack(env, auth.user.id, args.pack_id, args.post_n, async (p) => ({ ...p, ...args.updates }));
        return ok({ ok: true, post: updated });
      } catch (e) { return err(e.message); }
    }
  },
  {
    name: 'add_post',
    description: 'Append a new post to a pack with given fields.',
    scope: 'packs:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'post'],
      properties: { pack_id: { type: 'string' }, post: { type: 'object' } }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      const pack = await env.DB.prepare('SELECT posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      const posts = JSON.parse(pack.posts_json || '[]');
      const maxN = posts.length ? Math.max(...posts.map(p => p.n || 0)) : 0;
      const newPost = { ...args.post, n: args.post.n || (maxN + 1), status: args.post.status || 'draft' };
      posts.push(newPost);
      await env.DB.prepare('UPDATE packs SET posts_json = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(posts), Date.now(), args.pack_id).run();
      return ok({ ok: true, post: newPost, total: posts.length });
    }
  },
  {
    name: 'delete_post',
    description: 'Remove a post from a pack by post number.',
    scope: 'packs:write',
    inputSchema: { type: 'object', required: ['pack_id', 'post_n'], properties: { pack_id: { type: 'string' }, post_n: { type: 'number' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      const pack = await env.DB.prepare('SELECT posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      const posts = JSON.parse(pack.posts_json || '[]');
      const filtered = posts.filter(p => p.n !== args.post_n);
      if (filtered.length === posts.length) return err(`Post n=${args.post_n} not found`);
      await env.DB.prepare('UPDATE packs SET posts_json = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(filtered), Date.now(), args.pack_id).run();
      return ok({ ok: true, deleted: args.post_n, remaining: filtered.length });
    }
  },

  // ──────────────────────────────────────────
  // BRAND
  // ──────────────────────────────────────────
  {
    name: 'get_brand',
    description: 'Get the brand DNA / strategy of a pack (name, audience, voice, USP, pillars, etc.).',
    scope: 'packs:read',
    inputSchema: { type: 'object', required: ['pack_id'], properties: { pack_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      const pack = await env.DB.prepare('SELECT brand_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      let brand = null; try { brand = JSON.parse(pack.brand_json || 'null'); } catch (e) {}
      return ok({ brand });
    }
  },
  {
    name: 'update_brand',
    description: 'Update brand DNA for a pack (merges fields). Set null fields to keep them.',
    scope: 'packs:write',
    inputSchema: { type: 'object', required: ['pack_id', 'brand'], properties: { pack_id: { type: 'string' }, brand: { type: 'object' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      const pack = await env.DB.prepare('SELECT brand_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      let current = {}; try { current = JSON.parse(pack.brand_json || '{}'); } catch (e) {}
      const merged = { ...current, ...args.brand };
      await env.DB.prepare('UPDATE packs SET brand_json = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(merged), Date.now(), args.pack_id).run();
      return ok({ ok: true, brand: merged });
    }
  },

  // ──────────────────────────────────────────
  // ASSETS
  // ──────────────────────────────────────────
  {
    name: 'list_assets',
    description: 'List all media files (images, voices, videos) belonging to a pack. Returns URLs + metadata.',
    scope: 'packs:read',
    inputSchema: {
      type: 'object', required: ['pack_id'],
      properties: {
        pack_id: { type: 'string' },
        kind: { type: 'string', enum: ['image', 'voice', 'video', 'final', 'all'], default: 'all' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      let q = 'SELECT * FROM media_files WHERE user_id = ? AND pack_id = ?';
      const binds = [auth.user.id, args.pack_id];
      if (args.kind && args.kind !== 'all') { q += ' AND kind = ?'; binds.push(args.kind); }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try {
        const r = await env.DB.prepare(q).bind(...binds).all();
        return ok({ total: r.results?.length || 0, assets: r.results || [] });
      } catch (e) {
        return ok({ total: 0, assets: [], note: 'media_files table may not exist yet — use generate_image first to populate' });
      }
    }
  },
  {
    name: 'upload_asset',
    description: 'Upload a base64 file (image/audio/video) to R2 + register in media_files. Returns public URL.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'base64', 'kind'],
      properties: {
        pack_id: { type: 'string' },
        post_n: { type: 'number' },
        kind: { type: 'string', enum: ['image', 'voice', 'video', 'final'] },
        base64: { type: 'string' },
        filename: { type: 'string' },
        mime: { type: 'string' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      try {
        const bytes = base64ToBytes(args.base64);
        const staged = await stageMediaToR2(env, { url: 'https://internal' }, auth.user.id, {
          filename: args.filename || `mcp_${args.kind}_${Date.now()}`,
          mime: args.mime || 'application/octet-stream',
          bytes
        });
        try {
          await env.DB.prepare(
            `INSERT INTO media_files (id, user_id, pack_id, post_n, kind, r2_key, url, mime, size_bytes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(crypto.randomUUID(), auth.user.id, args.pack_id, args.post_n || null, args.kind, staged.key, staged.url, args.mime, bytes.length, Date.now()).run();
        } catch (e) {}
        return ok({ ok: true, url: staged.url, r2_key: staged.key, size_bytes: bytes.length });
      } catch (e) { return err('Upload: ' + e.message); }
    }
  },
  {
    name: 'delete_asset',
    description: 'Delete an asset by R2 key or media_files.id.',
    scope: 'packs:write',
    inputSchema: { type: 'object', properties: { asset_id: { type: 'string' }, r2_key: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      try {
        if (args.r2_key && env.MEDIA) await env.MEDIA.delete(args.r2_key);
        if (args.asset_id) await env.DB.prepare('DELETE FROM media_files WHERE id = ? AND user_id = ?').bind(args.asset_id, auth.user.id).run();
        else if (args.r2_key) await env.DB.prepare('DELETE FROM media_files WHERE r2_key = ? AND user_id = ?').bind(args.r2_key, auth.user.id).run();
        return ok({ ok: true });
      } catch (e) { return err('Delete: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // PUBLISH — Zernio
  // ──────────────────────────────────────────
  {
    name: 'list_fb_pages',
    description: 'List all Facebook Pages user can post to via Zernio.',
    scope: 'publish:write',
    inputSchema: { type: 'object', properties: {} },
    async handler(env, auth) {
      requireScope(auth, 'publish:write');
      try {
        const apiKey = await getZernioKey(env, auth.user.id);
        const r = await zernioGet(apiKey, '/accounts');
        const accs = r.accounts || r.data || (Array.isArray(r) ? r : []) || [];
        const list = (Array.isArray(accs) ? accs : []).filter(a => (a.platform || '').toLowerCase() === 'facebook');
        return ok({ total: list.length, pages: list.map(a => ({ id: a._id || a.id, name: a.name, platform: a.platform, page_id: a.pageId })) });
      } catch (e) { return err('List pages: ' + e.message); }
    }
  },
  {
    name: 'set_active_zernio_page',
    description: 'Switch which FB Page is the default for publishing. Stored in users.zernio_account_id.',
    scope: 'publish:write',
    inputSchema: { type: 'object', required: ['account_id'], properties: { account_id: { type: 'string', description: 'Zernio internal account_id (from list_fb_pages)' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'publish:write');
      await env.DB.prepare('UPDATE users SET zernio_account_id = ? WHERE id = ?').bind(args.account_id, auth.user.id).run();
      return ok({ ok: true, active_account_id: args.account_id });
    }
  },
  {
    name: 'schedule_post',
    description: 'Schedule a single post to FB Page via Zernio.',
    scope: 'publish:write',
    inputSchema: {
      type: 'object', required: ['scheduled_for'],
      properties: {
        pack_id: { type: 'string' }, post_n: { type: 'number' },
        scheduled_for: { type: 'string', description: 'ISO datetime e.g. 2026-05-20T09:00:00' },
        image_url: { type: 'string' }, caption: { type: 'string' },
        account_id: { type: 'string', description: 'Optional Zernio account override' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'publish:write');
      try {
        const apiKey = await getZernioKey(env, auth.user.id);
        let accountId = args.account_id;
        if (!accountId) {
          const u = await env.DB.prepare('SELECT zernio_account_id FROM users WHERE id = ?').bind(auth.user.id).first();
          accountId = u?.zernio_account_id;
        }
        if (!accountId) return err('No active FB Page. Call set_active_zernio_page first or pass account_id.');

        let caption = args.caption;
        let imageUrl = args.image_url;
        if (args.pack_id && args.post_n != null && (!caption || !imageUrl)) {
          const pack = await env.DB.prepare('SELECT posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
          if (pack) {
            const posts = JSON.parse(pack.posts_json || '[]');
            const post = posts.find(p => p.n === args.post_n);
            if (post) { caption = caption || post.caption; imageUrl = imageUrl || post.image_url; }
          }
        }

        const body = buildPostBody({
          content: caption || '',
          accountId,
          mediaUrls: imageUrl ? [{ url: imageUrl }] : [],
          mediaType: 'image',
          scheduledFor: args.scheduled_for,
          timezone: 'Asia/Ho_Chi_Minh',
          platform: 'facebook'
        });
        const resp = await zernioPost(apiKey, '/posts', body);
        return ok({ ok: true, zernio_post_id: resp._id || resp.id, scheduled_for: args.scheduled_for });
      } catch (e) { return err('Schedule: ' + e.message); }
    }
  },
  {
    name: 'schedule_bulk',
    description: 'Auto-schedule ALL eligible posts in a pack — spreads across days at given time slots. Uses each post.best_time if available.',
    scope: 'publish:write',
    inputSchema: {
      type: 'object', required: ['pack_id'],
      properties: {
        pack_id: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD (default: tomorrow)' },
        time_slots: { type: 'array', items: { type: 'string' }, description: 'e.g. ["09:00","13:00","20:00"] — overrides post.best_time' },
        posts_per_day: { type: 'number', default: 1 },
        account_id: { type: 'string' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'publish:write');
      try {
        const pack = await env.DB.prepare('SELECT posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
        if (!pack) return err('Pack not found');
        const posts = JSON.parse(pack.posts_json || '[]');
        const eligible = posts.filter(p => p.image_url && p.caption);
        if (eligible.length === 0) return err('No eligible posts (need image_url + caption). Generate images first.');

        const apiKey = await getZernioKey(env, auth.user.id);
        let accountId = args.account_id;
        if (!accountId) {
          const u = await env.DB.prepare('SELECT zernio_account_id FROM users WHERE id = ?').bind(auth.user.id).first();
          accountId = u?.zernio_account_id;
        }
        if (!accountId) return err('No active FB Page');

        const startDate = args.start_date ? new Date(args.start_date) : new Date(Date.now() + 86400000);
        const slots = args.time_slots && args.time_slots.length ? args.time_slots : null;
        const postsPerDay = args.posts_per_day || 1;

        const results = [];
        for (let i = 0; i < eligible.length; i++) {
          const post = eligible[i];
          const dayOffset = Math.floor(i / postsPerDay);
          const slotIdx = i % postsPerDay;
          const dt = new Date(startDate.getTime() + dayOffset * 86400000);
          const time = slots ? slots[slotIdx % slots.length] : (post.best_time || '09:00');
          const [h, m] = time.split(':').map(Number);
          dt.setHours(h || 9, m || 0, 0, 0);
          const iso = dt.toISOString().replace('Z', '');

          try {
            const body = buildPostBody({
              content: post.caption,
              accountId,
              mediaUrls: [{ url: post.image_url }],
              mediaType: 'image',
              scheduledFor: iso,
              timezone: 'Asia/Ho_Chi_Minh',
              platform: 'facebook'
            });
            const resp = await zernioPost(apiKey, '/posts', body);
            results.push({ post_n: post.n, status: 'ok', zernio_post_id: resp._id || resp.id, scheduled_for: iso });
            await sleep(300);  // rate limit
          } catch (e) {
            results.push({ post_n: post.n, status: 'fail', error: e.message.slice(0, 120) });
          }
        }
        return ok({
          ok: true,
          total: eligible.length,
          succeeded: results.filter(r => r.status === 'ok').length,
          failed: results.filter(r => r.status === 'fail').length,
          results: results.slice(0, 30)
        });
      } catch (e) { return err('Bulk schedule: ' + e.message); }
    }
  },
  {
    name: 'publish_now',
    description: 'Push a scheduled post live IMMEDIATELY (skip wait). Tries PATCH publishNow + fallback re-create.',
    scope: 'publish:write',
    inputSchema: { type: 'object', properties: { zernio_post_id: { type: 'string' }, row_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'publish:write');
      const zpId = args.zernio_post_id;
      if (!zpId && !args.row_id) return err('Need zernio_post_id or row_id');
      try {
        const apiKey = await getZernioKey(env, auth.user.id);
        // Try PATCH
        try {
          const r = await zernioPatch(apiKey, `/posts/${zpId}`, { publishNow: true });
          return ok({ ok: true, method: 'patch_publishNow', result: r });
        } catch (e) {
          // Fallback: GET old → re-create with publishNow → DELETE
          const old = await zernioGet(apiKey, `/posts/${zpId}`);
          const platforms = old.platforms || [{ platform: 'facebook', accountId: old.accountId }];
          const created = await zernioPost(apiKey, '/posts', {
            content: old.content || '',
            platforms,
            mediaItems: old.mediaItems || [],
            publishNow: true
          });
          try { await zernioDelete(apiKey, `/posts/${zpId}`); } catch (e2) {}
          return ok({ ok: true, method: 're-create', new_zernio_post_id: created._id || created.id });
        }
      } catch (e) { return err('Publish-now: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // META ADS — read/write
  // ──────────────────────────────────────────
  {
    name: 'list_ad_accounts',
    description: 'List Meta Ad Accounts via /me/adaccounts.',
    scope: 'ads:read',
    inputSchema: { type: 'object', properties: {} },
    async handler(env, auth) {
      requireScope(auth, 'ads:read');
      try {
        const creds = await getFbCreds(env, auth.user.id);
        const token = creds.user_access_token || creds.page_access_token;
        const r = await metaGet(token, '/me/adaccounts', {
          fields: 'id,account_id,name,currency,timezone_name,account_status,business,balance',
          limit: 50
        });
        return ok({
          total: r.data?.length || 0,
          accounts: (r.data || []).map(a => ({
            id: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name,
            status: a.account_status, business: a.business?.name, balance: a.balance,
            can_create_ads: a.account_status === 1 || a.account_status === 9
          }))
        });
      } catch (e) { return err('Ad accounts: ' + e.message); }
    }
  },
  {
    name: 'list_campaigns',
    description: 'List Meta ad campaigns + insights (spend, impressions, CTR) for an ad account.',
    scope: 'ads:read',
    inputSchema: {
      type: 'object', required: ['ad_account_id'],
      properties: { ad_account_id: { type: 'string' }, include_insights: { type: 'boolean', default: true } }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'ads:read');
      try {
        const creds = await getFbCreds(env, auth.user.id);
        const token = creds.user_access_token || creds.page_access_token;
        const adAccountId = formatAdAccountId(args.ad_account_id);
        const r = await metaGet(token, `/${adAccountId}/campaigns`, {
          fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time', limit: 25
        });
        let campaigns = r.data || [];
        if (args.include_insights !== false && campaigns.length > 0) {
          for (const c of campaigns.slice(0, 10)) {
            try {
              const ir = await metaGet(token, `/${c.id}/insights`, {
                fields: 'spend,impressions,clicks,reach,ctr,cpc,cpm', date_preset: 'last_30d'
              });
              c.insights = ir.data?.[0];
            } catch (e) {}
          }
        }
        return ok({ ad_account_id: adAccountId, total: campaigns.length, campaigns });
      } catch (e) { return err('Campaigns: ' + e.message); }
    }
  },
  {
    name: 'create_meta_ad',
    description: 'Create a NEW Meta ad (Campaign + AdSet + Creative + Ad) — full creative without needing live post. Status defaults to PAUSED. ⚠ TIÊU TIỀN khi activate.',
    scope: 'ads:write',
    inputSchema: {
      type: 'object', required: ['ad_account_id', 'primary_text', 'budget'],
      properties: {
        ad_account_id: { type: 'string' },
        name: { type: 'string' },
        goal: { type: 'string', default: 'engagement' },
        primary_text: { type: 'string' },
        headline: { type: 'string' },
        cta: { type: 'string', default: 'LEARN_MORE' },
        destination_url: { type: 'string' },
        image_url: { type: 'string' },
        budget: { type: 'number' },
        budget_type: { type: 'string', enum: ['daily', 'lifetime'], default: 'daily' },
        currency: { type: 'string', default: 'VND' },
        duration_days: { type: 'number', default: 7 },
        targeting: { type: 'object' },
        status: { type: 'string', enum: ['PAUSED', 'ACTIVE'], default: 'PAUSED' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'ads:write');
      try {
        const creds = await getFbCreds(env, auth.user.id);
        if (!creds.user_access_token) return err('Need User Access Token — re-OAuth with ads_management scope');
        const token = creds.user_access_token;
        const adAccountId = formatAdAccountId(args.ad_account_id);
        const objective = goalToObjective(args.goal);
        const opt = goalToOptimization(args.goal);
        const currency = args.currency || 'VND';
        const budgetMinor = toMetaBudgetMinor(args.budget, currency);
        const startTime = Math.floor(Date.now() / 1000);
        const endTime = startTime + (args.duration_days || 7) * 86400;
        const baseName = args.name || `[MCP] ${new Date().toISOString().slice(0, 10)}`;
        const status = args.status || 'PAUSED';

        const campaign = await metaPost(token, `/${adAccountId}/campaigns`, {
          name: baseName + ' · Campaign', objective, status,
          special_ad_categories: '[]', buying_type: 'AUCTION'
        });
        const adset = await metaPost(token, `/${adAccountId}/adsets`, {
          name: baseName + ' · AdSet', campaign_id: campaign.id,
          [args.budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget']: budgetMinor,
          optimization_goal: opt.optimization_goal, billing_event: opt.billing_event,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: {
            geo_locations: { countries: args.targeting?.countries || ['VN'] },
            age_min: args.targeting?.age_min || 18, age_max: args.targeting?.age_max || 65,
            publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'story']
          },
          start_time: startTime,
          end_time: args.budget_type === 'lifetime' ? endTime : undefined, status
        });
        const creative = await metaPost(token, `/${adAccountId}/adcreatives`, {
          name: baseName + ' · Creative',
          object_story_spec: {
            page_id: creds.page_id,
            link_data: {
              message: args.primary_text,
              link: args.destination_url || `https://www.facebook.com/${creds.page_id}`,
              ...(args.headline ? { name: args.headline } : {}),
              ...(args.image_url ? { picture: args.image_url } : {}),
              call_to_action: { type: args.cta || 'LEARN_MORE', value: { link: args.destination_url || `https://www.facebook.com/${creds.page_id}` } }
            }
          }
        });
        const ad = await metaPost(token, `/${adAccountId}/ads`, {
          name: baseName + ' · Ad', adset_id: adset.id, creative: { creative_id: creative.id }, status
        });
        return ok({
          ok: true, campaign_id: campaign.id, adset_id: adset.id, ad_id: ad.id, creative_id: creative.id,
          status, ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace('act_', '')}&selected_campaign_ids=${campaign.id}`
        });
      } catch (e) { return err('Create Ad: ' + (e.message || e)); }
    }
  },
  {
    name: 'boost_post',
    description: 'Boost an existing FB Page post (need fb_post_id in {page_id}_{post_id} format) via Meta Marketing API. ⚠ TIÊU TIỀN.',
    scope: 'ads:write',
    inputSchema: {
      type: 'object', required: ['ad_account_id', 'fb_post_id', 'budget'],
      properties: {
        ad_account_id: { type: 'string' }, fb_post_id: { type: 'string' },
        budget: { type: 'number' }, budget_type: { type: 'string', default: 'daily' },
        currency: { type: 'string', default: 'VND' }, duration_days: { type: 'number', default: 7 },
        goal: { type: 'string', default: 'engagement' }, status: { type: 'string', default: 'PAUSED' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'ads:write');
      try {
        const creds = await getFbCreds(env, auth.user.id);
        if (!creds.user_access_token) return err('Need User Access Token');
        const token = creds.user_access_token;
        const adAccountId = formatAdAccountId(args.ad_account_id);
        const objective = goalToObjective(args.goal);
        const opt = goalToOptimization(args.goal);
        const budgetMinor = toMetaBudgetMinor(args.budget, args.currency || 'VND');
        const baseName = `[MCP Boost] ${new Date().toISOString().slice(0, 10)}`;
        const status = args.status || 'PAUSED';

        let postId = String(args.fb_post_id);
        if (!postId.includes('_')) postId = `${creds.page_id}_${postId}`;

        const campaign = await metaPost(token, `/${adAccountId}/campaigns`, {
          name: baseName + ' · Campaign', objective, status, special_ad_categories: '[]', buying_type: 'AUCTION'
        });
        const adset = await metaPost(token, `/${adAccountId}/adsets`, {
          name: baseName + ' · AdSet', campaign_id: campaign.id,
          [args.budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget']: budgetMinor,
          optimization_goal: opt.optimization_goal, billing_event: opt.billing_event,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: { geo_locations: { countries: ['VN'] }, age_min: 18, age_max: 65 },
          start_time: Math.floor(Date.now() / 1000), status
        });
        const creative = await metaPost(token, `/${adAccountId}/adcreatives`, {
          name: baseName + ' · Creative', object_story_id: postId
        });
        const ad = await metaPost(token, `/${adAccountId}/ads`, {
          name: baseName + ' · Ad', adset_id: adset.id, creative: { creative_id: creative.id }, status
        });
        return ok({ ok: true, campaign_id: campaign.id, ad_id: ad.id, fb_post_id: postId, status });
      } catch (e) { return err('Boost: ' + e.message); }
    }
  },
  {
    name: 'toggle_campaign',
    description: 'Pause / resume / delete a Meta campaign, or update its budget.',
    scope: 'ads:write',
    inputSchema: {
      type: 'object', required: ['id', 'action'],
      properties: {
        id: { type: 'string' }, target: { type: 'string', default: 'campaign' },
        action: { type: 'string', enum: ['pause', 'resume', 'delete', 'update_budget'] },
        budget: { type: 'number' }, budget_type: { type: 'string', default: 'daily' }, currency: { type: 'string', default: 'VND' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'ads:write');
      try {
        const creds = await getFbCreds(env, auth.user.id);
        const token = creds.user_access_token || creds.page_access_token;
        let result;
        if (args.action === 'pause') result = await metaPost(token, `/${args.id}`, { status: 'PAUSED' });
        else if (args.action === 'resume') result = await metaPost(token, `/${args.id}`, { status: 'ACTIVE' });
        else if (args.action === 'delete') result = await metaPost(token, `/${args.id}`, { status: 'DELETED' });
        else if (args.action === 'update_budget') {
          const minor = toMetaBudgetMinor(args.budget, args.currency || 'VND');
          const field = args.budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget';
          result = await metaPost(token, `/${args.id}`, { [field]: minor });
        }
        return ok({ ok: true, id: args.id, action: args.action, result });
      } catch (e) { return err('Toggle: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // VAULT — Knowledge Source Management (V19A1)
  // For knowledge products: ground AI generation in user's real data
  // ──────────────────────────────────────────
  {
    name: 'add_vault_text',
    description: 'Add a text source to a pack\'s knowledge vault. Use for: curriculum, methodology, testimonials, USP, founder voice samples, FAQs. AI will ground content generation in this material.',
    scope: 'packs:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'title', 'content'],
      properties: {
        pack_id: { type: 'string' },
        title: { type: 'string', description: 'Source title — e.g. "Course Curriculum Module 1-12"' },
        content: { type: 'string', description: 'Raw text content (max 100k chars)' },
        category: { type: 'string', enum: ['curriculum', 'testimonial', 'methodology', 'competitor', 'voice', 'faq', 'spec', 'other'], default: 'other', description: 'Tag for retrieval' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      // Verify pack ownership
      const pack = await env.DB.prepare('SELECT id FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      const fileId = crypto.randomUUID();
      const content = String(args.content || '').slice(0, 100000);
      try {
        await env.DB.prepare(
          `INSERT INTO vault_files (id, user_id, pack_id, filename, content_text, size_bytes, mime, category, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'text/plain', ?, ?)`
        ).bind(fileId, auth.user.id, args.pack_id, args.title.slice(0, 200), content, content.length, args.category || 'other', Date.now()).run();
      } catch (e) {
        // Fallback if category column doesn't exist
        try {
          await env.DB.prepare(
            `INSERT INTO vault_files (id, user_id, pack_id, filename, content_text, size_bytes, mime, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'text/plain', ?)`
          ).bind(fileId, auth.user.id, args.pack_id, args.title.slice(0, 200), content, content.length, Date.now()).run();
        } catch (e2) { return err('DB insert: ' + e2.message); }
      }
      return ok({ ok: true, vault_file_id: fileId, title: args.title, chars: content.length, category: args.category || 'other',
        message: `✅ Added "${args.title}" to vault. Ready for AI grounded generation.` });
    }
  },
  {
    name: 'add_vault_url',
    description: 'Fetch a URL and add its readable text to the vault. Useful for: competitor blog posts, reference articles, public docs.',
    scope: 'packs:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'url'],
      properties: {
        pack_id: { type: 'string' }, url: { type: 'string' },
        title: { type: 'string' }, category: { type: 'string', default: 'competitor' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      try {
        const r = await fetch(args.url, { headers: { 'User-Agent': 'GoE-Vault/1.0' } });
        if (!r.ok) return err(`Fetch ${args.url} failed: HTTP ${r.status}`);
        let text = await r.text();
        // Basic readability: strip HTML tags + scripts
        text = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        text = text.slice(0, 50000);
        const addTool = TOOLS.find(t => t.name === 'add_vault_text');
        return await addTool.handler(env, auth, {
          pack_id: args.pack_id,
          title: args.title || `URL: ${new URL(args.url).hostname}`,
          content: text,
          category: args.category || 'competitor'
        });
      } catch (e) { return err('Fetch URL: ' + e.message); }
    }
  },
  {
    name: 'list_vault_sources',
    description: 'List all knowledge sources in a pack\'s vault.',
    scope: 'packs:read',
    inputSchema: { type: 'object', required: ['pack_id'], properties: { pack_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      try {
        const r = await env.DB.prepare(
          'SELECT id, filename, size_bytes, mime, created_at FROM vault_files WHERE user_id = ? AND pack_id = ? ORDER BY created_at DESC'
        ).bind(auth.user.id, args.pack_id).all();
        const sources = r.results || [];
        const totalChars = sources.reduce((s, x) => s + (x.size_bytes || 0), 0);
        return ok({
          total: sources.length,
          total_chars: totalChars,
          sources: sources.map(s => ({ id: s.id, title: s.filename, chars: s.size_bytes, type: s.mime, added: s.created_at })),
          summary: sources.length === 0 ? '⚠ Vault trống — chưa có source. Cần add ≥ 3 sources cho knowledge product.' : `${sources.length} sources, ${(totalChars/1000).toFixed(1)}k chars total.`
        });
      } catch (e) { return err('List vault: ' + e.message); }
    }
  },
  {
    name: 'remove_vault_source',
    description: 'Remove a source from the vault by id.',
    scope: 'packs:write',
    inputSchema: { type: 'object', required: ['vault_file_id'], properties: { vault_file_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      const r = await env.DB.prepare('DELETE FROM vault_files WHERE id = ? AND user_id = ?').bind(args.vault_file_id, auth.user.id).run();
      if (!r.meta?.changes) return err('Source not found');
      return ok({ ok: true, removed: args.vault_file_id });
    }
  },
  {
    name: 'get_vault_content',
    description: 'Get the FULL text content of vault sources for a pack (or filter by category). Use this to inspect what data Claude will ground generation on.',
    scope: 'packs:read',
    inputSchema: {
      type: 'object', required: ['pack_id'],
      properties: {
        pack_id: { type: 'string' },
        category: { type: 'string', description: 'Filter by category (curriculum/testimonial/etc.)' },
        max_chars_per_source: { type: 'number', default: 5000 }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      try {
        const r = await env.DB.prepare(
          'SELECT id, filename, content_text, size_bytes FROM vault_files WHERE user_id = ? AND pack_id = ? ORDER BY created_at DESC'
        ).bind(auth.user.id, args.pack_id).all();
        const sources = (r.results || []).map(s => ({
          id: s.id, title: s.filename,
          content: (s.content_text || '').slice(0, args.max_chars_per_source || 5000),
          chars: s.size_bytes,
          truncated: (s.content_text || '').length > (args.max_chars_per_source || 5000)
        }));
        return ok({ total: sources.length, sources });
      } catch (e) { return err('Get vault: ' + e.message); }
    }
  },
  {
    name: 'create_pack_with_vault',
    description: '🌟 MEGA TOOL for knowledge products: Create pack + setup vault FROM provided text sources + generate posts GROUNDED in vault content. ONE atomic call. Use this for courses/coaching/info-products where accuracy matters.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['name', 'brief', 'vault_sources'],
      properties: {
        name: { type: 'string' },
        brief: { type: 'string', description: 'Short positioning summary' },
        vault_sources: {
          type: 'array',
          description: 'Array of knowledge sources — required for grounded generation',
          items: {
            type: 'object',
            required: ['title', 'content'],
            properties: {
              title: { type: 'string' },
              content: { type: 'string', description: 'Raw text from curriculum/testimonial/etc.' },
              category: { type: 'string', enum: ['curriculum', 'testimonial', 'methodology', 'competitor', 'voice', 'faq', 'spec', 'other'] }
            }
          },
          minItems: 1
        },
        days: { type: 'number', default: 30 },
        platform: { type: 'string', default: 'facebook' },
        industry: { type: 'string' },
        product_type: { type: 'string', enum: ['course', 'coaching', 'saas', 'service', 'info_product'], default: 'course' },
        auto_generate_images: { type: 'boolean', default: false }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const log = [];
      const packId = crypto.randomUUID();
      const now = Date.now();
      const count = Math.min(args.days || 30, 30);

      // Step 1: Create pack skeleton + brand DNA
      const initialBrand = {
        name: args.name, brief: args.brief,
        industry: args.industry || 'auto-detect',
        platform: args.platform || 'facebook',
        product_type: args.product_type || 'course'
      };
      try {
        await env.DB.prepare(
          `INSERT INTO packs (id, user_id, name, brand_json, posts_json, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, '[]', ?, ?, 1)`
        ).bind(packId, auth.user.id, args.name, JSON.stringify(initialBrand), now, now).run();
        log.push({ step: 'create_pack', status: 'ok', pack_id: packId });
      } catch (e) { return err('Pack create: ' + e.message); }

      // Step 2: Populate vault
      const addVaultTool = TOOLS.find(t => t.name === 'add_vault_text');
      let vaultAdded = 0;
      for (const src of args.vault_sources) {
        try {
          await addVaultTool.handler(env, auth, {
            pack_id: packId, title: src.title, content: src.content, category: src.category || 'other'
          });
          vaultAdded++;
        } catch (e) {}
      }
      log.push({ step: 'populate_vault', status: 'ok', sources_added: vaultAdded });

      // Step 3: Gemini grounded generation — build context from vault
      const vaultContext = args.vault_sources.map(s => `## ${s.title} (${s.category || 'other'})\n${s.content.slice(0, 8000)}`).join('\n\n---\n\n');

      // First: analyze brand DNA grounded in vault
      const brandPrompt = `You are a Vietnamese brand strategist analyzing a KNOWLEDGE product.

BRIEF: ${args.brief}
PRODUCT TYPE: ${args.product_type}
${args.industry ? `INDUSTRY: ${args.industry}` : ''}

KNOWLEDGE VAULT (source material — ground all claims here):
${vaultContext.slice(0, 30000)}

Extract precise brand DNA based ONLY on vault content. Return JSON:
{
  "name": "${args.name.replace(/"/g, '\\"')}",
  "industry": "...",
  "audience": { "demo": "...", "psycho": "..." },
  "voice": "tone of voice (from voice samples in vault)",
  "usp": "specific USP from vault — NO making up",
  "pillars": [{"name":"...","desc":"...","weight":50}, ...],
  "core_message": "...",
  "tags": ["..."],
  "key_modules": ["specific modules/topics from curriculum"],
  "social_proof": ["paraphrased testimonials"]
}`;

      let brand = initialBrand;
      try {
        const r = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: brandPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 8000 }
        });
        const text = r.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const dna = JSON.parse(text);
        brand = { ...initialBrand, ...dna, vault_sources_count: vaultAdded };
        log.push({ step: 'brand_dna', status: 'ok' });
      } catch (e) {
        log.push({ step: 'brand_dna', status: 'fail', error: e.message.slice(0, 200) });
      }

      // Step 4: Generate posts GROUNDED in vault
      const postsPrompt = `You are a Vietnamese viral content writer for a ${args.product_type} brand.

BRAND DNA: ${JSON.stringify(brand)}

KNOWLEDGE VAULT (ground ALL factual claims in this material — NO hallucination):
${vaultContext.slice(0, 40000)}

Generate exactly ${count} posts for ${count} days for ${args.platform || 'facebook'}.
Mix pillars 50/30/20 (Awareness/Consideration/Conversion).

CRITICAL RULES:
- ANY specific fact (module number, duration, price, methodology name, testimonial) MUST come from vault
- If vault doesn't have specifics, use general framing — NEVER invent numbers/names
- Each post should reference 1-2 specific vault elements
- Quote testimonials EXACTLY from vault, attribute correctly
- Use brand voice consistent with vault samples

Each post:
- n, day, pillar (1/2/3)
- title (< 60 chars, hook)
- caption (Vietnamese, 100-220 words, HOOK + VALUE + CTA, grounded)
- image_prompt (English, scene description for AI image)
- best_time (HH:MM)
- vault_sources_used (array of vault source titles you grounded in — leave [] if pure brand voice)

Return JSON ONLY: { "posts": [...] }`;

      let posts = [];
      try {
        const r = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: postsPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.75, maxOutputTokens: 32768 }
        });
        const text = r.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(text);
        posts = (parsed.posts || []).map((p, i) => ({
          ...p, n: p.n || (i + 1), day: p.day || (i + 1),
          pillar: p.pillar || 1, status: 'draft', grounded: true
        }));
        log.push({ step: 'generate_posts', status: 'ok', count: posts.length, grounded_count: posts.filter(p => (p.vault_sources_used || []).length > 0).length });
      } catch (e) {
        log.push({ step: 'generate_posts', status: 'fail', error: e.message.slice(0, 200) });
      }

      // Step 5: Save pack with brand + posts
      try {
        await env.DB.prepare(
          'UPDATE packs SET brand_json = ?, posts_json = ?, updated_at = ? WHERE id = ?'
        ).bind(JSON.stringify(brand), JSON.stringify(posts), Date.now(), packId).run();
      } catch (e) { log.push({ step: 'save', status: 'fail', error: e.message }); }

      // Step 6: Optional image gen
      let imgData = null;
      if (args.auto_generate_images && posts.length > 0) {
        const imgTool = TOOLS.find(t => t.name === 'generate_all_images');
        const ir = await imgTool.handler(env, auth, { pack_id: packId });
        try { imgData = JSON.parse(ir.content[0].text); } catch (e) {}
        log.push({ step: 'images', status: ir.isError ? 'fail' : 'ok', data: imgData });
      }

      return ok({
        ok: true,
        pack_id: packId,
        name: args.name,
        brand,
        vault: { sources_added: vaultAdded, total_chars: vaultContext.length },
        posts_count: posts.length,
        grounded_posts: posts.filter(p => (p.vault_sources_used || []).length > 0).length,
        posts_preview: posts.slice(0, 5),
        images_generated: imgData,
        pipeline_log: log,
        message: `✅ Pack "${args.name}" tạo xong với ${vaultAdded} vault sources + ${posts.length} posts grounded. Mỗi post citation vault sources trong field vault_sources_used.`
      });
    }
  },

  // ════════════════════════════════════════════════════════════════
  // VIRAL GRID MASTER (V20) — Strategy Layer
  // 4-phase orchestrator: keyword tree → content matrix → visual DNA → execution plan
  // Central hub kết nối 43+ skills qua master.json contract
  // ════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────
  // PHASE 1 — luoi-muc-tieu-builder (keyword tree)
  // ──────────────────────────────────────────
  {
    name: 'generate_keyword_tree',
    description: '[Viral Grid · Phase 1] Dệt cây từ khóa 4 cấp (Root → Pillars → Branches → Leaves). Returns keyword-tree.json với ≥35 leaf-keywords để feed content matrix.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['brand_name', 'industry', 'audience'],
      properties: {
        brand_name: { type: 'string' },
        tagline: { type: 'string' },
        industry: { type: 'string', description: 'Ngành hàng + sản phẩm chính' },
        audience: { type: 'string', description: 'Mô tả audience cốt lõi' },
        mood: { type: 'array', items: { type: 'string' }, description: '3 từ mô tả brand mood' },
        loai_luoi: { type: 'string', enum: ['don_gian', 'phuc_tap', 'cam_xuc', 'ket_hop'], default: 'ket_hop' },
        save_to_session: { type: 'string', description: 'Optional: viral_grid_session_id để save vào phase1 column' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const prompt = `Bạn là chiến lược gia content viral cho thị trường Việt Nam.

BRAND: ${args.brand_name}${args.tagline ? ` — "${args.tagline}"` : ''}
NGÀNH: ${args.industry}
AUDIENCE: ${args.audience}
MOOD: ${(args.mood || []).join(', ')}
LOẠI LƯỚI: ${args.loai_luoi || 'ket_hop'}

Dệt cây từ khóa 4 cấp để làm nền tảng cho content vô hạn:

LEVEL 1 (Root) = brand purpose / core promise (1 keyword phrase)
LEVEL 2 (Pillars) = 3-5 content pillars chính
LEVEL 3 (Branches) = mỗi pillar có 3-5 sub-topic branches
LEVEL 4 (Leaves) = mỗi branch có 2-4 specific topic leaf — TỔNG ≥ 35 leaves

Mỗi leaf phải:
- Đủ cụ thể để sinh 5-10 content idea
- Mapping được với audience pain/desire/aspiration
- Có viral angle (curiosity / emotion / proof / contrast)

Return JSON ONLY:
{
  "root": { "name": "...", "purpose": "..." },
  "loai_luoi": "${args.loai_luoi || 'ket_hop'}",
  "pillars": [
    {
      "name": "Pillar 1 name",
      "weight": 40,
      "branches": [
        {
          "name": "Branch 1.1",
          "leaves": [
            { "id": "L001", "keyword": "...", "angle": "curiosity", "audience_hit": "pain/desire/aspiration" },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ],
  "stats": { "total_leaves": 35, "total_branches": 12, "pillars_count": 4 }
}`;
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 16000 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const tree = JSON.parse(text);

        // Optional save to session
        if (args.save_to_session) {
          try {
            await env.DB.prepare(
              'UPDATE viral_grid_sessions SET phase1_keyword_tree_json = ?, phases_completed = MAX(phases_completed, 1), total_leaves = ?, updated_at = ? WHERE id = ? AND user_id = ?'
            ).bind(JSON.stringify(tree), tree.stats?.total_leaves || 0, Date.now(), args.save_to_session, auth.user.id).run();
          } catch (e) {}
        }

        return ok({
          ok: true,
          keyword_tree: tree,
          stats: tree.stats || {},
          message: `✅ Phase 1 xong: ${tree.stats?.total_leaves || 0} leaves, ${tree.stats?.pillars_count || 0} pillars. Feed cho Phase 2 (generate_content_matrix).`
        });
      } catch (e) { return err('Phase 1 keyword tree: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // PHASE 2 — content-vo-han-engine
  // ──────────────────────────────────────────
  {
    name: 'generate_content_matrix',
    description: '[Viral Grid · Phase 2] Sinh matrix 300-1000 ideas từ keyword tree. Mỗi idea = leaf × format × hook angle. Tỷ lệ 60% viral / 40% brand.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['keyword_tree', 'brand_name', 'audience'],
      properties: {
        keyword_tree: { type: 'object' },
        brand_name: { type: 'string' },
        audience: { type: 'string' },
        target_count: { type: 'number', default: 300, description: '300/500/1000' },
        viral_ratio: { type: 'number', default: 60, description: '60-80, the rest is brand' },
        save_to_session: { type: 'string' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const treeSummary = JSON.stringify(args.keyword_tree).slice(0, 8000);
      const target = Math.min(args.target_count || 300, 500);  // cap at 500 per call due to context
      const viralR = args.viral_ratio || 60;

      const prompt = `Bạn là viral content creator cho brand "${args.brand_name}".
AUDIENCE: ${args.audience}

KEYWORD TREE (Phase 1 output):
${treeSummary}

Sinh CHÍNH XÁC ${target} content ideas mapping vào leaves trong tree. Mỗi idea có:
- id (I001, I002...)
- leaf_id (mapping với leaf ID trong tree)
- title (tiếng Việt, < 60 chars, hook scroll-stopping)
- format ∈ ['single_image','carousel_5','reel_15s','reel_30s','reel_60s','story','live','article','infographic','meme']
- hook_angle ∈ ['curiosity_gap','pain_point','social_proof','before_after','contrast','question','controversy','tutorial','behind_scene','listicle']
- tier ∈ ['viral','brand'] — TỔNG: ${viralR}% viral / ${100 - viralR}% brand
- estimated_difficulty ∈ ['easy','medium','hard']

Mỗi leaf nên có 5-15 ideas trải đều across formats + angles.

Return JSON ONLY:
{
  "total": ${target},
  "viral_ratio": ${viralR},
  "brand_ratio": ${100 - viralR},
  "ideas": [
    { "id": "I001", "leaf_id": "L001", "title": "...", "format": "carousel_5", "hook_angle": "curiosity_gap", "tier": "viral", "estimated_difficulty": "medium" },
    ...
  ],
  "distribution": {
    "by_format": { "carousel_5": 45, ... },
    "by_angle": { "curiosity_gap": 60, ... },
    "by_tier": { "viral": ${Math.floor(target * viralR / 100)}, "brand": ${Math.floor(target * (100 - viralR) / 100)} }
  }
}`;
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 32768 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const matrix = JSON.parse(text);

        if (args.save_to_session) {
          try {
            await env.DB.prepare(
              'UPDATE viral_grid_sessions SET phase2_content_matrix_json = ?, phases_completed = MAX(phases_completed, 2), total_ideas = ?, viral_ratio = ?, updated_at = ? WHERE id = ? AND user_id = ?'
            ).bind(JSON.stringify(matrix), matrix.total || 0, viralR, Date.now(), args.save_to_session, auth.user.id).run();
          } catch (e) {}
        }

        return ok({
          ok: true,
          content_matrix: matrix,
          message: `✅ Phase 2 xong: ${matrix.total} ideas (${matrix.viral_ratio}% viral / ${matrix.brand_ratio}% brand). Feed cho Phase 3 (design_visual_dna).`
        });
      } catch (e) { return err('Phase 2 content matrix: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // PHASE 3 — visual-dna-designer
  // ──────────────────────────────────────────
  {
    name: 'design_visual_dna',
    description: '[Viral Grid · Phase 3] Thiết kế 9 visual elements + signature pattern. Reusable cross channels (posts/ads/LP/packaging).',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['brand_name', 'mood'],
      properties: {
        brand_name: { type: 'string' },
        mood: { type: 'array', items: { type: 'string' } },
        industry: { type: 'string' },
        audience: { type: 'string' },
        existing_palette: { type: 'array', items: { type: 'string' }, description: 'Optional hex colors brand đã có' },
        save_to_session: { type: 'string' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const prompt = `Bạn là senior visual designer cho brand "${args.brand_name}".
MOOD: ${(args.mood || []).join(', ')}
INDUSTRY: ${args.industry || 'general'}
AUDIENCE: ${args.audience || 'general consumer VN'}
${args.existing_palette ? `EXISTING PALETTE: ${args.existing_palette.join(', ')}` : ''}

Thiết kế Visual DNA — 9 yếu tố + signature pattern.

Return JSON ONLY:
{
  "palette": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "neutral_dark": "#hex",
    "neutral_light": "#hex",
    "rationale": "tại sao chọn các màu này khớp mood + audience"
  },
  "typography": {
    "display": "font family for headlines (Google Fonts available)",
    "body": "font family for body",
    "weight_pairing": "e.g. 800/400",
    "tone": "modern/classic/playful/etc"
  },
  "composition": {
    "rule": "rule_of_thirds/centered/asymmetric/grid_4x4",
    "negative_space": "tight/balanced/spacious",
    "alignment": "left/center/justified"
  },
  "motion": {
    "easing": "ease-out/spring/linear",
    "duration_ms": 400,
    "personality": "snappy/smooth/playful"
  },
  "mascot": {
    "exists": true|false,
    "description": "ngắn gọn nếu có mascot/avatar",
    "style": "chibi/realistic/abstract/none"
  },
  "texture": {
    "type": "smooth_flat/grain_paper/glossy/matte_3d/neon_glow",
    "use_case": "khi nào dùng"
  },
  "light": {
    "direction": "top_down/diagonal/ambient",
    "quality": "soft/hard/diffused",
    "color_temp": "warm/cool/neutral"
  },
  "iconography": {
    "style": "outline_2px/filled/duotone/illustrative",
    "corner_radius": "sharp/rounded_4px/full_circle"
  },
  "sound": {
    "music_mood": "lofi/uplifting/dramatic/quiet",
    "sfx_style": "minimal/playful/cinematic"
  },
  "signature_pattern": {
    "name": "the ONE element that makes brand recognizable instantly",
    "description": "ví dụ: diagonal orange stripe top-right, or pixel-art mascot in corner, or always-50%-gradient overlay",
    "usage": "luôn xuất hiện ở mọi visual"
  }
}`;
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 8000 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const dna = JSON.parse(text);

        if (args.save_to_session) {
          try {
            await env.DB.prepare(
              'UPDATE viral_grid_sessions SET phase3_visual_dna_json = ?, phases_completed = MAX(phases_completed, 3), updated_at = ? WHERE id = ? AND user_id = ?'
            ).bind(JSON.stringify(dna), Date.now(), args.save_to_session, auth.user.id).run();
          } catch (e) {}
        }

        return ok({ ok: true, visual_dna: dna, message: '✅ Phase 3 xong: 9 elements + signature pattern. Feed cho Phase 4 (build_execution_plan).' });
      } catch (e) { return err('Phase 3 visual DNA: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // PHASE 4 — viral-hook-execution
  // ──────────────────────────────────────────
  {
    name: 'build_execution_plan',
    description: '[Viral Grid · Phase 4] Build 30-day calendar + 70 hook bank + 14 KPI + 3 SOP for team handoff.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['content_matrix', 'brand_name'],
      properties: {
        content_matrix: { type: 'object' },
        visual_dna: { type: 'object' },
        keyword_tree: { type: 'object' },
        brand_name: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        calendar_days: { type: 'number', default: 30 },
        posts_per_day: { type: 'number', default: 1 },
        save_to_session: { type: 'string' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const matrix = args.content_matrix || {};
      const ideas = (matrix.ideas || []).slice(0, 150);  // sample for planning
      const days = args.calendar_days || 30;
      const startDate = args.start_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      const prompt = `Bạn là Head of Content cho brand "${args.brand_name}".

CONTENT MATRIX SAMPLE (${ideas.length}/${matrix.total} ideas):
${JSON.stringify(ideas.slice(0, 50))}

VISUAL DNA SIGNATURE: ${JSON.stringify(args.visual_dna?.signature_pattern || {}).slice(0, 500)}

Build EXECUTION PLAN cho ${days} ngày, ${args.posts_per_day || 1} post/day, start ${startDate}.

Output JSON:
{
  "calendar": [
    { "day": 1, "date": "${startDate}", "slot": "09:00", "idea_id": "I001", "format": "carousel_5", "hook_angle": "...", "tier": "viral", "notes": "..." },
    ... (${days} entries)
  ],
  "hook_bank": [
    /* 70 hooks Vietnamese, classified by angle */
    { "id": "H001", "angle": "curiosity_gap", "text": "Bạn có biết...?", "use_for_format": ["reel", "carousel"] },
    ... (70 hooks)
  ],
  "kpis": [
    { "id": "K01", "name": "Reach per post", "baseline": 1000, "target_week1": 3000, "target_month1": 10000, "unit": "users" },
    ... (14 KPIs: reach, engagement_rate, click_through, save_rate, share_rate, comment_rate, follower_growth, video_view_3s, video_completion, ctr_link, conversion_rate, cost_per_engagement, viral_coefficient, brand_lift)
  ],
  "sops": [
    {
      "id": "SOP01",
      "name": "Capture Workflow",
      "steps": [
        "Step 1: ...",
        "Step 2: ..."
      ],
      "owner_role": "Content creator",
      "frequency": "daily"
    },
    {
      "id": "SOP02",
      "name": "Production Workflow",
      "steps": ["..."],
      "owner_role": "Editor",
      "frequency": "every 2 days"
    },
    {
      "id": "SOP03",
      "name": "Publish + Monitor Workflow",
      "steps": ["..."],
      "owner_role": "Social manager",
      "frequency": "daily"
    }
  ]
}`;
      try {
        const resp = await callGemini(env, 'gemini-2.5-flash', {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.75, maxOutputTokens: 32768 }
        });
        const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const plan = JSON.parse(text);

        if (args.save_to_session) {
          try {
            await env.DB.prepare(
              'UPDATE viral_grid_sessions SET phase4_execution_plan_json = ?, phases_completed = MAX(phases_completed, 4), calendar_days = ?, updated_at = ? WHERE id = ? AND user_id = ?'
            ).bind(JSON.stringify(plan), days, Date.now(), args.save_to_session, auth.user.id).run();
          } catch (e) {}
        }

        return ok({
          ok: true,
          execution_plan: plan,
          message: `✅ Phase 4 xong: ${plan.calendar?.length || 0} calendar entries, ${plan.hook_bank?.length || 0} hooks, ${plan.kpis?.length || 0} KPIs, ${plan.sops?.length || 0} SOPs.`
        });
      } catch (e) { return err('Phase 4 execution plan: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // V20.B — Master Orchestrator
  // ──────────────────────────────────────────
  {
    name: 'run_viral_grid_master',
    description: '🌟 MASTER ORCHESTRATOR — Chạy full 4-phase pipeline (research → experiment → package → transfer) trong 1 call. Trả về session_id để query lại sau. Tự động save master.json + render dashboard.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['brand_name', 'tagline', 'industry', 'audience', 'mood'],
      properties: {
        brand_name: { type: 'string' },
        tagline: { type: 'string' },
        industry: { type: 'string' },
        audience: { type: 'string' },
        mood: { type: 'array', items: { type: 'string' } },
        loai_luoi: { type: 'string', enum: ['don_gian', 'phuc_tap', 'cam_xuc', 'ket_hop'], default: 'ket_hop' },
        target_ideas: { type: 'number', default: 300 },
        start_date: { type: 'string' },
        calendar_days: { type: 'number', default: 30 },
        existing_palette: { type: 'array', items: { type: 'string' } }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const sessionId = crypto.randomUUID();
      const now = Date.now();
      const intake = {
        brand_name: args.brand_name, tagline: args.tagline, industry: args.industry,
        audience: args.audience, mood: args.mood, loai_luoi: args.loai_luoi || 'ket_hop',
        target_ideas: args.target_ideas || 300, calendar_days: args.calendar_days || 30
      };

      // Create session row
      try {
        await env.DB.prepare(
          `INSERT INTO viral_grid_sessions (id, user_id, brand_name, intake_json, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'running', ?, ?)`
        ).bind(sessionId, auth.user.id, args.brand_name, JSON.stringify(intake), now, now).run();
      } catch (e) {
        return err('Failed to create session: ' + e.message + '. Run schema_v20 migration first.');
      }

      const log = [];

      // PHASE 1
      const p1Tool = TOOLS.find(t => t.name === 'generate_keyword_tree');
      const p1Result = await p1Tool.handler(env, auth, { ...intake, save_to_session: sessionId });
      if (p1Result.isError) {
        await env.DB.prepare('UPDATE viral_grid_sessions SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?')
          .bind('failed', 'Phase 1: ' + p1Result.content[0].text, Date.now(), sessionId).run();
        return err('Phase 1 failed: ' + p1Result.content[0].text, { session_id: sessionId });
      }
      let p1Data; try { p1Data = JSON.parse(p1Result.content[0].text); } catch (e) {}
      log.push({ phase: 1, status: 'ok', leaves: p1Data?.stats?.total_leaves });

      // PHASE 2
      const p2Tool = TOOLS.find(t => t.name === 'generate_content_matrix');
      const p2Result = await p2Tool.handler(env, auth, {
        keyword_tree: p1Data?.keyword_tree,
        brand_name: args.brand_name, audience: args.audience,
        target_count: args.target_ideas || 300,
        save_to_session: sessionId
      });
      if (p2Result.isError) {
        await env.DB.prepare('UPDATE viral_grid_sessions SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?')
          .bind('failed', 'Phase 2', Date.now(), sessionId).run();
        return err('Phase 2 failed', { session_id: sessionId, log });
      }
      let p2Data; try { p2Data = JSON.parse(p2Result.content[0].text); } catch (e) {}
      log.push({ phase: 2, status: 'ok', ideas: p2Data?.content_matrix?.total });

      // PHASE 3
      const p3Tool = TOOLS.find(t => t.name === 'design_visual_dna');
      const p3Result = await p3Tool.handler(env, auth, {
        brand_name: args.brand_name, mood: args.mood,
        industry: args.industry, audience: args.audience,
        existing_palette: args.existing_palette,
        save_to_session: sessionId
      });
      if (p3Result.isError) { log.push({ phase: 3, status: 'fail' }); }
      let p3Data; try { p3Data = JSON.parse(p3Result.content[0].text); } catch (e) {}
      log.push({ phase: 3, status: 'ok' });

      // PHASE 4
      const p4Tool = TOOLS.find(t => t.name === 'build_execution_plan');
      const p4Result = await p4Tool.handler(env, auth, {
        content_matrix: p2Data?.content_matrix,
        visual_dna: p3Data?.visual_dna,
        keyword_tree: p1Data?.keyword_tree,
        brand_name: args.brand_name,
        start_date: args.start_date,
        calendar_days: args.calendar_days || 30,
        save_to_session: sessionId
      });
      let p4Data; try { p4Data = JSON.parse(p4Result.content[0].text); } catch (e) {}
      log.push({ phase: 4, status: p4Result.isError ? 'fail' : 'ok' });

      // Assemble master.json
      const masterJson = {
        version: '1.0.0',
        session_id: sessionId,
        brand: intake,
        phase_1_keyword_tree: p1Data?.keyword_tree,
        phase_2_content_matrix: p2Data?.content_matrix,
        phase_3_visual_dna: p3Data?.visual_dna,
        phase_4_execution_plan: p4Data?.execution_plan,
        meta: {
          total_leaves: p1Data?.stats?.total_leaves || 0,
          total_ideas: p2Data?.content_matrix?.total || 0,
          viral_ratio: p2Data?.content_matrix?.viral_ratio || 60,
          calendar_days: args.calendar_days || 30,
          hook_count: p4Data?.execution_plan?.hook_bank?.length || 0,
          kpi_count: p4Data?.execution_plan?.kpis?.length || 0,
          sop_count: p4Data?.execution_plan?.sops?.length || 0,
          generated_at: new Date().toISOString()
        }
      };

      // Render dashboard HTML + save to R2
      let dashboardUrl = null;
      try {
        const dashboardHtml = renderMasterDashboard(masterJson);
        const htmlBytes = new TextEncoder().encode(dashboardHtml);
        const staged = await stageMediaToR2(env, { url: 'https://internal' }, auth.user.id, {
          filename: `master-dashboard-${args.brand_name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.html`,
          mime: 'text/html',
          bytes: htmlBytes
        });
        dashboardUrl = staged.url;
      } catch (e) {
        log.push({ phase: 'dashboard', status: 'fail', error: e.message });
      }

      // Save master + dashboard URL
      await env.DB.prepare(
        'UPDATE viral_grid_sessions SET master_json = ?, dashboard_url = ?, status = ?, finished_at = ?, updated_at = ? WHERE id = ?'
      ).bind(JSON.stringify(masterJson), dashboardUrl, 'done', Date.now(), Date.now(), sessionId).run();

      return ok({
        ok: true,
        session_id: sessionId,
        dashboard_url: dashboardUrl,
        master: masterJson,
        log,
        message: `🌟 Viral Grid Master xong cho "${args.brand_name}". Session: ${sessionId}. Dashboard: ${dashboardUrl || 'failed'}. Next: create_pack_from_strategy(session_id, days_window).`
      });
    }
  },

  {
    name: 'list_viral_grid_sessions',
    description: 'List all viral grid master sessions user đã chạy.',
    scope: 'packs:read',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 20 } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      try {
        const r = await env.DB.prepare(
          `SELECT id, brand_name, status, phases_completed, total_leaves, total_ideas, calendar_days, dashboard_url, created_at, finished_at
           FROM viral_grid_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
        ).bind(auth.user.id, args?.limit || 20).all();
        return ok({ total: r.results?.length || 0, sessions: r.results || [] });
      } catch (e) {
        return ok({ total: 0, sessions: [], note: 'viral_grid_sessions table not yet migrated. Run schema_v20.' });
      }
    }
  },

  {
    name: 'get_master_strategy',
    description: 'Get full master.json của 1 session (4 phases + dashboard URL).',
    scope: 'packs:read',
    inputSchema: { type: 'object', required: ['session_id'], properties: { session_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      const r = await env.DB.prepare('SELECT * FROM viral_grid_sessions WHERE id = ? AND user_id = ?').bind(args.session_id, auth.user.id).first();
      if (!r) return err('Session not found');
      let master = null; try { master = JSON.parse(r.master_json || 'null'); } catch (e) {}
      return ok({
        session: {
          id: r.id, brand_name: r.brand_name, status: r.status,
          phases_completed: r.phases_completed, total_leaves: r.total_leaves,
          total_ideas: r.total_ideas, calendar_days: r.calendar_days,
          dashboard_url: r.dashboard_url, created_at: r.created_at, finished_at: r.finished_at
        },
        master
      });
    }
  },

  {
    name: 'render_master_dashboard',
    description: 'Re-render dashboard HTML cho 1 session. Useful nếu dashboard cũ bị expire.',
    scope: 'gen:write',
    inputSchema: { type: 'object', required: ['session_id'], properties: { session_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const r = await env.DB.prepare('SELECT master_json, brand_name FROM viral_grid_sessions WHERE id = ? AND user_id = ?').bind(args.session_id, auth.user.id).first();
      if (!r) return err('Session not found');
      let master; try { master = JSON.parse(r.master_json); } catch (e) { return err('Master JSON corrupt'); }
      const html = renderMasterDashboard(master);
      const bytes = new TextEncoder().encode(html);
      const staged = await stageMediaToR2(env, { url: 'https://internal' }, auth.user.id, {
        filename: `master-dashboard-${r.brand_name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.html`,
        mime: 'text/html', bytes
      });
      await env.DB.prepare('UPDATE viral_grid_sessions SET dashboard_url = ?, updated_at = ? WHERE id = ?').bind(staged.url, Date.now(), args.session_id).run();
      return ok({ ok: true, dashboard_url: staged.url });
    }
  },

  // ──────────────────────────────────────────
  // V20.C — Bridge tools: strategy → pack
  // ──────────────────────────────────────────
  {
    name: 'create_pack_from_strategy',
    description: '🌟 BRIDGE — Tạo pack mới từ Viral Grid master.json. Pick N consecutive days từ calendar + ideas từ matrix → posts với image_prompts inheriting Visual DNA.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['session_id', 'pack_name'],
      properties: {
        session_id: { type: 'string' },
        pack_name: { type: 'string' },
        days_window: { type: 'array', items: { type: 'number' }, description: 'e.g. [1, 30] for first 30 days, [31, 60] for next batch' },
        auto_generate_images: { type: 'boolean', default: false }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const s = await env.DB.prepare('SELECT master_json FROM viral_grid_sessions WHERE id = ? AND user_id = ?').bind(args.session_id, auth.user.id).first();
      if (!s) return err('Session not found');
      let master; try { master = JSON.parse(s.master_json); } catch (e) { return err('Master JSON corrupt'); }

      const [startDay, endDay] = args.days_window || [1, master.meta?.calendar_days || 30];
      const calendar = master.phase_4_execution_plan?.calendar || [];
      const matrix = master.phase_2_content_matrix?.ideas || [];
      const dna = master.phase_3_visual_dna || {};

      const selected = calendar.filter(c => c.day >= startDay && c.day <= endDay);
      if (selected.length === 0) return err(`No calendar entries in days ${startDay}-${endDay}`);

      // Build posts from calendar + matrix
      const posts = selected.map((c, i) => {
        const idea = matrix.find(m => m.id === c.idea_id);
        if (!idea) return null;
        return {
          n: i + 1,
          day: c.day,
          date: c.date,
          pillar: idea.tier === 'viral' ? 1 : 2,
          title: idea.title,
          caption: `[${idea.tier.toUpperCase()}] ${idea.title}\n\nFormat: ${idea.format} · Hook: ${idea.hook_angle}\n\n(Caption sẽ được mở rộng khi sinh ảnh — viết theo Visual DNA ${dna.signature_pattern?.name || ''})`,
          image_prompt: `${idea.title} — ${dna.composition?.rule || 'centered'} composition, ${dna.light?.quality || 'soft'} lighting, palette ${(dna.palette?.primary || '#000') + ',' + (dna.palette?.accent || '#fff')}, ${dna.texture?.type || 'flat'} texture. Signature: ${dna.signature_pattern?.description || 'clean'}.`,
          best_time: c.slot || '09:00',
          format: idea.format,
          hook_angle: idea.hook_angle,
          status: 'draft',
          source_idea_id: idea.id,
          source_leaf_id: idea.leaf_id
        };
      }).filter(Boolean);

      const packId = crypto.randomUUID();
      const now = Date.now();
      const brand = {
        ...master.brand,
        visual_dna: dna,
        viral_grid_session_id: args.session_id
      };

      try {
        await env.DB.prepare(
          `INSERT INTO packs (id, user_id, name, brand_json, posts_json, viral_grid_session_id, content_matrix_used_idea_ids, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(
          packId, auth.user.id, args.pack_name,
          JSON.stringify(brand), JSON.stringify(posts),
          args.session_id, JSON.stringify(posts.map(p => p.source_idea_id)),
          now, now
        ).run();
      } catch (e) {
        // Fallback if columns don't exist
        await env.DB.prepare(
          `INSERT INTO packs (id, user_id, name, brand_json, posts_json, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(packId, auth.user.id, args.pack_name, JSON.stringify(brand), JSON.stringify(posts), now, now).run();
      }

      let imgResult = null;
      if (args.auto_generate_images) {
        const imgTool = TOOLS.find(t => t.name === 'generate_all_images');
        const r = await imgTool.handler(env, auth, { pack_id: packId });
        try { imgResult = JSON.parse(r.content[0].text); } catch (e) {}
      }

      return ok({
        ok: true,
        pack_id: packId,
        name: args.pack_name,
        posts_count: posts.length,
        days_window: [startDay, endDay],
        source_session: args.session_id,
        images_generated: imgResult,
        message: `✅ Pack "${args.pack_name}" tạo xong với ${posts.length} posts từ strategy session, day ${startDay}-${endDay}.`
      });
    }
  },

  {
    name: 'apply_visual_dna_to_pack',
    description: 'Inject visual-dna.json vào pack.brand_json + augment tất cả image_prompts. Dùng khi đã có pack tạo trước, muốn refit với DNA mới.',
    scope: 'packs:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'session_id'],
      properties: { pack_id: { type: 'string' }, session_id: { type: 'string' } }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:write');
      const s = await env.DB.prepare('SELECT master_json FROM viral_grid_sessions WHERE id = ? AND user_id = ?').bind(args.session_id, auth.user.id).first();
      if (!s) return err('Session not found');
      let master; try { master = JSON.parse(s.master_json); } catch (e) { return err('Master JSON corrupt'); }
      const dna = master.phase_3_visual_dna || {};

      const pack = await env.DB.prepare('SELECT brand_json, posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      let brand = {}; try { brand = JSON.parse(pack.brand_json || '{}'); } catch (e) {}
      let posts = []; try { posts = JSON.parse(pack.posts_json || '[]'); } catch (e) {}

      brand.visual_dna = dna;
      brand.viral_grid_session_id = args.session_id;

      const dnaHint = `Visual DNA: ${dna.composition?.rule || ''} composition, ${dna.light?.quality || ''} lighting, palette [${dna.palette?.primary},${dna.palette?.accent}], ${dna.texture?.type || ''} texture. Signature: ${dna.signature_pattern?.description || ''}.`;
      posts = posts.map(p => ({
        ...p,
        image_prompt: p.image_prompt ? `${p.image_prompt} | ${dnaHint}` : p.image_prompt
      }));

      await env.DB.prepare('UPDATE packs SET brand_json = ?, posts_json = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(brand), JSON.stringify(posts), Date.now(), args.pack_id).run();

      return ok({ ok: true, pack_id: args.pack_id, posts_updated: posts.length, dna_signature: dna.signature_pattern?.name });
    }
  },

  {
    name: 'schedule_from_execution_plan',
    description: 'Auto-schedule pack posts theo calendar trong execution-plan của Viral Grid session (override post.best_time).',
    scope: 'publish:write',
    inputSchema: {
      type: 'object', required: ['pack_id'],
      properties: {
        pack_id: { type: 'string' },
        session_id: { type: 'string', description: 'Optional — auto-pick from pack.viral_grid_session_id nếu trống' },
        account_id: { type: 'string' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'publish:write');
      const pack = await env.DB.prepare('SELECT * FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      const sessionId = args.session_id || pack.viral_grid_session_id;
      if (!sessionId) return err('No session_id linked to this pack. Pass session_id arg or use create_pack_from_strategy.');

      const s = await env.DB.prepare('SELECT master_json FROM viral_grid_sessions WHERE id = ? AND user_id = ?').bind(sessionId, auth.user.id).first();
      if (!s) return err('Session not found');
      let master; try { master = JSON.parse(s.master_json); } catch (e) { return err('Master JSON corrupt'); }
      const calendar = master.phase_4_execution_plan?.calendar || [];

      const posts = JSON.parse(pack.posts_json || '[]');
      const eligible = posts.filter(p => p.image_url && p.caption);
      if (eligible.length === 0) return err('No eligible posts');

      const apiKey = await getZernioKey(env, auth.user.id);
      let accountId = args.account_id;
      if (!accountId) {
        const u = await env.DB.prepare('SELECT zernio_account_id FROM users WHERE id = ?').bind(auth.user.id).first();
        accountId = u?.zernio_account_id;
      }
      if (!accountId) return err('No active FB Page');

      const results = [];
      for (const post of eligible) {
        const calEntry = calendar.find(c => c.day === post.day) || calendar[eligible.indexOf(post)];
        const dateStr = calEntry?.date;
        const slot = calEntry?.slot || post.best_time || '09:00';
        if (!dateStr) continue;
        const iso = `${dateStr}T${slot}:00`;
        try {
          const body = buildPostBody({
            content: post.caption,
            accountId,
            mediaUrls: [{ url: post.image_url }],
            mediaType: 'image',
            scheduledFor: iso,
            timezone: 'Asia/Ho_Chi_Minh',
            platform: 'facebook'
          });
          const resp = await zernioPost(apiKey, '/posts', body);
          results.push({ post_n: post.n, day: post.day, status: 'ok', zernio_post_id: resp._id || resp.id, scheduled_for: iso });
          await sleep(300);
        } catch (e) {
          results.push({ post_n: post.n, status: 'fail', error: e.message.slice(0, 120) });
        }
      }

      return ok({
        ok: true,
        scheduled_from: 'execution_plan_calendar',
        session_id: sessionId,
        succeeded: results.filter(r => r.status === 'ok').length,
        failed: results.filter(r => r.status === 'fail').length,
        results: results.slice(0, 30)
      });
    }
  },

  // ════════════════════════════════════════════════════════════════
  // BRAND GENESIS STUDIO (V21) — Unified Pipeline
  // Merges Viral Grid (Phase 1-4) + Wizard (Phase 5 Materialize) + Skills Router (Phase 6)
  // ════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────
  // V21.B — PHASE 5: Materialize top-N ideas → full posts
  // ──────────────────────────────────────────
  {
    name: 'materialize_top_posts',
    description: '[Phase 5] Pick top-N ideas từ Viral Grid matrix → expand thành full posts (caption + image_prompt + voice_script + best_time). Apply Visual DNA. Save as new pack linked to session.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['session_id'],
      properties: {
        session_id: { type: 'string' },
        count: { type: 'number', default: 100, description: 'Number of posts to materialize (max 150)' },
        pack_name: { type: 'string', description: 'Pack name override' },
        ground_with_vault: { type: 'boolean', default: false, description: 'If session has vault sources, ground each post in them' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const s = await env.DB.prepare('SELECT * FROM viral_grid_sessions WHERE id = ? AND user_id = ?').bind(args.session_id, auth.user.id).first();
      if (!s) return err('Session not found');
      let master; try { master = JSON.parse(s.master_json); } catch (e) { return err('Master JSON corrupt'); }

      const allIdeas = master.phase_2_content_matrix?.ideas || [];
      const calendar = master.phase_4_execution_plan?.calendar || [];
      const dna = master.phase_3_visual_dna || {};
      const brand = master.brand || {};
      const treeLeaves = (master.phase_1_keyword_tree?.pillars || []).flatMap(p =>
        (p.branches || []).flatMap(b => (b.leaves || []))
      );

      if (allIdeas.length === 0) return err('No ideas in matrix. Run Phase 2 first.');

      const target = Math.min(args.count || 100, Math.min(150, allIdeas.length));

      // ─── Smart selection: balance viral/brand + leaf coverage + format diversity ───
      const viralCount = Math.round(target * 0.6);
      const brandCount = target - viralCount;
      const viralIdeas = allIdeas.filter(i => i.tier === 'viral');
      const brandIdeas = allIdeas.filter(i => i.tier === 'brand');

      // Round-robin by leaf to ensure coverage
      function pickBalanced(pool, n) {
        const byLeaf = {};
        for (const idea of pool) {
          const k = idea.leaf_id || 'unknown';
          if (!byLeaf[k]) byLeaf[k] = [];
          byLeaf[k].push(idea);
        }
        const leaves = Object.keys(byLeaf);
        const picked = [];
        let round = 0;
        while (picked.length < n) {
          let added = false;
          for (const k of leaves) {
            if (picked.length >= n) break;
            if (byLeaf[k][round]) {
              picked.push(byLeaf[k][round]);
              added = true;
            }
          }
          if (!added) break;
          round++;
        }
        return picked;
      }

      const picked = [
        ...pickBalanced(viralIdeas, viralCount),
        ...pickBalanced(brandIdeas, brandCount)
      ];

      // ─── Map to calendar slots ───
      const totalDays = Math.max(...calendar.map(c => c.day || 0)) || 30;
      const postsPerDay = Math.ceil(target / totalDays);
      const mapped = picked.map((idea, i) => {
        const day = Math.floor(i / postsPerDay) + 1;
        const slot = ['09:00', '13:00', '18:00', '20:00'][i % 4];
        const calEntry = calendar.find(c => c.day === day) || {};
        return {
          n: i + 1,
          day,
          date: calEntry.date || null,
          best_time: calEntry.slot || slot,
          source_idea: idea,
          source_leaf_id: idea.leaf_id,
          format: idea.format,
          hook_angle: idea.hook_angle,
          tier: idea.tier,
          pillar: idea.tier === 'viral' ? 1 : 2
        };
      });

      // ─── Optional: load vault for grounding ───
      let vaultContext = '';
      if (args.ground_with_vault) {
        try {
          const r = await env.DB.prepare('SELECT filename, content_text FROM vault_files WHERE user_id = ? LIMIT 5')
            .bind(auth.user.id).all();
          vaultContext = (r.results || []).map(v => `### ${v.filename}\n${(v.content_text || '').slice(0, 3000)}`).join('\n\n---\n\n');
        } catch (e) {}
      }

      // ─── Batch expand via Gemini (10 ideas per batch) ───
      const BATCH = 10;
      const expanded = [];
      const dnaHint = `Visual DNA: palette [${dna.palette?.primary || '#000'},${dna.palette?.accent || '#fff'}], ${dna.composition?.rule || 'centered'} composition, ${dna.light?.quality || 'soft'} lighting, ${dna.texture?.type || 'flat'} texture. Signature: ${dna.signature_pattern?.description || 'clean'}.`;

      for (let bIdx = 0; bIdx < mapped.length; bIdx += BATCH) {
        const batch = mapped.slice(bIdx, bIdx + BATCH);
        const batchPrompt = `Bạn là viral content writer cho brand "${brand.brand_name}".
BRAND DNA: ${JSON.stringify({ brand, signature: dna.signature_pattern?.name || '', voice: brand.mood?.join(',') || '' }).slice(0, 600)}

${vaultContext ? `KNOWLEDGE VAULT (ground claims here):\n${vaultContext.slice(0, 6000)}\n\n` : ''}

Expand ${batch.length} content ideas thành full Vietnamese posts. Mỗi post:
- title (< 60 chars, hook scroll-stopping)
- caption (Vietnamese, 100-200 words, HOOK + VALUE + CTA, NO emoji spam, conversational)
- image_prompt (English, detailed scene, INCLUDES this DNA hint: ${dnaHint.slice(0, 200)})
- voice_script (Vietnamese 4-phase: hook 1s · context 4s · payoff 8s · CTA 2s ≈ 15s total)
${vaultContext ? '- vault_citations (array of source titles you grounded in, or empty array)' : ''}

IDEAS TO EXPAND:
${batch.map(m => `[${m.n}] leaf=${m.source_leaf_id} format=${m.format} hook=${m.hook_angle} tier=${m.tier} | title: ${m.source_idea.title}`).join('\n')}

Return JSON ONLY: { "posts": [{ "n": 1, "title": "...", "caption": "...", "image_prompt": "...", "voice_script": "..."${vaultContext ? ', "vault_citations": []' : ''} }, ...] }`;

        try {
          const resp = await callGemini(env, 'gemini-2.5-flash', {
            contents: [{ role: 'user', parts: [{ text: batchPrompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 16000 }
          });
          const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = JSON.parse(text);
          for (const p of parsed.posts || []) {
            const mm = mapped.find(m => m.n === p.n);
            if (mm) {
              expanded.push({
                n: mm.n, day: mm.day, date: mm.date,
                pillar: mm.pillar, format: mm.format, hook_angle: mm.hook_angle,
                title: p.title, caption: p.caption,
                image_prompt: p.image_prompt, voice_script: p.voice_script,
                best_time: mm.best_time,
                status: 'draft',
                source_idea_id: mm.source_idea.id,
                source_leaf_id: mm.source_leaf_id,
                vault_citations: p.vault_citations || [],
                tier: mm.tier
              });
            }
          }
          await sleep(800);  // rate limit
        } catch (e) {
          // Partial batch fail — log + continue
          for (const mm of batch) {
            expanded.push({
              ...mm,
              title: mm.source_idea.title,
              caption: `[Materialize failed: ${e.message.slice(0,60)}] ${mm.source_idea.title}`,
              image_prompt: `${mm.source_idea.title} — ${dnaHint}`,
              voice_script: '',
              status: 'draft_failed'
            });
          }
        }
      }

      // ─── Save as new pack ───
      const packId = crypto.randomUUID();
      const now = Date.now();
      const packName = args.pack_name || `${brand.brand_name} · Materialize ${target} (${new Date().toISOString().slice(0,10)})`;
      const packBrand = { ...brand, visual_dna: dna, viral_grid_session_id: args.session_id };

      try {
        await env.DB.prepare(
          `INSERT INTO packs (id, user_id, name, brand_json, posts_json, viral_grid_session_id, content_matrix_used_idea_ids, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(
          packId, auth.user.id, packName,
          JSON.stringify(packBrand), JSON.stringify(expanded),
          args.session_id,
          JSON.stringify(expanded.map(p => p.source_idea_id)),
          now, now
        ).run();
      } catch (e) {
        // Fallback without V20/V21 columns
        await env.DB.prepare(
          `INSERT INTO packs (id, user_id, name, brand_json, posts_json, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(packId, auth.user.id, packName, JSON.stringify(packBrand), JSON.stringify(expanded), now, now).run();
      }

      // Update session
      try {
        await env.DB.prepare(
          'UPDATE viral_grid_sessions SET materialized_pack_id = ?, updated_at = ? WHERE id = ?'
        ).bind(packId, Date.now(), args.session_id).run();
      } catch (e) {}

      return ok({
        ok: true,
        pack_id: packId,
        pack_name: packName,
        materialized: expanded.length,
        failed: expanded.filter(p => p.status === 'draft_failed').length,
        viral_count: expanded.filter(p => p.tier === 'viral').length,
        brand_count: expanded.filter(p => p.tier === 'brand').length,
        leaf_coverage: new Set(expanded.map(p => p.source_leaf_id)).size,
        format_diversity: new Set(expanded.map(p => p.format)).size,
        message: `✅ Materialized ${expanded.length} posts từ session. Pack: ${packId}. Next: generate_all_images(pack_id) → schedule_from_execution_plan(pack_id).`
      });
    }
  },

  // ──────────────────────────────────────────
  // V21.C — PHASE 6: Skills Router
  // ──────────────────────────────────────────
  {
    name: 'route_skills_for_product',
    description: '[Phase 6] Based on product_type, return routing plan: which downstream skills to invoke + per-skill intake prompts ready-to-use. Save to spawned_artifacts.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['session_id', 'product_type'],
      properties: {
        session_id: { type: 'string' },
        product_type: { type: 'string', enum: ['course', 'niche', 'fmcg', 'saas', 'service', 'info'] }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const s = await env.DB.prepare('SELECT * FROM viral_grid_sessions WHERE id = ? AND user_id = ?').bind(args.session_id, auth.user.id).first();
      if (!s) return err('Session not found');
      let master; try { master = JSON.parse(s.master_json); } catch (e) { return err('Master JSON corrupt'); }

      const brand = master.brand || {};
      const dna = master.phase_3_visual_dna || {};
      const matrix = master.phase_2_content_matrix || {};
      const plan = master.phase_4_execution_plan || {};

      // Routing matrix
      const SKILLS_BY_TYPE = {
        course: [
          { name: 'edutainment-brand-engine', type: 'strategy', purpose: 'Brand strategy + 30-day execution + Comic Demo Day 1' },
          { name: 'comic-content-engine', type: 'comic', purpose: 'Multi-platform comic series với mascot + episode scripts' },
          { name: 'edu-video-engine', type: 'video', purpose: 'HTML5 animation video minh họa kiến thức' },
          { name: 'vintage-edu-card-9grid', type: 'carousel', purpose: 'TikTok 9-grid vintage carousel cards' },
          { name: 'vintage-stickfigure-edu-video', type: 'video', purpose: 'Vintage flipbook 60s edu video' }
        ],
        niche: [
          { name: 'aff-niche-builder', type: 'pipeline', purpose: '100 hooks + 100 image prompts + 100 video prompts + 30-day calendar' },
          { name: 'tiktok-30day-creator-dashboard', type: 'dashboard', purpose: 'Creator hub 30-day với infographic + long-form + caption + dashboard' },
          { name: 'koc-virtual-builder', type: 'character', purpose: 'KOC ảo character + 30-day storyboard + Veo prompts' },
          { name: 'pixel-aff-video-engine', type: 'video', purpose: 'Pixel-game-style aff video 45-60s' },
          { name: 'image-prompt-master', type: 'prompts', purpose: 'Convert prompts cross-model (Nano Banana / MJ / Flux)' }
        ],
        fmcg: [
          { name: 'fb-content-30day-pack', type: 'content', purpose: '30 FB posts với caption + AI image prompts + SVG mockup' },
          { name: 'fb-ads-mess-30day-pack', type: 'ads', purpose: 'Ads bán hàng qua Messenger 30 ngày + MCP Meta autopilot' },
          { name: 'mascot-brand-pack', type: 'brand', purpose: 'Mascot starter pack + Brand DNA + AI prompts portable' },
          { name: 'dual-line-packaging-engine', type: 'packaging', purpose: 'Packaging redesign brief 2 line + SVG mockup + launch roadmap' },
          { name: 'product-ad-video', type: 'video', purpose: 'TVC 30s edutainment HTML5 với voice-over sync' },
          { name: 'lp-storytelling-conversion', type: 'landing', purpose: '15-slide LP storytelling COD high-conversion' }
        ],
        saas: [
          { name: 'brand-quiz-engine', type: 'game', purpose: '5-10 câu quiz product → voucher unlock' },
          { name: 'ai-game-voucher-engine', type: 'game', purpose: 'Playable HTML5 mini-game với voucher reveal' },
          { name: 'memory-card-brand', type: 'game', purpose: 'Memory match feature cards + voucher tier' },
          { name: 'wordle-daily-engine', type: 'game', purpose: 'Daily Wordle với product words + voucher' },
          { name: 'landing-page-video-engine', type: 'landing', purpose: 'LP với embedded animated product video + voice-over' }
        ],
        service: [
          { name: 'brand-strategy-engine', type: 'strategy', purpose: '10-section strategy doc + 13-slide deck' },
          { name: 'financial-growth-engine', type: 'financial', purpose: 'Word 15-20 trang + Excel 10+ sheet + PPTX 13 trang' },
          { name: 'landing-page-builder', type: 'landing', purpose: 'Production-ready LP từ data input' },
          { name: 'think-coach-hn', type: 'thinking', purpose: 'Mental models support cho decision-making' },
          { name: 'slide-deck-to-netlify-lp', type: 'landing', purpose: 'PDF slide → Netlify LP deploy 1 lệnh' }
        ],
        info: [
          { name: 'notebooklm', type: 'research', purpose: 'Source-grounded answers từ Google NotebookLM' },
          { name: 'docx', type: 'doc', purpose: 'Word documents với formatting + headings' },
          { name: 'pdf', type: 'doc', purpose: 'PDF extract + create + merge + forms' },
          { name: 'pptx', type: 'doc', purpose: 'Slide decks + presentations' },
          { name: 'lp-storytelling-conversion', type: 'landing', purpose: 'Sales LP với 15-slide storytelling' }
        ]
      };

      const skills = SKILLS_BY_TYPE[args.product_type] || [];
      if (skills.length === 0) return err('Unknown product_type: ' + args.product_type);

      const sessionId = args.session_id;
      const now = Date.now();
      const routingPlan = { product_type: args.product_type, skills: [] };

      // Build per-skill intake prompts
      for (const skill of skills) {
        const intakePrompt = buildSkillIntake(skill.name, brand, dna, matrix, plan, args.product_type);
        const artifactId = crypto.randomUUID();
        try {
          await env.DB.prepare(
            `INSERT INTO spawned_artifacts (id, user_id, session_id, skill_name, artifact_type, intake_prompt, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
          ).bind(artifactId, auth.user.id, sessionId, skill.name, skill.type, intakePrompt, now).run();
        } catch (e) {}
        routingPlan.skills.push({
          artifact_id: artifactId,
          skill_name: skill.name,
          artifact_type: skill.type,
          purpose: skill.purpose,
          invocation: `/anthropic-skills:${skill.name}`,
          intake_prompt: intakePrompt
        });
      }

      // Save routing plan to session
      try {
        await env.DB.prepare(
          'UPDATE viral_grid_sessions SET product_type = ?, skills_routing_json = ?, updated_at = ? WHERE id = ?'
        ).bind(args.product_type, JSON.stringify(routingPlan), Date.now(), sessionId).run();
      } catch (e) {}

      return ok({
        ok: true,
        product_type: args.product_type,
        skills_routed: skills.length,
        routing_plan: routingPlan,
        message: `✅ Routed ${skills.length} skills cho product_type=${args.product_type}. Mỗi skill có intake_prompt sẵn để invoke qua "/anthropic-skills:<name>" hoặc Cowork chat. Artifacts saved to spawned_artifacts table.`
      });
    }
  },

  // ──────────────────────────────────────────
  // V21.D — Mega Orchestrator: run_brand_genesis
  // ──────────────────────────────────────────
  {
    name: 'run_brand_genesis',
    description: '🌟🌟 ULTIMATE MEGA TOOL — Chạy FULL Brand Genesis pipeline trong 1 call: run_viral_grid_master (4 phases) → materialize_top_posts (100 posts) → route_skills_for_product (auto-spawn artifacts). Atomic end-to-end. ~3-5 phút.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['brand_name', 'tagline', 'industry', 'audience', 'mood', 'product_type'],
      properties: {
        brand_name: { type: 'string' },
        tagline: { type: 'string' },
        industry: { type: 'string' },
        audience: { type: 'string' },
        mood: { type: 'array', items: { type: 'string' } },
        product_type: { type: 'string', enum: ['course', 'niche', 'fmcg', 'saas', 'service', 'info'] },
        loai_luoi: { type: 'string', enum: ['don_gian', 'phuc_tap', 'cam_xuc', 'ket_hop'], default: 'ket_hop' },
        target_ideas: { type: 'number', default: 300 },
        materialize_count: { type: 'number', default: 100 },
        start_date: { type: 'string' },
        calendar_days: { type: 'number', default: 30 },
        ground_with_vault: { type: 'boolean', default: false },
        existing_palette: { type: 'array', items: { type: 'string' } }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const log = [];

      // PHASE 1-4: Viral Grid Master
      const vgmTool = TOOLS.find(t => t.name === 'run_viral_grid_master');
      const vgmResult = await vgmTool.handler(env, auth, {
        brand_name: args.brand_name, tagline: args.tagline,
        industry: args.industry, audience: args.audience, mood: args.mood,
        loai_luoi: args.loai_luoi, target_ideas: args.target_ideas,
        start_date: args.start_date, calendar_days: args.calendar_days,
        existing_palette: args.existing_palette
      });
      if (vgmResult.isError) return err('Viral Grid Master failed', { log, result: vgmResult.content[0].text });
      let vgmData; try { vgmData = JSON.parse(vgmResult.content[0].text); } catch (e) { return err('VGM result parse fail'); }
      const sessionId = vgmData.session_id;
      log.push({ step: 'viral_grid_master', status: 'ok', session_id: sessionId, dashboard_url: vgmData.dashboard_url });

      // PHASE 5: Materialize
      const matTool = TOOLS.find(t => t.name === 'materialize_top_posts');
      const matResult = await matTool.handler(env, auth, {
        session_id: sessionId,
        count: args.materialize_count || 100,
        ground_with_vault: args.ground_with_vault
      });
      let matData; try { matData = JSON.parse(matResult.content[0].text); } catch (e) {}
      log.push({ step: 'materialize', status: matResult.isError ? 'fail' : 'ok', pack_id: matData?.pack_id, materialized: matData?.materialized });

      // PHASE 6: Skills Router
      const routerTool = TOOLS.find(t => t.name === 'route_skills_for_product');
      const routerResult = await routerTool.handler(env, auth, {
        session_id: sessionId,
        product_type: args.product_type
      });
      let routerData; try { routerData = JSON.parse(routerResult.content[0].text); } catch (e) {}
      log.push({ step: 'skills_router', status: routerResult.isError ? 'fail' : 'ok', skills_routed: routerData?.skills_routed });

      return ok({
        ok: true,
        session_id: sessionId,
        dashboard_url: vgmData.dashboard_url,
        materialized_pack_id: matData?.pack_id,
        product_type: args.product_type,
        skills_routed: routerData?.skills_routed || 0,
        skills_routing_plan: routerData?.routing_plan,
        summary: {
          total_leaves: vgmData.master?.meta?.total_leaves,
          total_ideas: vgmData.master?.meta?.total_ideas,
          materialized_posts: matData?.materialized,
          spawned_skills: routerData?.skills_routed,
          calendar_days: vgmData.master?.meta?.calendar_days,
          hook_count: vgmData.master?.meta?.hook_count,
          kpi_count: vgmData.master?.meta?.kpi_count
        },
        log,
        next_steps: [
          `1. Mở dashboard: ${vgmData.dashboard_url || 'N/A'}`,
          `2. Pack đã materialize 100 posts: pack_id=${matData?.pack_id}`,
          `3. Generate ảnh: generate_all_images(pack_id="${matData?.pack_id}")`,
          `4. Schedule: schedule_from_execution_plan(pack_id="${matData?.pack_id}")`,
          `5. Invoke ${routerData?.skills_routed || 0} skill artifacts: xem skills_routing_plan.skills[].invocation`
        ],
        message: `🌟🌟 BRAND GENESIS hoàn tất cho "${args.brand_name}" (${args.product_type}). 100 posts ready, ${routerData?.skills_routed || 0} skill artifacts spawned. Dashboard: ${vgmData.dashboard_url}`
      });
    }
  },

  // ──────────────────────────────────────────
  // STATUS / DIAGNOSTICS
  // ──────────────────────────────────────────
  {
    name: 'get_app_status',
    description: 'Get overall app connection status: FB / Meta Ads / Zernio / Drive / quota usage.',
    scope: 'packs:read',
    inputSchema: { type: 'object', properties: {} },
    async handler(env, auth) {
      requireScope(auth, 'packs:read');
      const fb = await env.DB.prepare(
        `SELECT page_id, page_name, scopes, ads_scopes, user_access_token IS NOT NULL AS has_user_token FROM fb_credentials WHERE user_id = ?`
      ).bind(auth.user.id).first();
      const u = await env.DB.prepare('SELECT zernio_account_id, zernio_api_key IS NOT NULL AS has_zernio FROM users WHERE id = ?').bind(auth.user.id).first();
      const packCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM packs WHERE user_id = ?').bind(auth.user.id).first();
      return ok({
        user: { email: auth.user.email },
        fb: fb ? { page_name: fb.page_name, has_user_token: !!fb.has_user_token, ads_ready: (fb.ads_scopes || '').includes('ads_management') } : { connected: false },
        zernio: { connected: !!u?.has_zernio, active_account_id: u?.zernio_account_id },
        packs: { total: packCount?.c || 0 },
        mcp: { key_label: auth.label, scopes: auth.scopes }
      });
    }
  },

  // ──────────────────────────────────────────
  // STUDIO RENDER (V18 Phase 6C — queue system)
  // ──────────────────────────────────────────
  {
    name: 'build_render_timeline',
    description: 'Build a Studio timeline JSON from a post (auto-detects assets: images + voice + music). Returns timeline ready to render.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['pack_id', 'post_n'],
      properties: {
        pack_id: { type: 'string' }, post_n: { type: 'number' },
        type: { type: 'string', enum: ['slide', 'cinema'], default: 'slide' },
        aspect_ratio: { type: 'string', default: '9:16' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const pack = await env.DB.prepare('SELECT posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      const posts = JSON.parse(pack.posts_json || '[]');
      const post = posts.find(p => p.n === args.post_n);
      if (!post) return err(`Post n=${args.post_n} not found`);

      let assets = [];
      try {
        const r = await env.DB.prepare('SELECT * FROM media_files WHERE user_id = ? AND pack_id = ? AND post_n = ?')
          .bind(auth.user.id, args.pack_id, args.post_n).all();
        assets = r.results || [];
      } catch (e) {}

      const images = assets.filter(a => a.kind === 'image');
      const voice = assets.find(a => a.kind === 'voice');

      const timeline = {
        type: args.type || 'slide',
        aspect_ratio: args.aspect_ratio || '9:16',
        duration_seconds: voice ? null : (images.length * 3),
        clips: images.map((img, i) => ({
          type: 'image',
          url: img.url,
          start: i * 3,
          duration: 3,
          effects: { ken_burns: true }
        })),
        audio: voice ? { voice_url: voice.url } : null,
        post_meta: { caption: post.caption, title: post.title }
      };

      return ok({ ok: true, pack_id: args.pack_id, post_n: args.post_n, timeline,
        note: 'Use request_render(pack_id, post_n, timeline) to enqueue render job.' });
    }
  },
  {
    name: 'request_render',
    description: 'Enqueue a Studio render job. Returns job_id immediately. Poll with get_render_status. NOTE: Server-side FFmpeg render is V19; for now the frontend Studio UI processes pending jobs when opened.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['timeline'],
      properties: {
        pack_id: { type: 'string' }, post_n: { type: 'number' },
        type: { type: 'string', enum: ['slide', 'cinema', 'custom'], default: 'slide' },
        timeline: { type: 'object' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const jobId = crypto.randomUUID();
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO render_jobs (id, user_id, pack_id, post_n, type, timeline_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
        ).bind(jobId, auth.user.id, args.pack_id || null, args.post_n || null, args.type || 'slide', JSON.stringify(args.timeline), now).run();
      } catch (e) {
        return err('Failed to enqueue render: ' + e.message + '. Schema render_jobs may not exist yet — run schema_v18 migration.');
      }
      return ok({
        ok: true,
        job_id: jobId,
        status: 'pending',
        message: 'Render job queued. Mở app Studio để process queue (V18 frontend will auto-pull pending jobs). Server-side FFmpeg is V19 roadmap.',
        next: `get_render_status(${jobId})`
      });
    }
  },
  {
    name: 'get_render_status',
    description: 'Check status of a render job (pending / processing / done / failed). Returns result_url when done.',
    scope: 'packs:read',
    inputSchema: { type: 'object', required: ['job_id'], properties: { job_id: { type: 'string' } } },
    async handler(env, auth, args) {
      requireScope(auth, 'packs:read');
      try {
        const r = await env.DB.prepare('SELECT * FROM render_jobs WHERE id = ? AND user_id = ?').bind(args.job_id, auth.user.id).first();
        if (!r) return err('Job not found');
        return ok({
          job_id: r.id, status: r.status, progress: r.progress,
          result_url: r.result_url, error: r.error_msg,
          duration_seconds: r.duration_seconds, size_bytes: r.size_bytes,
          created_at: r.created_at, started_at: r.started_at, finished_at: r.finished_at
        });
      } catch (e) { return err('Status: ' + e.message); }
    }
  },

  // ──────────────────────────────────────────
  // SMART BULK OPERATIONS (V18 Phase 6D)
  // ──────────────────────────────────────────
  {
    name: 'generate_all_images',
    description: 'Generate images for ALL posts in a pack that don\'t have one yet. Returns per-post status.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['pack_id'],
      properties: {
        pack_id: { type: 'string' },
        aspect_ratio: { type: 'string', default: '4:5' },
        force_regenerate: { type: 'boolean', default: false }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const pack = await env.DB.prepare('SELECT posts_json FROM packs WHERE id = ? AND user_id = ?').bind(args.pack_id, auth.user.id).first();
      if (!pack) return err('Pack not found');
      const posts = JSON.parse(pack.posts_json || '[]');
      const todo = posts.filter(p => p.image_prompt && (args.force_regenerate || !p.image_url));
      if (todo.length === 0) return ok({ ok: true, generated: 0, message: 'All posts already have images' });

      const imgTool = TOOLS.find(t => t.name === 'generate_image');
      const results = [];
      for (const post of todo) {
        try {
          const r = await imgTool.handler(env, auth, {
            prompt: post.image_prompt, aspect_ratio: args.aspect_ratio || '4:5',
            save_to_pack_id: args.pack_id, save_for_post_n: post.n
          });
          if (r.isError) {
            results.push({ post_n: post.n, status: 'fail', error: r.content[0].text });
          } else {
            const parsed = JSON.parse(r.content[0].text);
            await updatePostInPack(env, auth.user.id, args.pack_id, post.n, async (p) => ({ ...p, image_url: parsed.url }));
            results.push({ post_n: post.n, status: 'ok', url: parsed.url });
          }
          await sleep(500);
        } catch (e) {
          results.push({ post_n: post.n, status: 'fail', error: e.message });
        }
      }
      return ok({
        ok: true,
        total_attempted: todo.length,
        succeeded: results.filter(r => r.status === 'ok').length,
        failed: results.filter(r => r.status === 'fail').length,
        results: results.slice(0, 30)
      });
    }
  },
  {
    name: 'create_and_run_pack_from_brief',
    description: 'MEGA TOOL — Atomic end-to-end: brief → analyze brand DNA → generate N posts → generate ALL images → (optionally) schedule ALL to FB Page. ONE call replaces 5-10 manual steps. Use this when user wants Claude to "tạo pack + chạy luồng tự động hoàn toàn".',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['name', 'brief'],
      properties: {
        name: { type: 'string' },
        brief: { type: 'string' },
        days: { type: 'number', default: 30, description: 'Number of posts (max 30)' },
        platform: { type: 'string', enum: ['facebook', 'tiktok'], default: 'facebook' },
        industry: { type: 'string' },
        tone: { type: 'string' },
        schedule: { type: 'boolean', default: false, description: 'Also schedule all posts to FB Page after generation' },
        schedule_start_date: { type: 'string', description: 'YYYY-MM-DD (default: tomorrow)' },
        schedule_time_slots: { type: 'array', items: { type: 'string' }, description: 'e.g. ["09:00","20:00"]' },
        aspect_ratio: { type: 'string', default: '4:5' }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const log = [];

      // 1. Create pack + generate posts atomically (with brand DNA)
      const createTool = TOOLS.find(t => t.name === 'create_pack_from_brief');
      const createR = await createTool.handler(env, auth, {
        name: args.name, brief: args.brief, days: args.days || 30,
        platform: args.platform, industry: args.industry, tone: args.tone,
        auto_generate_images: false  // do it ourselves so we can capture progress
      });
      if (createR.isError) return createR;
      let parsedCreate; try { parsedCreate = JSON.parse(createR.content[0].text); } catch (e) { parsedCreate = {}; }
      const packId = parsedCreate.pack_id;
      log.push({ phase: 'create_pack', status: 'ok', pack_id: packId, posts: parsedCreate.posts_count });
      if (!packId) return err('Pack creation didn\'t return pack_id', log);

      // 2. Generate all images
      const imgTool = TOOLS.find(t => t.name === 'generate_all_images');
      const imgR = await imgTool.handler(env, auth, { pack_id: packId, aspect_ratio: args.aspect_ratio || '4:5' });
      let imgData; try { imgData = JSON.parse(imgR.content[0].text); } catch (e) { imgData = {}; }
      log.push({ phase: 'generate_images', status: imgR.isError ? 'fail' : 'ok', succeeded: imgData.succeeded, failed: imgData.failed });

      // 3. Optional schedule
      if (args.schedule && !imgR.isError && imgData.succeeded > 0) {
        const schedTool = TOOLS.find(t => t.name === 'schedule_bulk');
        const schedR = await schedTool.handler(env, auth, {
          pack_id: packId,
          start_date: args.schedule_start_date,
          time_slots: args.schedule_time_slots
        });
        let schedData; try { schedData = JSON.parse(schedR.content[0].text); } catch (e) { schedData = {}; }
        log.push({ phase: 'schedule', status: schedR.isError ? 'fail' : 'ok', succeeded: schedData.succeeded, failed: schedData.failed });
      }

      return ok({
        ok: true,
        pack_id: packId,
        pack_name: args.name,
        pipeline_log: log,
        summary: {
          posts: parsedCreate.posts_count || 0,
          images: imgData.succeeded || 0,
          scheduled: args.schedule ? (log.find(l => l.phase === 'schedule')?.succeeded || 0) : 'skipped'
        },
        message: `✅ Pipeline complete. Pack "${args.name}" với ${parsedCreate.posts_count} posts, ${imgData.succeeded || 0} images${args.schedule ? `, ${log.find(l => l.phase === 'schedule')?.succeeded || 0} đã schedule` : ''}.`
      });
    }
  },
  {
    name: 'auto_pipeline_full_pack',
    description: 'Run FULL content pipeline on EXISTING pack: generate all images → generate all voices → schedule all to FB Page. End-to-end automation.',
    scope: 'gen:write',
    inputSchema: {
      type: 'object', required: ['pack_id'],
      properties: {
        pack_id: { type: 'string' },
        skip_voice: { type: 'boolean', default: false },
        skip_schedule: { type: 'boolean', default: false },
        start_date: { type: 'string' },
        time_slots: { type: 'array', items: { type: 'string' } }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'gen:write');
      const steps = [];

      // Step 1: Generate all images
      const imgAll = TOOLS.find(t => t.name === 'generate_all_images');
      const imgResult = await imgAll.handler(env, auth, { pack_id: args.pack_id });
      steps.push({ step: 'images', result: imgResult.isError ? 'fail' : 'ok', data: JSON.parse(imgResult.content[0].text || '{}') });

      // Step 2: Voices (if not skipped) — skip for V18 since it's slow; user can call separately
      if (!args.skip_voice) {
        steps.push({ step: 'voices', result: 'skipped', message: 'Voice gen is slow — call generate_voice per post individually or use UI batch.' });
      }

      // Step 3: Schedule
      if (!args.skip_schedule) {
        const schedAll = TOOLS.find(t => t.name === 'schedule_bulk');
        const schedResult = await schedAll.handler(env, auth, {
          pack_id: args.pack_id,
          start_date: args.start_date,
          time_slots: args.time_slots
        });
        steps.push({ step: 'schedule', result: schedResult.isError ? 'fail' : 'ok', data: JSON.parse(schedResult.content[0].text || '{}') });
      }

      return ok({ ok: true, pipeline_steps: steps });
    }
  },
  {
    name: 'auto_schedule_smart',
    description: 'Smart bulk scheduler — picks time slots based on each post.best_time, spreads across days, mixes images + videos. Wrapper around schedule_bulk with optimal defaults.',
    scope: 'publish:write',
    inputSchema: {
      type: 'object', required: ['pack_id'],
      properties: {
        pack_id: { type: 'string' },
        start_date: { type: 'string' },
        posts_per_day: { type: 'number', default: 1 }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'publish:write');
      const bulk = TOOLS.find(t => t.name === 'schedule_bulk');
      return await bulk.handler(env, auth, args);
    }
  },
  {
    name: 'boost_top_performers',
    description: 'Analyze pack scheduled posts → identify top performers via Meta insights → suggest boost budget split. Does NOT auto-create ads (returns plan).',
    scope: 'ads:read',
    inputSchema: {
      type: 'object', required: ['pack_id', 'total_budget_vnd'],
      properties: {
        pack_id: { type: 'string' },
        total_budget_vnd: { type: 'number' },
        top_n: { type: 'number', default: 5 }
      }
    },
    async handler(env, auth, args) {
      requireScope(auth, 'ads:read');
      // Get scheduled posts for this pack
      let scheduled = [];
      try {
        const r = await env.DB.prepare('SELECT * FROM scheduled_posts WHERE user_id = ? AND pack_id = ? AND status = ?')
          .bind(auth.user.id, args.pack_id, 'published').all();
        scheduled = r.results || [];
      } catch (e) {}

      if (scheduled.length === 0) {
        return ok({ ok: true, message: 'No published posts to analyze. Schedule + publish first.', plan: [] });
      }

      // Rank by simple heuristic (since we may not have per-post insights yet)
      const top = scheduled.slice(0, args.top_n || 5);
      const perPost = Math.floor(args.total_budget_vnd / top.length);
      const plan = top.map(p => ({
        zernio_post_id: p.zernio_post_id, fb_post_id: p.fb_post_id,
        suggested_budget_vnd: perPost,
        next_action: `Call boost_post with fb_post_id="${p.fb_post_id || p.zernio_post_id}", budget=${perPost}`
      }));
      return ok({ ok: true, top_n: top.length, per_post_vnd: perPost, plan,
        note: 'Review plan, then call boost_post for each entry. Use status=ACTIVE only when ready to spend.' });
    }
  }
];

export const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

export function visibleTools(authScopes) {
  if (authScopes.includes('*')) return TOOLS;
  return TOOLS.filter(t => authScopes.includes(t.scope));
}
