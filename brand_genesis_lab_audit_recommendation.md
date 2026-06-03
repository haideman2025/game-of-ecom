# Brand Genesis Lab Audit & Product Direction Recommendation

**Author:** Manus AI
**Project:** DEMAN AI LAB / Game of Ecom
**Date:** 2026-06-03
**Route:** **MANUS_DIRECT**. Đây là audit kỹ thuật-sản phẩm đủ hẹp để Manus xử lý trực tiếp bằng repo inspection, không cần đẩy sang Claude Deep Work. Nếu bước tiếp theo là viết lại UX copy hoặc spec triển khai dài cho dev team, có thể dùng Claude để review ngôn ngữ, nhưng quyết định sản phẩm chính đã đủ rõ.

## Executive Decision

**Khuyến nghị chính là không giữ Brand Genesis Lab như một pipeline độc lập.** Nên reposition nó thành **Advanced Strategy Mode** nằm trong cùng trục với AI Strategy Wizard, còn primitive bền vững của app vẫn phải là **Pack Workspace**. Lý do là AI Strategy Wizard đã có luồng được chứng minh: intake → Gemini browser-side → JSON `{ brand, posts[] }` → mở thẳng workspace → dùng tiếp image, voice, video, scheduler, Zernio, Meta Ads và StrategistContentBar. Brand Genesis hiện tạo ra một thực thể trung gian là `viral_grid_sessions`, sau đó mới cố materialize sang pack; vì vậy user cảm giác “không thông với pipeline hiện tại và tiếp theo” là đúng.

> **Verdict:** Hợp nhất Brand Genesis vào AI Strategy Wizard theo hướng **Wizard = Pack-first default**, **Genesis = Strategy depth add-on**, **Viral Grid Session = optional strategy artifact**, không phải destination chính.

| Vấn đề quan sát | Nguyên nhân gốc | Quyết định đề xuất |
|---|---|---|
| Brand Genesis giống AI Strategy Wizard nhưng chạy khác nhánh | Cả hai đều bắt đầu từ brand intake và sinh content plan/post pack, nhưng output contract khác nhau | Gộp entry point thành một flow: **Create Pack / Generate Strategy** |
| Brand Genesis không thông với pipeline sau đó | Luồng chính của app xoay quanh `packId`, `brand`, `posts`, asset library và workspace; Genesis xoay quanh `session_id` rồi mới materialize | Mọi run Genesis phải tạo/mở pack trước, hoặc gắn vào pack đang mở |
| Dễ lỗi JSON/HTML hoặc cảm giác API fail | Local test server trả HTML cho `/api/*`, production route yêu cầu Cloudflare Pages Functions + auth + schema; browser parse JSON sẽ fail nếu endpoint trả HTML | Thêm safe fetch wrapper kiểm tra `content-type`, fallback local pack, và thông báo “login/deploy/schema” rõ ràng |
| Trùng vai trò với StrategistContentBar | StrategistContentBar đã là layer sản xuất thêm post từ strategy trong pack | Genesis chỉ nên cung cấp strategy DNA/matrix để nạp vào Strategist, không tự duy trì post-production pipeline riêng |

## Mission Brief

Mục tiêu của audit là xác định vì sao **Brand Genesis Lab / Viral Grid Master** đang không vận hành liền mạch với app hiện tại, so sánh với **AI Strategy Wizard**, và đưa ra hướng sản phẩm khả thi để không nhân đôi hệ thống. Giả định làm việc là không sửa code lớn, không deploy, và không thay đổi schema trong sprint audit này; output là khuyến nghị chiến lược kỹ thuật và implementation plan ưu tiên.

| Field | Decision |
|---|---|
| User problem | Brand Genesis Lab có vẻ không hoạt động và không nối vào các pipeline hiện có hoặc pipeline tiếp theo |
| Product intent | Tạo một brand/content operating system cho Game of Ecom, không chỉ một generator rời rạc |
| Technical constraint | App hiện là single-file React `fb-pack-studio.html`, deploy mirror `fb-pack-studio-deploy/index.html`, backend là Cloudflare Pages Functions + D1 |
| Success criteria | Sau khi generate, user phải có pack mở trong workspace và dùng tiếp được image/video/voice/schedule/ads |
| Routing | MANUS_DIRECT cho audit; CLAUDE_CODE chỉ cần nếu triển khai patch refactor nhiều file |

## Evidence From Codebase

Luồng AI Strategy Wizard được thiết kế theo kiểu **pack-first**. Component `WizardModal` nhận intake gồm brand basics, voice, pillars, mascot, products, colors và trạng thái `pack_id` từ workspace hiện tại; nó build prompt, gọi `geminiStreamPack`, parse JSON, merge dữ liệu chiến lược vào `parsed.brand`, rồi gọi `onComplete(parsed, also_generate_images)`.[1] Ở root app, `handleWizComplete` chỉ cần set `brand`, set `posts`, đóng wizard và chuyển `uiState` sang `main`, vì output của Wizard đã đúng contract workspace.[2]

