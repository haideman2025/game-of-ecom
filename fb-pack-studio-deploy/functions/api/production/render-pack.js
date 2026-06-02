import { json, error, getCurrentUser } from '../../_utils.js';
import { stageMediaToR2 } from '../_zernio.js';

/* V22 — POST /api/production/render-pack
   Generate AI-agnostic production pack từ voice-over: 4 paste-ready prompts cho 4 AI tool khác nhau.

   Architecture inspired by doctor-stone-video-engine skill.

   Input:
   - api_key (Gemini)
   - voice_over (Vietnamese script, 60-120s)
   - brand: { name, channel, character?, visual_style?, palette?, tone? }
   - panel_count (default 8, range 6-12)
   - target_length_seconds (default 80)
   - episode_meta: { day_n, topic, hashtags? }

   Output:
   - HTML pack URL (R2 public)
   - 4 sections inline:
     1. Voice over (formatted + voice direction)
     2. Storyboard master prompt (universal, paste 1 lần → 64 cảnh)
     3. N image prompts (Nano Banana with VN captions embedded)
     4. Veo Omni Flash master prompt (universal, zero-edit, paste N lần)
     5. Production checklist (CapCut + TikTok + hashtags + post time)
*/

// V22 — Updated to May 2026 latest models
const GEMINI_MODELS = {
  text_pro:   'gemini-3-pro',         // hypothetical Q2 2026 release
  text_flash: 'gemini-3-flash',
  image:      'gemini-3-pro-image',   // Nano Banana Pro 3
  video:      'gemini-omni-flash',    // hypothetical video gen May 19 2026
  tts:        'gemini-2.5-flash-preview-tts'
};

