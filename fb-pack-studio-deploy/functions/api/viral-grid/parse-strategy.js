import { json, error, getCurrentUser } from '../../_utils.js';

/* V21.1 — POST /api/viral-grid/parse-strategy
   Input: { text, api_key }
   Output: { brand_name, tagline, industry, audience, mood[], loai_luoi, product_type }
*/
export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }
  if (!body.text || body.text.length < 50) return error('Text too short — need at least 50 chars', 400);

  // V21.1 fix — accept api_key from body (frontend forwards user's localStorage key)
  // OR fall back to env.GEMINI_API_KEY if configured as Cloudflare secret
  const apiKey = body.api_key || env.GEMINI_API_KEY;
  if (!apiKey) return error('Gemini API key missing. Vào Settings → Save key Gemini trước khi upload file.', 400);

  const prompt = `Bạn là brand strategist. Đọc tài liệu chiến lược dưới đây và trích xuất thông tin để fill vào form intake Brand Genesis.

TÀI LIỆU:
${String(body.text).slice(0, 30000)}

Trả về JSON ONLY với các field sau (chỉ điền nếu tìm thấy trong tài liệu, để null nếu không rõ):
{
  "brand_name": "tên brand",
  "tagline": "tagline / lời hứa ngắn (max 80 chars)",
  "industry": "ngành hàng + sản phẩm chính (1-2 câu)",
  "audience": "mô tả audience cốt lõi: tuổi + giới + đặc điểm + pain point (1-3 câu)",
  "mood": ["3 từ mô tả mood brand"],
  "loai_luoi": "don_gian | phuc_tap | cam_xuc | ket_hop (default ket_hop)",
  "product_type": "course | niche | fmcg | saas | service | info"
}

Quy tắc product_type:
- course = khóa học, edu, info-product có giáo trình
- niche = TikTok/IG creator, affiliate marketer, ngách content
- fmcg = sản phẩm tiêu dùng (mỹ phẩm, thực phẩm, đồ gia dụng, beauty, fashion)
- saas = phần mềm, dev tool, B2B tech
- service = dịch vụ chuyên môn, coaching, consultancy, agency
- info = ebook, newsletter, paid digital download không có module

NEVER invent data. Nếu document không nói thì để null. JSON only, không text khác.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4000 }
      })
    });
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Gemini ${r.status}: ${errText.slice(0, 300)}`);
    }
    const d = await r.json();
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    return json({
      ok: true,
      brand_name: parsed.brand_name || null,
      tagline: parsed.tagline || null,
      industry: parsed.industry || null,
      audience: parsed.audience || null,
      mood: Array.isArray(parsed.mood) ? parsed.mood : null,
      loai_luoi: parsed.loai_luoi || 'ket_hop',
      product_type: parsed.product_type || null,
      source_chars: body.text.length
    });
  } catch (e) {
    return error('Parse strategy: ' + e.message, 500);
  }
}