Brand Genesis/Viral Grid được thiết kế khác. Frontend `ViralGridModal` có bước materialize browser-side, gọi `/api/viral-grid/save-materialized-pack`, sau đó mirror pack vào IndexedDB để workspace có thể load ngay cả khi cloud round-trip lỗi.[3] Root app chỉ tự mở workspace nếu callback nhận được `materialized_pack_id`; nếu chỉ có `session_id`, app hiện báo user cần gọi materialize thêm.[4] Đây là dấu hiệu rõ ràng rằng Genesis chưa phải first-class workspace flow.

Backend cũng xác nhận Brand Genesis đang là orchestration layer riêng. Route `/api/viral-grid/persist-session` lưu kết quả 4-phase vào bảng `viral_grid_sessions`, render dashboard HTML, rồi trả `session_id` và `dashboard_url`, nhưng bản thân route này chưa tạo pack.[5] Route `/api/viral-grid/save-materialized-pack` mới tạo row trong `packs` từ `brand_with_dna` và `posts`, đồng thời link ngược `viral_grid_session_id` nếu schema đã có.[6] Route `/api/viral-grid/materialize-skills` lại chạy thêm `materialize_top_posts` và `route_skills_for_product`, trả về `pack_id`, `materialized`, `skills_routed` và routing plan; tức là Brand Genesis có nhiều “điểm kết thúc” tiềm năng thay vì một handoff duy nhất.[7]

Trong khi đó, pipeline hiện tại sau workspace đã trưởng thành theo `packId`. `StrategistContentBar` gọi `/api/strategist/extend-day` và `/api/strategist/generate-posts` với `pack_id`, `api_key`, `brand` và các tham số ngày; nó hoạt động như layer sản xuất thêm nội dung từ strategy trong pack.[8] Điều này cho thấy đường đúng để tích hợp Genesis là **nạp strategy vào pack/strategist**, không duy trì một pipeline Genesis riêng chạy song song.

## Root Cause Diagnosis

Brand Genesis không “hỏng” theo nghĩa thiếu toàn bộ backend; các route Viral Grid thực tế đã tồn tại trong `fb-pack-studio-deploy/functions/api/viral-grid/*`. Tuy nhiên nó **hỏng về kiến trúc trải nghiệm** vì destination chính của user là workspace pack, còn Genesis lại lấy `session_id` làm trung tâm. Trong app này, hầu hết tính năng production như asset library, image generation, voice-over, video studio, scheduler, Zernio, Meta Ads và cloud sync đều bám vào active pack. Vì vậy bất kỳ feature nào không tạo hoặc mở pack ngay sẽ bị cảm nhận là “đứt pipeline”.

Một nguyên nhân phụ là rủi ro môi trường. Khi test bằng static server cục bộ, các request `/api/viral-grid/*` trả HTML 404/501 thay vì JSON vì Cloudflare Pages Functions không chạy trên server Python. Trên production, route còn phụ thuộc login session, D1 schema V20/V21 và deploy mirror. Nếu frontend gọi `r.json()` trên HTML response, user sẽ thấy lỗi kiểu JSON parse thay vì thông báo actionable. Đây là vấn đề defensive UX, không phải chỉ là model/prompt.

| Layer | AI Strategy Wizard | Brand Genesis Lab hiện tại | Gap |
|---|---|---|---|
| Entry point | Welcome CTA chính “AI Wizard” | Welcome CTA advanced/optional “Brand Genesis” | Đúng về hierarchy, nhưng naming làm user tưởng là feature song song |
| Intake | Brand, audience, USP, pillars, mascot, products, colors | Brand + product type + uploaded strategy + viral grid settings | Overlap lớn; Genesis nên dùng chung intake shell |
| AI call | Browser-side Gemini với user API key | Browser-side 4-phase + một số backend orchestration | Dễ lệch behavior và error states |
| Output contract | `{ brand, posts[] }` | `session_id`, phase outputs, dashboard, optional pack | Chưa pack-first |
| Workspace handoff | Set `brand/posts`, `uiState='main'` | Chỉ mở pack nếu materialized thành công | Nếu materialize fail thì đứt luồng |
| Downstream | Image, voice, video, scheduler, ads, export | Cần materialize/route trước | Thiếu một “single happy path” |

## Recommended Product Architecture