export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { api_key, voice_over, brand, panel_count = 8, target_length_seconds = 80, episode_meta = {} } = body;
  const apiKey = api_key || env.GEMINI_API_KEY;
  if (!apiKey) return error('Missing Gemini api_key', 400);
  if (!voice_over || voice_over.length < 80) return error('voice_over too short (min 80 chars)', 400);
  if (!brand?.name) return error('brand.name required', 400);

  const N = Math.max(6, Math.min(12, panel_count));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: Generate all 4 production prompts in 1 Gemini call
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const masterPrompt = `Bạn là production architect cho TikTok edutainment channel.

═══════════════════════════════════
VOICE OVER (input — Vietnamese):
═══════════════════════════════════
${voice_over}

═══════════════════════════════════
BRAND DNA:
═══════════════════════════════════
${JSON.stringify(brand, null, 2)}

═══════════════════════════════════
INTAKE:
═══════════════════════════════════
- Panel count: ${N} (sẽ thành ${N} clip × ~${Math.round(target_length_seconds/N)}s)
- Target video length: ${target_length_seconds}s (9:16 vertical TikTok)
- Episode: ${episode_meta.day_n ? 'DAY ' + episode_meta.day_n + ' · ' : ''}${episode_meta.topic || brand.name}

═══════════════════════════════════
NHIỆM VỤ — Generate JSON với 5 production assets:
═══════════════════════════════════

1. **vo_formatted**: voice_over input chia thành ${N} chunks (mỗi chunk ~${Math.round(target_length_seconds/N)}s VO, ≈ ${Math.round(target_length_seconds/N * 2.4)} từ). Format mỗi chunk thành panel caption — Vietnamese, ngắn gọn, có thể hiển thị on-screen.

2. **voice_direction**: 1 string ngắn (tone + pacing + voice character) để paste vào ElevenLabs / OpenAI TTS / Gemini TTS. Style match brand.tone.

3. **storyboard_master_prompt**: 1 master prompt 200-400 từ để paste vào **NotebookLM hoặc Claude/ChatGPT** → expand thành ${N * 8} cảnh chi tiết (mỗi panel 8 sub-shots). Master prompt phải bao gồm:
   - Brand DNA inline (palette, visual style, character lock if exists)
   - VO injected sẵn ở cuối
   - Instruction structured để AI return ${N * 8} cảnh có camera angle + composition + lighting

4. **image_prompts**: array của ${N} prompts cho **Nano Banana Pro 3 / Midjourney v7 / Flux Pro** — mỗi prompt tạo 1 panel storyboard 2×4 ảnh (8 sub-frames) có Vietnamese caption EMBEDDED dưới mỗi frame. Mỗi prompt:
   - panel_n: 1-${N}
   - vo_chunk: text VO của panel này
   - prompt: detailed English prompt 80-150 từ với:
     * Aspect ratio 9:16
     * Brand visual style locked
     * VN caption "${'“'}<caption Vietnamese>${'”'}" embedded text dưới mỗi sub-frame
     * Character continuity nếu có brand.character
     * 8 sub-frames per panel mô tả progression của VO chunk này

5. **veo_master_prompt**: 1 universal prompt cho **Veo / Gemini Omni Flash** dùng được cho cả ${N} clips (zero-edit per clip). Prompt phải:
   - 9:16 vertical 10s per clip
   - Reference input image (panel storyboard)
   - Motion language khớp brand.tone (calm/dynamic/dramatic)
   - Voice over sync — Veo tự đọc Vietnamese caption embedded
   - Camera movement subtle (dolly in / pan / static)

6. **production_checklist**: object {
   - tiktok_caption: short caption tiếng Việt + 1-2 emoji
   - hashtags: array 15-20 hashtags relevant + niche
   - posting_time: best time of day cho audience
   - capcut_workflow: 4-5 step bullet list
   - qc_checks: array 6-10 boolean checks trước khi post
}

Return JSON ONLY, no preamble. Use exact field names above.`;

  // Call Gemini directly server-side (will use api_key — if geo-block hits, frontend should call directly)
  let pack;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS.text_pro}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: masterPrompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.75, maxOutputTokens: 32768 }
      })
    });
    if (!r.ok) {
      const errText = await r.text();
      // Geo-block fallback: try gemini-3-flash (or 2.5-flash if 3-flash not available)
      if (r.status === 400 && errText.includes('location')) {
        return error('Gemini edge geo-block — call from browser. Use frontend handler instead.', 400);
      }
      // Try fallback model
      const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS.text_flash}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: masterPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.75, maxOutputTokens: 32768 }
        })
      });
      if (!r2.ok) {
        const e2 = await r2.text();
        return error(`Gemini fail: ${e2.slice(0, 300)}`, 502);
      }
      const d2 = await r2.json();
      pack = JSON.parse(d2.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    } else {
      const d = await r.json();
      pack = JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    }
  } catch (e) {
    return error('Generate prompts: ' + e.message, 500);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: Render HTML pack
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const html = renderProductionPackHtml({ brand, episode_meta, voice_over, target_length_seconds, panel_count: N, pack });

  // Stage to R2
  let publicUrl;
  try {
    const bytes = new TextEncoder().encode(html);
    const slug = (brand.name + '-' + (episode_meta.day_n || Date.now())).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    const staged = await stageMediaToR2(env, request, user.id, {
      filename: `production-pack-${slug}.html`,
      mime: 'text/html',
      bytes
    });
    publicUrl = staged.url;
  } catch (e) {
    return error('R2 stage: ' + e.message, 500);
  }

  return json({
    ok: true,
    pack_url: publicUrl,
    panel_count: N,
    target_length_seconds,
    raw_pack: pack
  });
}

