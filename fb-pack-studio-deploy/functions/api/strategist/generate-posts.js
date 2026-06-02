import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* POST /api/strategist/generate-posts
   Body: { pack_id, api_key, model?, strategy?, day_from?, day_to?, project_meta? }
   Generates a range of fully-formed posts (caption + image_prompt + hashtags + best_time)
   GROUNDED in vault + strategy. Output array of post objects ready để paste vào pack. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { pack_id, api_key, model: modelOverride, day_from = 1, day_to = 30, project_meta, brand: brandFromBody } = body;
  let strategy = body.strategy;

  if (!pack_id) return error('Missing pack_id');
  if (!api_key) return error('Missing api_key (Gemini)');
  if (day_from < 1 || day_to > 90 || day_to < day_from) return error('Invalid day range (1-90, from≤to)');
  if (day_to - day_from + 1 > 30) return error('Tối đa 30 ngày/call. Split thành nhiều chunks.', 400);

  try { await requireCap(env, pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Load vault (compact text only for context fit)
  const vaultRes = await env.DB.prepare(
    `SELECT id, filename, content_text, content_summary FROM vault_files WHERE pack_id = ? ORDER BY created_at ASC`
  ).bind(pack_id).all();
  const vault = vaultRes.results || [];

  // Use latest completed strategy if not provided
  if (!strategy) {
    const latestRun = await env.DB.prepare(
      `SELECT strategy_json FROM strategist_runs WHERE pack_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`
    ).bind(pack_id).first();
    if (latestRun?.strategy_json) {
      try { strategy = JSON.parse(latestRun.strategy_json); } catch (e) {}
    }
  }
  // V14.15 — Fallback: build minimal strategy from brand body if no D1 strategy yet
  if (!strategy && brandFromBody) {
    const b = brandFromBody;
    const defaultPillars = (b.pillars && b.pillars.length)
      ? b.pillars.map(p => typeof p === 'string' ? { name: p } : p)
      : [{ name: 'Awareness · Brand story' }, { name: 'Consideration · Value/Trust' }, { name: 'Conversion · Offer/CTA' }];
    strategy = {
      brand_dna: {
        name: b.name || 'Brand',
        voice: b.voice || 'thân thiện, dễ hiểu',
        audience: b.audience || '',
        usp: b.usp || '',
        positioning: b.positioning || '',
        insight: b.insight || ''
      },
      pillars: defaultPillars,
      content_calendar_30d: []
    };
  }
  if (!strategy) return error('Chưa có strategy. Run AI Strategist hoặc pass brand object trong body.', 400);

  // Build compact source context (4000 chars per file)
  const sourceBlock = vault.length > 0
    ? vault.map((v, i) => `[SRC ${i+1}] ${v.filename}\n${(v.content_text || v.content_summary || '').slice(0, 4000)}`).join('\n\n---\n\n')
    : '(Vault trống — viết general dựa trên brand DNA + pillars, KHÔNG bịa số liệu cụ thể)';

  // Filter calendar to requested range — or build inline if calendar empty
  let calendar = (strategy.content_calendar_30d || []).filter(c => c.day >= day_from && c.day <= day_to);
  if (calendar.length === 0) {
    // V14.15 — Build calendar items on the fly for requested day range
    const pillarsArr = strategy.pillars || [];
    const themes = ['Hook về pain point', 'Tip thực tế', 'Customer transformation', 'Behind the scenes', 'Product/Service spotlight', 'Common myth bust', 'Quick win', 'Trust signal', 'Compare', 'Case story'];
    calendar = [];
    for (let d = day_from; d <= day_to; d++) {
      const pillarN = ((d - 1) % Math.max(1, pillarsArr.length)) + 1;
      calendar.push({
        day: d,
        pillar: pillarN,
        theme: themes[(d - 1) % themes.length] + ` (Day ${d})`,
        hook: '',
        format: 'feed'
      });
    }
  }

  const systemPrompt = `Bạn là content writer cho brand "${strategy.brand_dna?.name || 'Brand'}" target Vietnamese audience.
NGUYÊN TẮC TUYỆT ĐỐI:
1. KHÔNG bịa data. Mọi fact/stat/quote chỉ rút từ SOURCE DOCUMENTS dưới. Nếu cần fact mà source không có → viết general, KHÔNG bịa con số.
2. Voice: ${strategy.brand_dna?.voice || 'thân thiện, dễ hiểu'}
3. Positioning: ${strategy.brand_dna?.positioning || ''}
4. Customer insight gốc: ${strategy.brand_dna?.insight || ''}
5. Output strict JSON array — không preamble.`;

  const userPrompt = `# SOURCE DOCUMENTS (cite [SRC N] khi rút fact)
${sourceBlock}

# STRATEGY (đã có sẵn)
- Audience: ${strategy.brand_dna?.audience || ''}
- USP: ${strategy.brand_dna?.usp || ''}
- Pillars: ${(strategy.pillars || []).map((p, i) => `P${i+1}=${p.name}`).join(' · ')}

# YÊU CẦU
Generate ${calendar.length} posts theo calendar dưới đây. Mỗi post gồm:
- title: ≤80 chars, attention-grabbing
- caption: 200-500 chars tiếng Việt natural, hook ngay câu đầu, dẫn dắt + CTA cuối. Inline cite [SRC N] nếu dùng fact từ source.
- image_prompt: 50-120 từ tiếng Anh, mô tả ảnh AI cụ thể (composition, mood, color, style — KHÔNG generic "professional photo")
- first_comment: 100-200 chars VN, mời tương tác
- hashtags: array 5-8 hashtag Việt + topic
- best_time: HH:MM (chọn time phù hợp post theme + audience)
- ground_sources: array source_idx nếu post rút fact từ source

# CALENDAR
${calendar.map(c => `Day ${c.day} · Pillar ${c.pillar} · Theme: "${c.theme}" · Hook hint: "${c.hook}" · Format: ${c.format}`).join('\n')}

# OUTPUT JSON SCHEMA
\`\`\`json
{
  "posts": [
    {
      "n": 1, "day": 1, "pillar": 1, "aspect_ratio": "1:1",
      "title": "...", "caption": "...",
      "image_prompt": "...", "image_direction": "1 câu hướng dẫn camera/composition",
      "first_comment": "...", "hashtags": ["#tag1", "#tag2"],
      "best_time": "20:00",
      "ground_sources": [1, 2]
    }
  ]
}
\`\`\`
Output JSON only.`;

  const model = modelOverride || 'gemini-2.5-pro';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
          temperature: 0.7,
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
    return error('Gen posts failed: ' + e.message, 502);
  }

  const txt = gemResp.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let parsed;
  try {
    parsed = JSON.parse(txt);
  } catch (e) {
    const cleaned = txt.replace(/```(?:json)?/g, '').trim();
    try { parsed = JSON.parse(cleaned); }
    catch (e2) { return error('Posts JSON parse failed: ' + e2.message + ' · raw len: ' + txt.length, 500); }
  }

  const posts = parsed.posts || parsed || [];
  if (!Array.isArray(posts)) return error('Output không phải array posts', 500);

  return json({
    ok: true,
    posts,
    count: posts.length,
    day_range: [day_from, day_to],
    vault_used: vault.length,
    tokens: gemResp.usageMetadata
  });
}