Tôi đề xuất đổi mô hình từ **hai generator độc lập** sang một kiến trúc **Strategy-to-Pack Engine**. User chỉ cần hiểu một hành động: tạo hoặc nâng cấp một pack. Bên trong có hai cấp độ: **Quick Wizard** cho 30-day pack nhanh, và **Genesis Depth** cho brand DNA, viral matrix, visual DNA, execution plan và skill routing. Cả hai đều phải kết thúc bằng cùng một object: `packId + brand + posts + strategy_json`.

> **Principle:** Trong Game of Ecom, **Pack là database object thật**, còn Strategy Session chỉ là artifact giải thích hoặc provenance. Không nên để user thao tác trực tiếp với session như một workspace.

| Proposed module | Responsibility | User-facing label |
|---|---|---|
| Unified Intake Shell | Một form chung cho brand, audience, offer, pillars, products, assets, vault grounding | “Create / Upgrade Brand Pack” |
| Quick Wizard Mode | Sinh nhanh 30 posts theo contract hiện tại | “Fast 30-Day Pack” |
| Genesis Depth Mode | Sinh brand DNA, viral grid, visual DNA, execution plan, optional dashboard | “Deep Brand Strategy” |
| Pack Materializer | Luôn tạo/mở pack; fallback local nếu cloud fail | Không cần hiện thành bước riêng |
| Strategy Artifact Store | Lưu `viral_grid_session` hoặc `strategist_run` để trace lại decision | “View Strategy Map” |
| Production Router | Đề xuất next actions như image, video, voice, ads, schedule | “Next Best Actions” |

## UX Flow Đề Xuất

Flow mới nên bắt đầu từ một CTA duy nhất: **Create Brand Pack**. Sau khi vào modal, user chọn “Fast” hoặc “Deep”. Nếu chọn Fast, app dùng AI Strategy Wizard hiện tại. Nếu chọn Deep, app dùng logic Brand Genesis nhưng không để user rơi vào màn hình session; thay vào đó, khi 4-phase xong, app lập tức materialize ít nhất 30 bài vào pack và mở workspace. Dashboard, keyword tree, viral matrix và skills routing trở thành tab “Strategy Map” trong pack.

| Step | Fast mode | Deep mode |
|---|---|---|
| 1. Intake | Wizard fields hiện tại | Wizard fields + upload strategy + product type + vault grounding |
| 2. Generate | 30 posts trực tiếp | 4-phase strategy + content matrix |
| 3. Materialize | Already materialized | Always create/open pack with selected top posts |
| 4. Workspace | Open main workspace | Open same workspace |
| 5. Next actions | Generate images / schedule / ads | Same + view Strategy Map + skill recommendations |

Điểm quan trọng là user không nên thấy lỗi “Strategy done nhưng chưa materialize pack” như một trạng thái bình thường. Nếu materialize cloud fail, app phải tạo **local fallback pack** ngay và hiển thị toast: “Đã tạo local pack; cloud sync sẽ retry khi deploy/login/schema OK.” Genesis có thể lưu session sau, nhưng không được chặn workspace.

## Implementation Plan

### P0 — Fix perception of brokenness without deep refactor

Trong bước đầu, giữ Brand Genesis là advanced path nhưng ép happy path thành pack-first. Frontend cần thêm một wrapper `safeJsonFetch()` dùng cho các endpoint `/api/viral-grid/*`: nếu response không phải JSON, đọc text 200 ký tự đầu và trả error dễ hiểu như “API route not active; run via Cloudflare Pages deployment, not static local server.” Điều này xử lý lỗi HTML/JSON parse khi local server không có Pages Functions.

| Task | File | Acceptance criteria |
|---|---|---|
| Add `safeJsonFetch()` | `fb-pack-studio.html` | Không còn lỗi parse HTML mù; toast phân biệt unauthorized, missing schema, route inactive |
| Force local fallback pack | `ViralGridModal` materialize block | Sau Genesis luôn có pack trong IndexedDB dù `/save-materialized-pack` fail |
| Rename CTA | `WelcomeScreen` / modal copy | “Brand Genesis Lab” đổi thành “Deep Strategy Mode (Beta)” |
| Hide session-only end state | `onSessionDone` callback | Nếu có `session_id` nhưng không có pack, tự tạo fallback pack hoặc mở modal retry materialize |

### P1 — Unify Wizard and Genesis as one Product Surface

Sau P0, nên refactor nhẹ để dùng chung intake shell. Không cần chuyển sang framework mới; chỉ cần tách conceptual flow trong cùng `fb-pack-studio.html`. Wizard hiện có data fields đủ dùng làm base; Genesis thêm `product_type`, `materializeCount`, `groundWithVault`, uploaded strategy auto-fill và depth toggle.