// ──────────────────────────────────────────
// HTML pack renderer — mobile-first, vintage cinematic
// ──────────────────────────────────────────
function renderProductionPackHtml({ brand, episode_meta, voice_over, target_length_seconds, panel_count, pack }) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const imgPromptsHtml = (pack.image_prompts || []).map((p, i) => `
    <div class="card">
      <div class="card-h">
        <span class="panel-n">Panel ${p.panel_n || (i+1)}/${panel_count}</span>
        <button class="copy-btn" onclick="copyTxt(this, 'img-${i}')">📋 Copy prompt</button>
      </div>
      ${p.vo_chunk ? `<div class="vo-chunk">🎙️ VO: <i>"${esc(p.vo_chunk)}"</i></div>` : ''}
      <pre id="img-${i}">${esc(p.prompt || '')}</pre>
    </div>
  `).join('');

  const qcHtml = (pack.production_checklist?.qc_checks || []).map(c => `<label class="check"><input type="checkbox"/><span>${esc(c)}</span></label>`).join('');
  const hashtagsHtml = (pack.production_checklist?.hashtags || []).map(h => `<span class="tag">${esc(h.startsWith('#') ? h : '#' + h)}</span>`).join(' ');

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Production Pack · ${esc(brand.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Crimson+Pro:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:${esc(brand.palette?.bg || '#F5EFE4')};--ink:${esc(brand.palette?.ink || '#3A2818')};--mut:${esc(brand.palette?.mut || '#7A5230')};--gold:${esc(brand.palette?.gold || '#D4A93C')};--accent:${esc(brand.palette?.accent || '#B8593C')};--card:${esc(brand.palette?.card || '#FAF5EA')}}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Crimson Pro',Georgia,serif;background:var(--bg);color:var(--ink);line-height:1.6;padding:0 0 80px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/></svg>")}
.wrap{max-width:780px;margin:0 auto;padding:20px}
.hero{background:linear-gradient(135deg,var(--card) 0%,#fff7e8 100%);border:1px solid var(--gold);border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 4px 20px -8px rgba(122,82,48,0.2)}
.hero-tag{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:8px}
.hero h1{font-family:'DM Serif Display',serif;font-size:32px;color:var(--ink);line-height:1.1;margin-bottom:6px}
.hero-meta{color:var(--mut);font-size:14px;font-style:italic}
.section{background:var(--card);border:1px solid rgba(122,82,48,0.15);border-radius:14px;margin-bottom:16px;overflow:hidden}
.sect-h{padding:14px 18px;background:linear-gradient(90deg,var(--card),#fff);border-bottom:1px solid rgba(122,82,48,0.1);display:flex;align-items:center;justify-content:space-between;gap:10px}
.sect-h h2{font-family:'DM Serif Display',serif;font-size:20px;color:var(--ink);line-height:1.1}
.sect-h .num{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gold);background:rgba(212,169,60,0.1);padding:3px 8px;border-radius:6px;font-weight:600}
.sect-body{padding:18px}
.card{background:#fff;border:1px solid rgba(122,82,48,0.1);border-radius:10px;padding:14px;margin-bottom:10px}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.panel-n{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);font-weight:600;background:rgba(184,89,60,0.08);padding:3px 8px;border-radius:6px}
.copy-btn{background:var(--ink);color:var(--bg);border:none;padding:8px 14px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;transition:transform .15s,background .15s}
.copy-btn:active{transform:scale(0.95)}
.copy-btn.ok{background:#2D7A3F}
.vo-chunk{font-style:italic;color:var(--mut);font-size:13px;margin-bottom:10px;padding:8px 12px;background:rgba(212,169,60,0.05);border-left:3px solid var(--gold);border-radius:0 6px 6px 0}
pre{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink);background:#fafafa;border:1px solid rgba(0,0,0,.05);padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;line-height:1.5;max-height:280px;overflow-y:auto}
.vo-script{font-family:'Crimson Pro',serif;font-size:16px;line-height:1.8;color:var(--ink);padding:14px 18px;background:#fff;border-radius:8px;border-left:4px solid var(--gold)}
.voice-dir{margin-top:12px;padding:10px 14px;background:rgba(184,89,60,0.05);border-radius:8px;font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--mut)}
.check{display:flex;align-items:flex-start;gap:10px;padding:8px 0;font-size:14px;cursor:pointer}
.check input{margin-top:4px;cursor:pointer}
.checklist-grid{display:grid;grid-template-columns:1fr;gap:8px}
@media(min-width:600px){.checklist-grid{grid-template-columns:1fr 1fr}}
.tag{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;background:rgba(58,40,24,0.06);color:var(--mut);padding:3px 8px;border-radius:6px;margin:2px}
.cap-box{padding:12px 16px;background:#fff;border-radius:8px;border:1px dashed var(--gold);font-size:14px;margin-bottom:12px;position:relative}
.cap-box .copy-btn{position:absolute;top:8px;right:8px}
.workflow-step{display:flex;gap:12px;padding:10px;background:#fff;border-radius:8px;margin-bottom:6px;align-items:flex-start}
.workflow-step .step-n{font-family:'DM Serif Display',serif;color:var(--gold);font-size:20px;line-height:1;width:24px;flex-shrink:0}
.nav{position:fixed;bottom:0;left:0;right:0;background:rgba(245,239,228,0.95);backdrop-filter:blur(12px);border-top:1px solid rgba(122,82,48,0.2);padding:8px;display:flex;gap:4px;overflow-x:auto;z-index:10}
.nav a{flex-shrink:0;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;padding:8px 14px;background:#fff;border:1px solid rgba(122,82,48,0.15);border-radius:20px;color:var(--mut);text-decoration:none;letter-spacing:.05em}
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
    <p style="color:var(--mut);font-size:13px;margin-bottom:12px;font-style:italic">Paste prompt này 1 lần vào <b>NotebookLM</b> hoặc <b>Claude/ChatGPT</b> → AI sẽ expand thành ${panel_count * 8} cảnh chi tiết.</p>
    <div class="card">
      <div class="card-h"><span class="panel-n">Universal Master</span><button class="copy-btn" onclick="copyTxt(this, 'sb-master')">📋 Copy</button></div>
      <pre id="sb-master">${esc(pack.storyboard_master_prompt || '')}</pre>
    </div>
  </div>
</section>

<section id="images" class="section">
  <div class="sect-h"><h2>🖼️ Image Prompts (${panel_count})</h2><span class="num">SECTION 3</span></div>
  <div class="sect-body">
    <p style="color:var(--mut);font-size:13px;margin-bottom:12px;font-style:italic">Paste mỗi prompt vào <b>Gemini Nano Banana Pro 3</b> / Midjourney v7 / Flux Pro. Caption Vietnamese đã embedded — image gen sẽ render text vào ảnh.</p>
    ${imgPromptsHtml}
  </div>
</section>

<section id="veo" class="section">
  <div class="sect-h"><h2>🎥 Veo Omni Flash Master</h2><span class="num">SECTION 4</span></div>
  <div class="sect-body">
    <p style="color:var(--mut);font-size:13px;margin-bottom:12px;font-style:italic">Master prompt universal — paste ${panel_count} lần vào <b>Gemini Omni Flash / Veo 3</b>, mỗi lần với 1 panel image làm reference. Zero-edit between clips.</p>
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
    <pre id="tags" style="display:none">${(pack.production_checklist?.hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' ')}</pre>

    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin:18px 0 10px">⏰ Best posting time</h3>
    <div style="font-family:'JetBrains Mono',monospace;color:var(--accent);font-weight:600;font-size:14px">${esc(pack.production_checklist?.posting_time || 'Anytime')}</div>

    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin:18px 0 10px">🎬 CapCut Workflow</h3>
    ${(pack.production_checklist?.capcut_workflow || []).map((step, i) => `<div class="workflow-step"><div class="step-n">${i+1}</div><div>${esc(step)}</div></div>`).join('')}

    <h3 style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--ink);margin:18px 0 10px">🔍 QC Checklist (tick trước khi post)</h3>
    <div class="checklist-grid">${qcHtml}</div>

  </div>
</section>

</div>

<nav class="nav">
  <a href="#vo">🎙️ VO</a>
  <a href="#storyboard">📝 Storyboard</a>
  <a href="#images">🖼️ Images</a>
  <a href="#veo">🎥 Veo</a>
  <a href="#checklist">✅ Checklist</a>
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
    setTimeout(() => {
      btn.classList.remove('ok');
      btn.textContent = orig;
      document.getElementById('toast').classList.remove('show');
    }, 1500);
  });
}
</script>
</body></html>`;
}
