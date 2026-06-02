import { json, error, getCurrentUser } from '../../_utils.js';
import { requireCap } from '../../_permissions.js';

/* V14.34 — POST /api/strategist/mess-sales-pack
   Generate 30-day FB Ads + Messenger sales content pack.

   Body: {
     pack_id, api_key, model?,
     intake: {
       brand_name, page_url,
       industry,           // 'edtech_kids' | 'beauty' | 'fnb' | 'fitness' | 'realestate' | 'healthcare' | 'fashion' | 'b2b_saas' | 'other'
       product_price_vnd,  // number
       target_leads,       // number
       budget_vnd,         // number
       lead_definition,    // 'inquiry' | 'phone_number' | 'demo_booked' | 'purchase'
       audience,           // 1-liner
       usp                 // 1-liner
     }
   }

   Returns: { forecast: {...}, posts: [30], strategy: {...} }
*/

const INDUSTRY_PRESETS = {
  edtech_kids:   { label: 'EdTech kids/family', cpl_low: 25000, cpl_high: 60000, quality_rates: { inquiry: 0.40, phone_number: 0.25, demo_booked: 0.18, purchase: 0.08 } },
  beauty:        { label: 'Beauty / Skincare',  cpl_low: 15000, cpl_high: 45000, quality_rates: { inquiry: 0.30, phone_number: 0.18, demo_booked: 0.10, purchase: 0.06 } },
  fnb:           { label: 'F&B Restaurant',     cpl_low: 10000, cpl_high: 30000, quality_rates: { inquiry: 0.70, phone_number: 0.45, demo_booked: 0.55, purchase: 0.25 } },
  fitness:       { label: 'Fitness / Wellness', cpl_low: 30000, cpl_high: 80000, quality_rates: { inquiry: 0.40, phone_number: 0.28, demo_booked: 0.22, purchase: 0.10 } },
  realestate:    { label: 'Real Estate',         cpl_low: 80000, cpl_high: 300000, quality_rates: { inquiry: 0.20, phone_number: 0.15, demo_booked: 0.10, purchase: 0.03 } },
  healthcare:    { label: 'Healthcare / Clinic', cpl_low: 50000, cpl_high: 150000, quality_rates: { inquiry: 0.50, phone_number: 0.35, demo_booked: 0.25, purchase: 0.12 } },
  fashion:       { label: 'Fashion / Apparel',   cpl_low: 20000, cpl_high: 50000, quality_rates: { inquiry: 0.45, phone_number: 0.30, demo_booked: 0.18, purchase: 0.12 } },
  b2b_saas:      { label: 'B2B SaaS',             cpl_low: 100000, cpl_high: 400000, quality_rates: { inquiry: 0.28, phone_number: 0.20, demo_booked: 0.15, purchase: 0.04 } },
  other:         { label: 'Other B2C',           cpl_low: 25000, cpl_high: 80000, quality_rates: { inquiry: 0.35, phone_number: 0.22, demo_booked: 0.15, purchase: 0.07 } }
};

function computeForecast(intake) {
  const preset = INDUSTRY_PRESETS[intake.industry] || INDUSTRY_PRESETS.other;
  const cpl_avg = (preset.cpl_low + preset.cpl_high) / 2;
  const quality_rate = preset.quality_rates[intake.lead_definition] ?? 0.30;
  const target = Number(intake.target_leads) || 0;
  const budget = Number(intake.budget_vnd) || 0;
  const product_price = Number(intake.product_price_vnd) || 0;

  // Conversations needed to hit target leads
  const conversations_needed = Math.ceil(target / quality_rate);
  // Spend needed at avg CPL
  const spend_needed_avg = conversations_needed * cpl_avg;
  const spend_needed_low = conversations_needed * preset.cpl_low;
  const spend_needed_high = conversations_needed * preset.cpl_high;

  // Realistic leads from budget
  const estimated_conversations = Math.floor(budget / cpl_avg);
  const estimated_leads = Math.floor(estimated_conversations * quality_rate);

  // ROAS forecast (if product_price provided)
  const expected_revenue = estimated_leads * product_price;
  const roas = budget > 0 ? expected_revenue / budget : 0;

  // Feasibility
  let feasibility, reason;
  if (spend_needed_avg > budget * 1.15) {
    feasibility = 'red';
    reason = `Budget ${(budget/1e6).toFixed(1)}M VND quá thấp — cần tối thiểu ${(spend_needed_avg/1e6).toFixed(1)}M để đạt ${target} leads. Đề xuất giảm target xuống ~${estimated_leads} leads HOẶC tăng budget.`;
  } else if (spend_needed_avg < budget * 0.7) {
    feasibility = 'green';
    reason = `Budget dư — có thể scale target lên ~${Math.floor(estimated_leads * 0.9)} leads. Hoặc giữ target và dùng dư budget để A/B test creative.`;
  } else {
    feasibility = 'yellow';
    reason = `Realistic. Cần ${conversations_needed} conversations (~${(spend_needed_avg/1e6).toFixed(1)}M VND) để đạt ${target} leads với quality rate ${(quality_rate*100).toFixed(0)}%.`;
  }

  return {
    industry: intake.industry,
    industry_label: preset.label,
    cpl_low: preset.cpl_low,
    cpl_high: preset.cpl_high,
    cpl_avg,
    quality_rate,
    conversations_needed,
    spend_needed_low,
    spend_needed_avg,
    spend_needed_high,
    estimated_conversations,
    estimated_leads,
    expected_revenue,
    roas,
    feasibility,
    feasibility_reason: reason
  };
}

