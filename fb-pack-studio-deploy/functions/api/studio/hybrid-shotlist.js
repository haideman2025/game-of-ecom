import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* V14.26 — POST /api/studio/hybrid-shotlist
   Body: {
     pack_id, api_key, model?,
     voice_script: string,          // full voice-over text (for context)
     voice_duration_ms: number,     // total voice length
     storyboard_scenes: [{          // ordered storyboard images
       id, sceneN, caption, t_start_ms, t_end_ms
     }],
     raw_videos: [{                 // raw footage available (per-post + pack-wide)
       id, filename, name, duration_ms, scope: 'post'|'pack', tags?: string[]
     }],
     post_context?: { title, caption }
   }

   Output: {
     ok: true,
     shots: [{
       src: 'storyboard'|'raw',
       asset_id: string,            // refs storyboard.id or raw_videos.id
       t_start_ms, t_end_ms,
       reason: string               // editor's note
     }],
     total_ms,
     raw_used: number,
     storyboard_used: number
   }

   AI rules (in system prompt): Gemini decides WHICH storyboard scenes to REPLACE
   with raw footage. Anchored on voice length. Storyboard scene timing preserved
   (don't add/remove total runtime). Raw video clips slot into existing scene
   windows (trimmed if longer than the slot). */
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const {
    pack_id, api_key, model: modelOverride,
    voice_script = '', voice_duration_ms = 0,
    storyboard_scenes = [], raw_videos = [],
    post_context
  } = body;

  if (!pack_id) return error('Missing pack_id');
  if (!api_key) return error('Missing api_key (Gemini)');
  if (!Array.isArray(storyboard_scenes) || storyboard_scenes.length === 0) {
    return error('storyboard_scenes empty — không có scene để build', 400);
  }
  if (!Array.isArray(raw_videos) || raw_videos.length === 0) {
    return error('raw_videos empty — upload raw video trước khi dùng Hybrid mode', 400);
  }

  try { await requireCap(env, pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  // Build compact context for Gemini
  const sceneList = storyboard_scenes.map((s, i) => ({
    idx: i,
    id: s.id,
    sceneN: s.sceneN || (i + 1),
    caption: (s.caption || '').slice(0, 200),
    t_start_ms: s.t_start_ms || 0,
    t_end_ms: s.t_end_ms || 0,
    duration_ms: (s.t_end_ms || 0) - (s.t_start_ms || 0)
  }));
  const rawList = raw_videos.map((v, i) => ({
    idx: i,
    id: v.id,
    filename: v.filename || v.name || `raw_${i}`,
    name: v.name || v.filename || `raw_${i}`,
    duration_ms: v.duration_ms || 0,
    scope: v.scope || 'post',
    tags: Array.isArray(v.tags) ? v.tags : []
  }));

  const systemPrompt = `Bạn là video editor chuyên nghiệp cho TikTok/Reels bán hàng. Nhiệm vụ: kết hợp storyboard images (AI-generated minh hoạ) với raw footage thật (sản phẩm/demo người dùng quay) thành 1 timeline có nhịp điệu bán hàng.

NGUYÊN TẮC:
1. KHÔNG đổi tổng thời lượng — mỗi slot scene giữ nguyên t_start_ms → t_end_ms (đã sync với voice).
2. Quyết định MỖI scene slot: dùng storyboard (mặc định) hay THAY bằng 1 raw video.
3. Raw video ƯU TIÊN cho:
   - Hook đầu video (slot 1) nếu raw video có vibe attention-grabbing
   - Khoảnh khắc nói về "sản phẩm thật", "demo", "thử nghiệm", "kết quả thực tế"
   - Pack-wide scope (brand intro, mascot) nên đặt ở slot đầu hoặc cuối làm CTA
4. Storyboard ưu tiên cho: ý trừu tượng, illustration, before/after concept, emotional hook
5. KHÔNG dùng cùng 1 raw video 2 lần (trừ khi chỉ có 1 raw + nhiều scene → có thể loop)
6. Mỗi raw video sẽ bị trim về duration của scene slot nó replace
7. Output strict JSON, không preamble.`;

  const userPrompt = `# VOICE SCRIPT (đã được TTS, dùng làm anchor)
${voice_script.slice(0, 3000)}

Voice total duration: ${(voice_duration_ms / 1000).toFixed(1)}s

# POST CONTEXT
${post_context ? `Title: ${post_context.title || ''}\nCaption: ${(post_context.caption || '').slice(0, 300)}` : '(không có)'}

# STORYBOARD SCENES (${sceneList.length} slots, đã timing với voice)
${sceneList.map(s => `[Scene ${s.sceneN}] idx=${s.idx} · t=${(s.t_start_ms/1000).toFixed(1)}s→${(s.t_end_ms/1000).toFixed(1)}s (${(s.duration_ms/1000).toFixed(1)}s) · "${s.caption}"`).join('\n')}

# RAW VIDEOS có sẵn (${rawList.length})
${rawList.map(v => `[Raw ${v.idx}] "${v.filename}" · ${(v.duration_ms/1000).toFixed(1)}s · scope=${v.scope}${v.tags.length ? ' · tags=[' + v.tags.join(', ') + ']' : ''}`).join('\n')}

# YÊU CẦU
Quyết định mỗi scene slot sẽ dùng storyboard hay 1 raw video. Output JSON:
\`\`\`json
{
  "shots": [
    {
      "scene_idx": 0,
      "src": "storyboard" | "raw",
      "asset_id": "<storyboard scene id NẾU src=storyboard, HOẶC raw video id NẾU src=raw>",
      "raw_idx": <chỉ điền nếu src=raw, là idx của raw video trong list trên>,
      "reason": "1 câu ngắn giải thích vì sao chọn"
    }
  ],
  "summary": {
    "raw_used": <số lượng raw được dùng>,
    "storyboard_used": <số lượng storyboard giữ lại>,
    "editor_notes": "1-2 câu tổng kết style của video sẽ ra"
  }
}
\`\`\`
LƯU Ý: số lượng shots = số scene slots (${sceneList.length}). KHÔNG bỏ scene nào. Mỗi shot map 1-1 với scene theo thứ tự. Output JSON only.`;

  const model = modelOverride || 'gemini-2.5-flash';
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
          temperature: 0.5,
          maxOutputTokens: 8192
        }
      })
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    gemResp = await r.json();
  } catch (e) {
    return error('Shot-list AI failed: ' + e.message, 502);
  }

  const txt = gemResp.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let parsed;
  try { parsed = JSON.parse(txt); }
  catch (e) {
    const cleaned = txt.replace(/```(?:json)?/g, '').trim();
    try { parsed = JSON.parse(cleaned); }
    catch (e2) { return error('Shot-list JSON parse failed: ' + e2.message, 500); }
  }

  const shots = (parsed.shots || []).slice(0, sceneList.length);

  // Materialize: resolve asset_id properly (Gemini sometimes confuses raw_idx vs asset_id)
  const materialized = [];
  for (let i = 0; i < sceneList.length; i++) {
    const slot = sceneList[i];
    const aiShot = shots[i] || { src: 'storyboard', asset_id: slot.id };
    let resolved;
    if (aiShot.src === 'raw' && typeof aiShot.raw_idx === 'number' && rawList[aiShot.raw_idx]) {
      resolved = { src: 'raw', asset_id: rawList[aiShot.raw_idx].id, raw_filename: rawList[aiShot.raw_idx].filename };
    } else if (aiShot.src === 'raw' && aiShot.asset_id && rawList.find(v => v.id === aiShot.asset_id)) {
      const rv = rawList.find(v => v.id === aiShot.asset_id);
      resolved = { src: 'raw', asset_id: aiShot.asset_id, raw_filename: rv?.filename };
    } else {
      // Default to storyboard
      resolved = { src: 'storyboard', asset_id: slot.id };
    }
    materialized.push({
      scene_idx: i,
      scene_n: slot.sceneN,
      ...resolved,
      t_start_ms: slot.t_start_ms,
      t_end_ms: slot.t_end_ms,
      duration_ms: slot.duration_ms,
      reason: aiShot.reason || ''
    });
  }

  const rawUsed = materialized.filter(s => s.src === 'raw').length;
  return json({
    ok: true,
    shots: materialized,
    summary: {
      total_slots: sceneList.length,
      raw_used: rawUsed,
      storyboard_used: sceneList.length - rawUsed,
      editor_notes: parsed.summary?.editor_notes || '',
      total_ms: voice_duration_ms || sceneList[sceneList.length - 1]?.t_end_ms || 0
    },
    tokens: gemResp.usageMetadata
  });
}
