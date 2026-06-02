import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* POST /api/strategist/extend-day
   Body: { pack_id, api_key, model?, existing_posts: [{title, caption}], next_day_n?, next_pillar? }
   Generates the NEXT day post, grounded in vault + strategy, anti-duplicate against existing. */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { pack_id, api_key, model: modelOverride, existing_posts = [], next_day_n, next_pillar, brand: brandFromBody } = body;
  if (!pack_id) return error('Missing pack_id');
  if (!api_key) return error('Missing api_key');

  try { await requireCap(env, pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Load vault + latest strategy
  const vaultRes = await env.DB.prepare(
    `SELECT id, filename, content_text, content_summary FROM vault_files WHERE pack_id = ? ORDER BY created_at ASC`
  ).bind(pack_id).all();
  const vault = vaultRes.results || [];

  const latestRun = await env.DB.prepare(
    `SELECT strategy_json FROM strategist_runs WHERE pack_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`
  ).bind(pack_id).first();
  let strategy = null;
  if (latestRun?.strategy_json) {
    try { strategy = JSON.parse(latestRun.strategy_json); } catch (e) {}
  }
  // V14.15 — Fallback: build minimal strategy from brand body if no D1 strategy
  if (!strategy && brandFromBody) {
    const b = brandFromBody;
    const defaultPillars = (b.pillars && b.pillars.length)
      ? b.pillars.map(p => typeof p === 'string' ? { name: p } : p)
      : [{ name: 'Awareness' }, { name: 'Consideration' }, { name: 'Conversion' }];
    strategy = {
      brand_dna: {
        name: b.name || 'Brand',
        voice: b.voice || 'thân thiện, dễ hiểu',
        audience: b.audience || '',
        usp: b.usp || '',
        positioning: b.positioning || '',
        insight: b.insight || ''
      },
      pillars: defaultPillars
    };
  }

  // Calculate next day if not provided
  const maxN = existing_posts.length > 0
    ? Math.max(...existing_posts.map(p => p.n || p.day || 0))
    : 0;
  const dayN = next_day_n || (maxN + 1);

  // Pick pillar via round-robin if not provided
  const pillarN = next_pillar || ((dayN - 1) % 3 + 1);

  // Compact source
  const sourceBlock = vault.length > 0
    ? vault.slice(0, 8).map((v, i) => `[SRC ${i+1}] ${v.filename}\n${(v.content_text || v.content_summary || '').slice(0, 3000)}`).join('\n\n---\n\n')
    : '(vault trống — viết general từ brand DNA, KHÔNG bịa số liệu)';

  // Last 5 posts for anti-duplicate context
  const recentTitles = existing_posts.slice(-10).map(p => `Day ${p.n||p.day}: ${(p.title || p.caption || '').slice(0,80)}`).join('\n');

  const systemPrompt = `Bạn là content writer cho brand "${strategy?.brand_dna?.name || 'Brand'}".
NGUYÊN TẮC:
1. KHÔNG bịa data. Cite [SRC N] khi rút fact.
2. KHÔNG lặp ý/theme với 5 post gần nhất — phải đem góc nhìn MỚI.
3. Voice: ${strategy?.brand_dna?.voice || 'thân thiện, dễ hiểu'}
4. Output strict JSON, no preamble.`;

  const userPrompt = `# SOURCES
${sourceBlock || '(vault empty — viết general dựa trên strategy)'}

# STRATEGY
- Audience: ${strategy?.brand_dna?.audience || ''}
- USP: ${strategy?.brand_dna?.usp || ''}
- Pillars: ${(strategy?.pillars || []).map((p,i)=>`P${i+1}=${p.name}`).join(' · ') || 'P1=Awareness · P2=Consideration · P3=Conversion'}

# 10 BÀI GẦN NHẤT (avoid lặp)
${recentTitles || '(chưa có post nào)'}

# YÊU CẦU: Generate 1 post DUY NHẤT cho Day ${dayN}, Pillar ${pillarN}
Schema:
\`\`\`json
{
  "post": {
    "n": ${dayN}, "day": ${dayN}, "pillar": ${pillarN}, "aspect_ratio": "1:1",
    "title": "≤80 chars",
    "caption": "200-500 chars VN, hook + CTA, cite [SRC N] nếu dùng fact",
    "image_prompt": "50-120 từ EN cụ thể",
    "image_direction": "1 câu camera/composition",
    "first_comment": "100-200 chars VN mời tương tác",
    "hashtags": ["#tag1", "#tag2"],
    "best_time": "HH:MM",
    "ground_sources": [1, 2]
  }
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
          temperature: 0.8, // higher for variety
          maxOutputTokens: 8192
        }
      })
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    gemResp = await r.json();
  } catch (e) {
    return error('Extend failed: ' + e.message, 502);
  }

  const txt = gemResp.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let parsed;
  try { parsed = JSON.parse(txt); }
  catch (e) {
    const cleaned = txt.replace(/```(?:json)?/g, '').trim();
    try { parsed = JSON.parse(cleaned); }
    catch (e2) { return error('Parse failed: ' + e2.message, 500); }
  }

  const post = parsed.post || parsed;
  if (!post?.caption) return error('Invalid post output', 500);

  return json({
    ok: true,
    post,
    day_n: dayN,
    pillar_n: pillarN,
    vault_used: vault.length,
    strategy_used: !!strategy
  });
}
