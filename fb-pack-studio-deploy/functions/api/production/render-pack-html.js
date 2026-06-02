import { json, error, getCurrentUser } from '../../_utils.js';
import { stageMediaToR2 } from '../_zernio.js';

/* V22 — POST /api/production/render-pack-html
   Render HTML pack từ pre-built prompts (Gemini đã call browser-side).
   Backend chỉ stage to R2, không call AI.
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { brand, episode_meta = {}, voice_over, target_length_seconds = 80, panel_count = 8, pack } = body;
  if (!brand?.name || !voice_over || !pack) return error('Missing brand.name / voice_over / pack', 400);

  const html = renderHtml({ brand, episode_meta, voice_over, target_length_seconds, panel_count, pack });

  try {
    const bytes = new TextEncoder().encode(html);
    const slug = (brand.name + '-' + (episode_meta.day_n || Date.now())).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    const staged = await stageMediaToR2(env, request, user.id, {
      filename: `production-pack-${slug}.html`,
      mime: 'text/html',
      bytes
    });
    return json({ ok: true, pack_url: staged.url, panel_count, target_length_seconds });
  } catch (e) {
    return error('R2 stage: ' + e.message, 500);
  }
}

function renderHtml({ brand, episode_meta, voice_over, target_length_seconds, panel_count, pack }) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const imgPromptsHtml = (pack.image_prompts || []).map((p, i) => `
    <div class="card">
      <div class="card-h">
        <span class="panel-n">Panel ${p.panel_n || (i+1)}/${panel_count}</span>
        <button class="copy-btn" onclick="copyTxt(this, 'img-${i}')">📋 Copy prompt</button>
      </div>
      ${p.vo_chunk ? `<div class="vo-chunk">🎙️ <i>"${esc(p.vo_chunk)}"</i></div>` : ''}
      <pre id="img-${i}">${esc(p.prompt || '')}</pre>
    </div>
  `).join('');

  const qcHtml = (pack.production_checklist?.qc_checks || []).map(c => `<label class="check"><input type="checkbox"/><span>${esc(c)}</span></label>`).join('');
  const hashtags = pack.production_checklist?.hashtags || [];
  const hashtagsHtml = hashtags.map(h => `<span class="tag">${esc(h.startsWith('#') ? h : '#' + h)}</span>`).join(' ');

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Production Pack · ${esc(brand.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Crimson+Pro:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:${esc(brand.palette?.bg || '#F5EFE4')};--ink:${esc(brand.palette?.ink || '#3A2818')};--mut:${esc(brand.palette?.mut || '#7A5230')};--gold:${esc(brand.palette?.gold || '#D4A93C')};--accent:${esc(brand.palette?.accent || '#B8593C')};--card:${esc(brand.palette?.card || '#FAF5EA')}}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:'Crimson Pro',Georgia,serif;background:var(--bg);color:var(--ink);line-height:1.6;padding:0 0 80px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/></svg>")}
.wrap{max-width:780px;margin:0 auto;padding:20px}
.hero{background:linear-gradient(135deg,var(--card) 0%,#fff7e8 100%);border:1px solid var(--gold);border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 4px 20px -8px rgba(122,82,48,0.2)}
.hero-tag{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:8px}
.hero h1{font-family:'DM Serif Display',serif;font-size:32px;color:var(--ink);line-height:1.1;margin-bottom:6px}
.hero-meta{color:var(--mut);font-size:14px;font-style:italic}
.section{background:var(--card);border:1px solid rgba(122,82,48,0.15);border-radius:14px;margin-bottom:16px;overflow:hidden}
.sect-h{padding:14px 18px;background:linear-gradient(90deg,var(--card),#fff);border-bottom:1px solid rgba(122,82,48,0.1);display:flex;align-items:center;justify-content:space-between;gap:10px}
.sect-h h2{font-family:'DM Serif Display',serif;font-size:20px;color:var(--ink)}
.sect-h .num{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gold);background:rgba(212,169,60,0.1);padding:3px 8px;border-radius:6px;font-weight:600}
.sect-body{padding:18px}
.card{background:#fff;border:1px solid rgba(122,82,48,0.1);border-radius:10px;padding:14px;margin-bottom:10px}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.panel-n{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);font-weight:600;background:rgba(184,89,60,0.08);padding:3px 8px;border-radius:6px}
.copy-btn{background:var(--ink);color:var(--bg);border:none;padding:8px 14px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;transition:transform .15s,background .15s}
.copy-btn:active{transform:scale(0.95)}.copy-btn.ok{background:#2D7A3F}
.vo-chunk{font-style:italic;color:var(--mut);font-size:13px;margin-bottom:10px;padding:8px 12px;background:rgba(212,169,60,0.05);border-left:3px solid var(--gold);border-radius:0 6px 6px 0}
pre{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink);background:#fafafa;border:1px solid rgba(0,0,0,.05);padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;line-height:1.5;max-height:280px;overflow-y:auto}
.vo-script{font-family:'Crimson Pro',serif;font-size:16px;line-height:1.8;color:var(--ink);padding:14px 18px;background:#fff;border-radius:8px;border-left:4px solid var(--gold)}
.voice-dir{margin-top:12px;padding:10px 14px;background:rgba(184,89,60,0.05);border-radius:8px;font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--mut)}
.check{display:flex;align-items:flex-start;gap:10px;padding:8px 0;font-size:14px;cursor:pointer}
.check input{margin-top:4px}
.checklist-grid{display:grid;grid-template-columns:1fr;gap:8px}
@media(min-width:600px){.checklist-grid{grid-template-columns:1fr 1fr}}
.tag{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;background:rgba(58,40,24,0.06);color:var(--mut);padding:3px 8px;border-radius:6px;margin:2px}
.cap-box{padding:12px 16px;background:#fff;border-radius:8px;border:1px dashed var(--gold);font-size:14px;margin-bottom:12px;position:relative}
.cap-box .copy-btn{position:absolute;top:8px;right:8px}
.workflow-step{display:flex;gap:12px;padding:10px;background:#fff;border-radius:8px;margin-bottom:6px}
.workflow-step .step-n{font-family:'DM Serif Display',serif;color:var(--gold);font-size:20px;width:24px;flex-shrink:0}
.nav{position:fixed;bottom:0;left:0;right:0;background:rgba(245,239,228,0.95);backdrop-filter:blur(12px);border-top:1px solid rgba(122,82,48,0.2);padding:8px;display:flex;gap:4px;overflow-x:auto;z-index:10}
.nav a{flex-shrink:0;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;padding:8px 14px;background:#fff;border:1px solid rgba(122,82,48,0.15);border-radius:20px;color:var(--mut);text-decoration:none}
.nav a:hover{background:var(--gold);color:var(--bg)}
.toast{position:fixed;top:20px;right:20px;background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:12px;opacity:0;pointer-events:none;transition:opacity .3s}
.toast.show{opacity:1}
</style></head>
<body>
<div class="wrap">

<div class="hero">
  <div class="hero-tag">🎬 Production Pack · V22</div>
  <h1>${esc(brand.name)}</h1>
  <div class="hero-meta">${episode_meta.day_n ? 'Day ' + episode_meta.day_n + ' · ' : ''}${esc(episode_meta.topic || '')} · ${target_length_seconds}s · ${panel_count} panels</div>
</div>

<section id="vo" class="section">
  <div class="sect-h"><h2>🎙️ Voice Over</h2><span class="num">SECTION 1</span></div>
  <div class="sect-body">
    <div class="vo-script">${esc(voice_over).replace(/\n/g, '<br/>')}</div>
    ${pack.voice_direction ? `<div class="voice-dir"><b>Voice direction:</b> ${esc(pack.voice_direction)}</div>` : ''}
    <button class="copy-btn" style="margin-top:12px" onclick="copyTxt(this, 'vo-text')">📋 Copy VO script</button>
    <pre id="vo-text" style="display:none">${esc(voice_over)}</pre>
  </div>
</section>

<section id="storyboard" class="section">
  <div class="sect-h"><h2>📝 Storyboard Master Prompt</h2><span class="num">SECTION 2</span></div>
  <div class="sect-body">
    <p style="color:var(--mut);font-size:13px;margin-bottom:12px;font-style:italic">Paste prompt này 1 lần vào <b>NotebookLM / Claude / ChatGPT</b> → AI sẽ expand thành ${panel_count * 8} cảnh chi tiết.</p>
    <div class="card">
      <div class="card-h"><span class="panel-n">Universal Master</span><button class="copy-btn" onclick="copyTxt(this, 'sb-master')">📋 Copy</button></div>
      <pre id="sb-master">${esc(pack.storyboard_master_prompt || '')}</pre>
    </div>
  </div>
</section>

<section id="images" class="section">
  <div class="sect-h"><h2>🖼️ Image Prompts (${panel_count})</h2><span class="num">SECTION 3</span></div>
  <div class="sect-body">
    <p style="color:var(--mut);font-size:13px;margin-bottom:12px;font-style:italic">Paste mỗi prompt vào <b>Gemini Nano Banana Pro 3 / Midjourney v7 / Flux Pro</b>. Caption Vietnamese đã embedded → image gen render text vào ảnh.</p>
    ${imgPromptsHtml}
  </div>
</section>

<section id="veo" class="section">
  <div class="sect-h"><h2>🎥 Veo Omni Flash Master</h2><span class="num">SECTION 4</span></div>
  <div class="sect-body">
    <p style="color:var(--mut);font-size:13px;margin-bottom:12px;font-style:italic">Master prompt universal — paste ${panel_count} lần vào <b>Gemini Omni Flash / Veo 3</b>, mỗi lần với 1 panel image làm reference. Zero-edit.</p>
    <div class="card">
      <div class="card-h"><span class="panel-n">Universal Veo</span><button class="copy-btn" onclick="copyTxt(this, 'veo-master')">📋 Copy</button></div>
      <pre id="veo-master">${esc(pack.veo_master_prompt || '')}</pre>
    </div>
  </div>
</section>

<section id="checklist" class="section">
  <div class="sect-h"><h2>✅ Production Checklist</h2><span class="num">SECTION 5</span></div>
  <div class="sect-body">
    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin-bottom:10px">📱 TikTok Caption</h3>
    <div class="cap-box">${esc(pack.production_checklist?.tiktok_caption || '')}<button class="copy-btn" onclick="copyTxt(this, 'tk-cap')">📋</button><pre id="tk-cap" style="display:none">${esc(pack.production_checklist?.tiktok_caption || '')}</pre></div>

    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin:18px 0 10px">🏷️ Hashtags</h3>
    <div style="margin-bottom:10px;line-height:2">${hashtagsHtml}</div>
    <button class="copy-btn" onclick="copyTxt(this, 'tags')">📋 Copy all hashtags</button>
    <pre id="tags" style="display:none">${hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' ')}</pre>

    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin:18px 0 10px">⏰ Best posting time</h3>
    <div style="font-family:'JetBrains Mono',monospace;color:var(--accent);font-weight:600;font-size:14px">${esc(pack.production_checklist?.posting_time || 'Anytime')}</div>

    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin:18px 0 10px">🎬 CapCut Workflow</h3>
    ${(pack.production_checklist?.capcut_workflow || []).map((step, i) => `<div class="workflow-step"><div class="step-n">${i+1}</div><div>${esc(step)}</div></div>`).join('')}

    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin:18px 0 10px">🔍 QC Checklist</h3>
    <div class="checklist-grid">${qcHtml}</div>
  </div>
</section>

</div>

<nav class="nav">
  <a href="#vo">🎙️ VO</a><a href="#storyboard">📝 Storyboard</a><a href="#images">🖼️ Images</a><a href="#veo">🎥 Veo</a><a href="#checklist">✅ Checklist</a>
</nav>

<div class="toast" id="toast">📋 Copied to clipboard</div>

<script>
function copyTxt(btn, id) {
  const txt = document.getElementById(id)?.textContent || '';
  navigator.clipboard.writeText(txt).then(() => {
    btn.classList.add('ok');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    document.getElementById('toast').classList.add('show');
    setTimeout(() => { btn.classList.remove('ok'); btn.textContent = orig; document.getElementById('toast').classList.remove('show'); }, 1500);
  });
}
</script>
</body></html>`;
}