| Task | File | Acceptance criteria |
|---|---|---|
| Introduce `BrandPackWizardModal` | `fb-pack-studio.html` | Một modal có mode `fast`/`deep`, dùng chung draft save |
| Normalize output contract | frontend helper | Cả fast/deep đều trả `{ packId?, brand, posts, strategyArtifact? }` |
| Store strategy on pack | D1 schema hoặc reuse `strategist_runs` | Workspace có nút “View Strategy Map” theo pack |
| Route “Generate more posts” to existing strategist APIs | `StrategistContentBar` | Genesis matrix/DNA được dùng làm strategy source khi gọi generate-posts |

### P2 — Make Genesis a real strategic layer, not second content generator

Ở giai đoạn này mới nên giữ các khái niệm Viral Grid, skills routing và spawned artifacts. Chúng nên phục vụ next-action recommendations sau khi pack mở, ví dụ “tạo landing page”, “tạo mascot”, “tạo comic lesson”, “tạo ad angles”, thay vì tự chạy như một production app riêng.

| Capability | New behavior |
|---|---|
| Viral matrix | Là source idea bank cho StrategistContentBar và content calendar |
| Visual DNA | Là default style guide cho image/video prompt builders |
| Execution plan | Là calendar/schedule suggestion, không chỉ dashboard HTML |
| Skills routing | Là Next Best Action panel trong pack workspace |
| Spawned artifacts | Link asset/document/video back to active pack |

## Suggested Claude Code Packet For Next Implementation Sprint

Nếu muốn chuyển sang sửa code, nên dùng Claude Code thay vì làm thủ công trong chat vì repo là single-file lớn và cần kiểm tra diff kỹ. Packet đề xuất như sau:

> **Claude Code Task Packet**
> Repo: `/home/ubuntu/game-of-ecom`
> Primary file: `fb-pack-studio.html`; deploy mirror: `fb-pack-studio-deploy/index.html`; backend: `fb-pack-studio-deploy/functions/api/viral-grid/*`.
> Goal: Make Brand Genesis Lab pack-first and robust. It must never end with only `session_id` if posts can be materialized locally.
> Acceptance criteria: add a reusable safe JSON fetch helper; replace direct Viral Grid `fetch(...).json()` calls with safe wrapper; if `/api/viral-grid/save-materialized-pack` fails, create local IDB pack and call `onSessionDone({ materialized_pack_id: localId, local_only: true })`; rename UI copy from “Brand Genesis Lab” to “Deep Strategy Mode (Beta)” where user-facing; update deploy marker validation with new version marker; run syntax validation.
> Return format: summary, files changed, risk notes, manual test checklist, diff.

## Final Recommendation

Tao nên chọn hướng **merge, không kill**. Brand Genesis có giá trị ở phần deep strategy: keyword tree, viral matrix, visual DNA, execution plan, skills routing. Nhưng nó không nên đứng ngang hàng với AI Strategy Wizard như một lab riêng, vì điều đó làm user không hiểu lúc nào dùng cái nào và làm hệ thống nhân đôi pipeline. Tên tốt hơn là **Deep Strategy Mode** hoặc **Genesis Depth Mode**, nằm bên trong hành trình tạo/nâng cấp pack.

Quy tắc triển khai nên là: **mọi AI flow phải kết thúc bằng active pack**. Nếu một feature tạo ra idea, strategy, dashboard hoặc skill routing nhưng không tạo/mở pack, nó chỉ là phụ lục. Game of Ecom hiện đã có xương sống đủ mạnh: pack workspace → asset generation → strategist generate/extend → voice/video → scheduler → ads. Brand Genesis nên bơm “DNA chiến lược” vào xương sống đó, không thay thế nó.

## References

[1]: `fb-pack-studio.html:10127-10275` — `WizardModal` intake, prompt build, Gemini generation, JSON parse, brand merge, `onComplete`.
[2]: `fb-pack-studio.html:20251-20257` — `handleWizComplete` pushes generated pack into workspace.
[3]: `fb-pack-studio.html:5648-5811` — Brand Genesis materialize block, cloud save and local IDB mirror/fallback.
[4]: `fb-pack-studio.html:20655-20669` — `ViralGridModal` callback only opens workspace when `materialized_pack_id` exists.
[5]: `fb-pack-studio-deploy/functions/api/viral-grid/persist-session.js:4-90` — Persist 4-phase Genesis session and dashboard, no pack creation.
[6]: `fb-pack-studio-deploy/functions/api/viral-grid/save-materialized-pack.js:3-52` — Save materialized posts into `packs` and link `viral_grid_session_id`.
[7]: `fb-pack-studio-deploy/functions/api/viral-grid/materialize-skills.js:4-78` — Separate materialize and skill routing orchestration.
[8]: `fb-pack-studio.html:9076-9143` — `StrategistContentBar` calls pack-centric extend/generate endpoints.