export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return error('Bad JSON', 400); }

  const { pack_id, api_key, model: modelOverride, intake } = body;
  if (!pack_id) return error('Missing pack_id');
  if (!api_key) return error('Missing api_key (Gemini)');
  if (!intake) return error('Missing intake (brand_name, industry, target_leads, budget_vnd, lead_definition, audience, usp)');
  if (!intake.brand_name || !intake.industry || !intake.target_leads || !intake.budget_vnd || !intake.lead_definition) {
    return error('Intake missing required fields: brand_name + industry + target_leads + budget_vnd + lead_definition');
  }

  try { await requireCap(env, pack_id, user, 'edit_content'); }
  catch (e) { return error(e.message, e.status || 403); }

  const forecast = computeForecast(intake);

  // Build prompt — Mess-keyword strategy from skill SKILL.md
  const systemPrompt = `Bạn là FB Ads strategist Việt Nam chuyên Messenger conversion. Sản xuất 30 posts cho campaign Click-to-Mess bán hàng 30 ngày.

NGUYÊN TẮC TUYỆT ĐỐI:
1. MỖI POST có CTA "Inbox [KEYWORD]" — keyword UNIQUE per post, UPPERCASE, ≤8 ký tự, dễ nhớ, action-oriented (DEMO, COMBO, PDF, TEST, WORKSHOP, v.v.)
2. KHÔNG multi-CTA — chỉ 1 keyword inbox/post
3. Caption Việt natural — không stiff/cheesy
4. Hook 5-8 từ đầu phải bắt mắt
5. Voice: brand voice từ intake (default: friendly, action-driven)
6. Output JSON strict, không preamble

PHÂN BỔ 30 POSTS (Lotus 3-pillar):
- P1 (Story + Insight) × 15 posts (50%) — soft inbox (keyword cảm xúc/personal name)
- P2 (Method + Tips) × 9 posts (30%) — medium inbox (keyword freebie/PDF/audio)
- P3 (Workshop + Demo + Offer) × 6 posts (20%) — high-intent inbox (keyword DEMO/WORKSHOP/REGISTER)

KEYWORD PATTERNS:
1. Freebie name (PDF, EBOOK, "30 THẺ", "AUDIO")
2. DEMO (đặt thử)
3. Event date ("30/5", "WORKSHOP")
4. Person name testimonial ("QUÂN", "LINH")
5. TEST/QUIZ
6. Offer ("COMBO", "SALE")
7. Methodology ("PHONICS")
8. Q&A ("TƯ VẤN")
9. Conversion ("MUA", "ĐĂNG KÝ")
10. Decision ("PHÂN VÂN")`;

  const userPrompt = `# BRAND
- Tên: ${intake.brand_name}
- Page: ${intake.page_url || '(chưa có)'}
- Ngành: ${forecast.industry_label}
- Sản phẩm/dịch vụ: ${intake.product_name || '(không nêu)'} — giá ${(intake.product_price_vnd || 0).toLocaleString('vi-VN')} VND
- Audience: ${intake.audience || '(broad)'}
- USP: ${intake.usp || '(không nêu)'}

# CAMPAIGN GOAL
- Target leads: ${intake.target_leads}
- Budget: ${(intake.budget_vnd / 1e6).toFixed(1)}M VND
- Lead definition: ${intake.lead_definition}

# FORECAST (đã tính sẵn)
- CPL benchmark: ${(forecast.cpl_low/1000).toFixed(0)}k - ${(forecast.cpl_high/1000).toFixed(0)}k VND
- Quality rate: ${(forecast.quality_rate*100).toFixed(0)}%
- Estimated realistic leads: ${forecast.estimated_leads}
- Feasibility: ${forecast.feasibility.toUpperCase()} — ${forecast.feasibility_reason}

# YÊU CẦU
Generate 30 posts JSON theo schema:
\`\`\`json
{
  "strategy_summary": "2-3 câu tóm tắt strategy",
  "posts": [
    {
      "n": 1, "day": 1, "pillar": 1,
      "title": "≤80 chars",
      "caption": "100-300 chars VN, hook + body + 'Inbox [KEYWORD]'",
      "mess_keyword": "DEMO",
      "first_comment": "100-200 chars nhắc lại keyword + hint auto-reply",
      "image_prompt": "50-120 từ EN cụ thể, 1:1 hoặc 4:5 portrait",
      "best_time": "HH:MM",
      "expected_cpl_vnd": ${Math.round(forecast.cpl_avg)}
    }
  ]
}
\`\`\`
- 30 posts EXACTLY: P1×15 (n 1,4,7,...) intermix, P2×9, P3×6
- Mess_keyword UNIQUE per post (KHÔNG lặp)
- best_time spread theo audience (broad: 8:00, 12:00, 20:00; mom audience: 9:00, 13:00, 21:00)
- image_prompt aspect ratio 1:1 cho feed
Output JSON only.`;

  // V14.34.1 — Default flash (broader region support), fallback chain on 400/403 region errors
  const modelCandidates = modelOverride
    ? [modelOverride]
    : ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.5-pro'];

  let gemResp = null;
  let lastErr = null;
  for (const model of modelCandidates) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api_key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.65,
            maxOutputTokens: model.includes('pro') ? 65536 : 32768
          }
        })
      });
      if (!r.ok) {
        const errTxt = await r.text();
        lastErr = `${model} ${r.status}: ${errTxt.slice(0, 200)}`;
        // 400 with "location" error or 403 → try next model
        if ((r.status === 400 && errTxt.includes('location')) || r.status === 403) {
          console.warn('[V14.34.1] Model ' + model + ' region-blocked, trying next...');
          continue;
        }
        // Other errors: throw immediately
        throw new Error(lastErr);
      }
      gemResp = await r.json();
      break; // success
    } catch (e) {
      lastErr = e.message;
      if (modelCandidates.indexOf(model) === modelCandidates.length - 1) {
        return error('Gen mess pack failed sau khi thử ' + modelCandidates.length + ' models: ' + lastErr, 502);
      }
    }
  }
  if (!gemResp) return error('Gen mess pack failed: ' + (lastErr || 'unknown'), 502);

  const txt = gemResp.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let parsed;
  try { parsed = JSON.parse(txt); }
  catch (e) {
    const cleaned = txt.replace(/```(?:json)?/g, '').trim();
    try { parsed = JSON.parse(cleaned); }
    catch (e2) { return error('JSON parse failed: ' + e2.message, 500); }
  }

  const posts = parsed.posts || [];
  if (!Array.isArray(posts) || posts.length === 0) return error('No posts returned', 500);

  // Validate + dedupe keywords
  const seenKw = new Set();
  let duplicates = 0;
  posts.forEach((p, i) => {
    const kw = (p.mess_keyword || '').toUpperCase().slice(0, 12);
    if (seenKw.has(kw)) {
      duplicates++;
      p.mess_keyword = kw + (i + 1);
    } else {
      seenKw.add(kw);
      p.mess_keyword = kw;
    }
  });

  // Build campaign_config ready for Meta Ads paste
  const campaign_config = {
    campaign: {
      name: `${intake.brand_name} · 30day Mess · ${new Date().toISOString().slice(0,10)}`,
      objective: 'OUTCOME_ENGAGEMENT',
      campaign_daily_budget: Math.round(intake.budget_vnd / 30),
      buying_type: 'AUCTION',
      special_ad_categories: []
    },
    ad_set: {
      name: `${intake.brand_name} · Mess AdSet`,
      optimization_goal: 'CONVERSATIONS',
      billing_event: 'IMPRESSIONS',
      destination_type: 'MESSENGER',
      targeting_hint: intake.audience || 'broad',
      daily_budget: Math.round(intake.budget_vnd / 30)
    },
    ads_hint: `Pick 5-10 best posts (highest predicted engagement) as ad creative. Each ad → 1 post media + caption ending with "Inbox [KEYWORD]"`
  };

  return json({
    ok: true,
    forecast,
    strategy_summary: parsed.strategy_summary || '',
    posts,
    duplicates_fixed: duplicates,
    campaign_config,
    tokens: gemResp.usageMetadata
  });
}
