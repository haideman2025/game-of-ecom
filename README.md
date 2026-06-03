# Game of Ecom

> Open-source AI content studio that turns one brand intake into a complete 30-day Facebook content pack — captions, on-brand images, Vietnamese voice-overs, hand-drawn storyboards, and short videos. Built as a single-file React app on Cloudflare Pages with Google Gemini, with a built-in MCP server so Claude / Cowork / Claude Code can drive the whole pipeline.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Built with Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![MCP compatible](https://img.shields.io/badge/MCP-OAuth%202.1-7C3AED)](https://modelcontextprotocol.io/)
[![Made with Claude](https://img.shields.io/badge/Pair--programmed-Claude-D97757?logo=anthropic&logoColor=white)](https://claude.com/)
[![Vietnamese](https://img.shields.io/badge/Locale-Vietnamese%20%F0%9F%87%BB%F0%9F%87%B3-DA251D)]()
[![Single-file](https://img.shields.io/badge/Source-single--file%20HTML-orange)]()

**Live demo (your own):** Deploy to your Cloudflare account in ~10 minutes — see [Quick Start](#quick-start). · **Codebase tour for AI agents:** [AGENTS.md](./AGENTS.md)

---

## MVP P0 flow

For the first public MVP, the recommended new-user flow is **demo-first, text-first**. A new user should be able to open the app, click **Open Demo 30-Day Pack**, inspect a complete ONIIZ sample workspace, and understand the core value before adding a Gemini API key, Vault documents, publishing integrations, or media generation.

| Step | User outcome |
|---|---|
| 1. Open demo pack | See a complete 30-day content pack immediately, without API key or login. |
| 2. Review workspace | Inspect brand DNA, captions, image prompts, hashtags, and first comments. |
| 3. Create own text-first pack | Use AI Strategy Wizard only when ready to add an API key. |
| 4. Generate media later | Produce images/video/publishing automation after the text pack is validated. |

## What it does

- **Demo pack → instant workspace**: open a ready-made 30-day pack without API key, Vault, media, login, or integrations
- **Wizard → 30-day pack**: brand intake → AI Strategist generates 30 daily posts (caption + image prompt + first comment + hashtags) grounded in optional vault documents
- **AI image generation**: Gemini 2.5 Flash Image / Nano Banana Pro 3 with mascot + product reference continuity
- **Voice-over**: Gemini TTS (30 Vietnamese voices) with auto-pacing
- **Storyboard pipeline**: voice → 10s scenes → 8-frame hand-drawn breakdown → Omni Flash 10s video clips with character lock
- **Video Studio**: WebCodecs MP4 export, CapCut-style timeline, Ken Burns, subtitles, BGM picker
- **Brand Genesis Lab** (advanced): 4-phase research engine producing keyword tree → content matrix (300+ ideas) → visual DNA → 30/90-day execution plan
- **MCP server**: 50+ tools so Claude/Cowork/Claude Code can run the whole flow over JSON-RPC + OAuth 2.1
- **Publishing**: Zernio integration (Facebook/TikTok scheduling) + Meta Marketing API native (campaigns/adsets/ads)
- **Quest/XP system**: gamified onboarding, daily quests, badges, leaderboard

## What is Game of Ecom?

Game of Ecom is an end-to-end content production studio purpose-built for Vietnamese e-commerce sellers and AI-curious solopreneurs. You input a brand idea (or upload a strategy doc). It returns:

- A 30-day Facebook content calendar with full captions, image prompts, first comments, hashtags, and best-time hints
- AI-generated on-brand hero images using Google's Nano Banana Pro 3 / Gemini 2.5 Flash Image
- Vietnamese voice-overs across 30 voices (Gemini TTS)
- 10-second storyboards split into 8-frame hand-drawn breakdowns ready for Google Flow Omni Flash or Veo 3.1
- Short videos via WebCodecs MP4 export in a CapCut-style timeline (Ken Burns, subtitles, BGM picker)
- A built-in MCP server (50+ tools, OAuth 2.1) so Claude / Cowork / Claude Code / claude.ai connectors can run the same pipeline programmatically

It also publishes: Facebook & TikTok via Zernio, paid ads via Meta Marketing API v21 (campaigns, ad sets, creatives, ads — native, no middleware).

## Why does this exist?

Most ecom content tools either lock you into a paid SaaS, require complex orchestration of 5+ services, or generate generic AI slop that drifts off-brand. Game of Ecom is one HTML file + Cloudflare Pages Functions you self-host on your own Cloudflare account, your own Google API key, your own data — with brand DNA, mascot continuity, and Vietnamese voice/copy as first-class concerns.

It also doubles as a reference implementation for:
- **Cloudflare Pages + D1 + R2 + KV** as a full-stack template
- **Browser-direct Gemini API calls** to bypass Cloudflare edge geo-blocks
- **MCP server in Workers** with OAuth 2.1 + DCR (RFC 7591), exposing 50+ tools over JSON-RPC 2.0
- **AGENTS.md pattern** for AI-agent-navigable codebases (compatible with Claude Code, Cursor, Aider, Cowork)

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 18 (CDN), Babel standalone, Tailwind CSS, **single HTML file** (~20,000 lines) |
| Edge runtime | Cloudflare Pages Functions (Workers V8 isolates) |
| Database | Cloudflare D1 (SQLite at edge) — 14 schema migrations |
| Object storage | Cloudflare R2 (S3-compatible) for media staging |
| Auth | Google OAuth 2.0 (user sign-in) + custom OAuth 2.1 + DCR for MCP |
| AI models | Google Gemini 2.5 Pro / Flash / Flash-Image (Nano Banana Pro 3), Veo 3.1 / Omni Flash, Gemini TTS |
| Protocol | Model Context Protocol (MCP) — JSON-RPC 2.0 over Streamable HTTP |
| Third-party APIs | Google Drive, Facebook Graph, Meta Marketing v21, Zernio |
| Client-side video | WebCodecs + mp4-muxer (MP4 export in-browser, no server render) |

## Feature highlights

### 🧙 AI Strategy Wizard (default flow)
Brand intake → AI auto-analyzes audience + USP → generates 30 daily posts grounded in optional vault documents (PDF / DOCX / Markdown). Each post comes with caption, image prompt, image direction, voice script, first comment, hashtags, aspect ratio, and best posting time.

### 🌟 Brand Genesis Lab (advanced strategy research)
A 4-phase research engine that goes deeper than the wizard:
1. **Keyword Tree** — strategic Lưới Mục Tiêu builder
2. **Content Matrix** — 300+ idea generator from the keyword tree
3. **Visual DNA** — palette + composition + lighting + texture system
4. **Execution Plan** — 30/90-day calendar with KPIs

### 🎙️ Voice Production Engine
Vietnamese TTS across 30 voices (Aoede, Charon, Puck, Kore, Fenrir, and more). Voice arc supports 4-phase value-first viral structure (hook → context → payoff → CTA). Output integrates with NotebookLM, Nano Banana Pro 3, Veo 3.1, and CapCut via paste-ready prompt packs.

### 🎬 Storyboard Pipeline (10s scenes, 8-frame breakdown)
Each post's voice-over auto-splits into 10-second scenes. Per scene:
- Color storyboard image (Pixar-style or your brand's visual DNA)
- 8-panel hand-drawn breakdown in 2×4 grid with English shot-type/camera-move labels and Vietnamese voice-over bubbles
- One-click copy to Google Flow's Omni Flash workflow (Khung hình mode) — paste prompt + drag both images → 10s cinematic clip

### 📹 Video Studio
WebCodecs-based in-browser MP4 export. CapCut-style timeline with drag-to-trim, split, Ken Burns, auto-subtitle burning, BGM picker (bundled CC0 music from FreePD), parallel voice/music lanes.

### 🤖 Built-in MCP Server (50+ tools)
A complete Model Context Protocol server lives at `/mcp` on the same deployment. Exposes tools for: pack CRUD, brand setup, post generation, image gen, voice gen, storyboard plan, video render queue, Meta Ads creation, Zernio scheduling, Brand Genesis phase orchestration, vault management, and execution plan building.

Compatible with:
- **Claude Code** — works as a custom MCP server
- **Cowork mode** in claude.ai desktop — connect via Settings → MCP
- **claude.ai web connectors** — OAuth 2.1 + Dynamic Client Registration (RFC 7591)
- Any MCP client following the spec

### 📤 Publishing
- **Facebook + TikTok** via Zernio (multi-account)
- **Meta Marketing API v21** native — campaigns, ad sets, creatives, ads. No middleware. Includes Click-to-Messenger conversion campaigns.
- **Google Drive** auto-sync for media

### 🎮 Quest / XP gamification
Onboarding quests, daily challenges with reset, streak rewards, badges, leaderboard, level-up celebrations. Built to keep new sellers engaged through the first 30 days.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (single-file React, Babel standalone, Tailwind CSS)        │
│   fb-pack-studio.html  ~20,000 lines                                │
│                                                                     │
│   • IndexedDB: packs, generated assets (images/audio/video)         │
│   • Direct Gemini API calls (bypass Cloudflare edge geo-block)      │
│   • WebCodecs in-browser MP4 export                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │  fetch /api/*  (HttpOnly cookies)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Cloudflare Pages Functions  (functions/api/**, functions/mcp/**)    │
│                                                                     │
│   • Google OAuth sign-in → session cookies                          │
│   • D1: packs, posts, scheduled posts, vault, MCP keys, sessions   │
│   • R2: media staging for Zernio publish + Drive mirror             │
│   • KV: MCP OAuth tokens (optional)                                 │
│   • MCP JSON-RPC handler at /mcp (OAuth 2.1 + DCR + PKCE)          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
   ┌─────────────────────────┴──────────────┬──────────────┬──────────┐
   ▼                                        ▼              ▼          ▼
Google Gemini API                  Google Drive       Zernio API   Meta Marketing
(2.5 Pro / Flash / Flash-Image /   (media sync,       (FB+TikTok   API v21
 Nano Banana Pro 3 / Veo 3.1 /     OAuth user        scheduled    (campaigns,
 Omni Flash / TTS)                 grant)            publish)     ad sets, ads)
```

## Quick start

### Prerequisites

- Cloudflare account (free tier works)
- Node.js 18+ for `wrangler` CLI
- PowerShell 5+ (Windows) or bash (macOS/Linux)
- Google Cloud project with: OAuth 2.0 client + **Generative Language API enabled** + **Drive API enabled**
- Optional: Facebook App (for Zernio publishing), Meta Business account (for paid ads)

### 5-minute setup

```bash
# 1. Clone
git clone https://github.com/haideman2025/game-of-ecom.git
cd game-of-ecom

# 2. Install wrangler
npm install -g wrangler
wrangler login

# 3. Create Cloudflare bindings
wrangler d1 create fb-pack-studio-db
# → copy database_id into fb-pack-studio-deploy/wrangler.toml
wrangler r2 bucket create fb-pack-studio-media

# 4. Apply D1 schemas (in order, idempotent)
cd fb-pack-studio-deploy
for f in schema_v*.sql; do
  wrangler d1 execute fb-pack-studio-db --file=$f --remote
done

# 5. Deploy
wrangler pages deploy . --project-name=fb-pack-studio
```

Then in the Cloudflare dashboard set these environment variables (Pages → Settings → Environment variables → Production):

| Variable | Type | Required? | Used for |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | text | Yes | Google sign-in |
| `GOOGLE_CLIENT_SECRET` | secret | Yes | Google sign-in |
| `FB_APP_ID` | text | Optional | Zernio FB publishing |
| `FB_APP_SECRET` | secret | Optional | Zernio FB publishing |
| `META_APP_SECRET` | secret | Optional | Meta Marketing API |

Open the deployed URL, click **Settings** → paste your **Gemini API key** (get one at https://aistudio.google.com/apikey — make sure Generative Language API is enabled), sign in with Google, click **🧙 AI Strategy Wizard**, fill brand info, click **Generate**. Done.

7. **First-time use**
   - Open the deployed URL
   - Click **Open Demo 30-Day Pack** to inspect the complete sample workspace immediately
   - Optional: Settings → set Gemini API key when you want to generate a new pack
   - Optional: sign in with Google for cloud sync + Drive
   - Welcome → AI Strategy Wizard → fill brand → generate a text-first 30-day pack, then create media later

8. **Validate before deploy**
   ```bash
   npm install
   npm run validate
   ```

   The validation scripts parse the single-file React/Babel app and all Cloudflare Pages Functions before deployment.

### Optional: bundle free background music

```bash
mkdir -p fb-pack-studio-deploy/audio
# Download CC0 MP3s from https://freepd.com/
# (chill, epic, ambient, etc. — see V14.18a in source for expected list)
```

## For AI agents working on this codebase

If you're Claude Code, Cursor, Aider, Cowork, or any other AI coding assistant — start at **[AGENTS.md](./AGENTS.md)**. It's a 5-minute orientation covering:

- Component tree of the single-file React app
- Version-marker convention (`V22.X — feature`) for fast feature lookup via grep
- Where to add MCP tools, Pages Functions, D1 migrations, React components
- Browser-direct Gemini call pattern (avoid Cloudflare edge geo-block)
- Common pitfalls (no server-side localStorage, no automatic tests, etc.)
- Recent feature history (V14 → V22.8 increments)

The codebase intentionally uses version markers in every change so an AI agent can locate any feature with one `grep -n "V22.X" fb-pack-studio.html`.

## FAQ

### How is this different from Canva / Lately / Jasper / Copy.ai?

Those are SaaS products you pay monthly. Game of Ecom is one HTML file you deploy to your own Cloudflare account using your own Gemini API key. Total cost: Cloudflare free tier + Gemini API pay-as-you-go (~$0.05 per generated pack of 30 posts at current pricing). You also own all the data.

### Why single-file HTML?

So an AI agent (or you with a text editor) can grep, read, and modify the entire frontend without navigating a build system. There's no Vite, no webpack, no TypeScript compile step. Babel standalone transforms JSX in the browser. Want to add a feature? Edit one file, sync to deploy folder, push to Cloudflare. Iteration speed > architectural purity.

### Does this work without Cloudflare?

The frontend (`fb-pack-studio.html`) works locally as a static file with localStorage-only mode. You lose: cloud sync, MCP server, Zernio publishing, Meta Ads. You keep: brand wizard, image/voice/video generation, storyboard editor, in-browser MP4 export.

### Can I use this with English content?

The wizard prompt + voice TTS are tuned for Vietnamese. Switching: edit the `channelLanguage` field in `brand` object and replace Vietnamese voice IDs with English ones (Gemini TTS supports English). About 80% of the UI is bilingual; the rest is Vietnamese-first.

### How does the MCP server work?

It's a Cloudflare Worker at `/mcp` implementing JSON-RPC 2.0 over Streamable HTTP, with OAuth 2.1 + Dynamic Client Registration (RFC 7591) + PKCE. Compatible with Claude Code, Cowork mode, and claude.ai web connectors. After connecting, Claude can call any of 50+ tools to drive the pipeline — generate posts, render images, schedule publishing, run ads, query metrics.

### Is the source readable enough to fork?

Yes. Every feature has a `V{X}.{Y} — name` marker comment. The 20k-line HTML is the entire frontend; the rest is small (~50 small JS files in `functions/`). [AGENTS.md](./AGENTS.md) gives you the map.

## Roadmap / Help wanted

- [ ] Vite-based build that preserves browser-direct Gemini pattern but enables HMR
- [ ] Playwright smoke tests for the wizard → pack flow
- [ ] Mobile UX overhaul (many modals are still desktop-first)
- [ ] Internationalization (i18n) — currently Vietnamese-first
- [ ] Public template marketplace (export/import pack as JSON)
- [ ] Stripe Lifetime checkout for SaaS-mode operators
- [ ] Better D1 schema migration tooling
- [ ] More MCP tool coverage for the Video Studio timeline

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for ground rules.

## Inspiration & credits

Built iteratively by [@haideman2025](https://github.com/haideman2025) with Claude as pair-programmer. ~290 versioned increments from V14 → V22.8.

Heavy use of:
- [Google Gemini](https://ai.google.dev/) for text / image / video / voice
- [Google Flow](https://labs.google/fx/vi/tools/flow) Omni Flash for 10-second cinematic video clips
- [Cloudflare Pages](https://pages.cloudflare.com/) + D1 + R2 + KV for edge runtime
- [Model Context Protocol](https://modelcontextprotocol.io/) for AI agent integration
- [FreePD](https://freepd.com/) for CC0 background music
- [Tailwind CSS](https://tailwindcss.com/) for utility-first styling
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) for WebCodecs MP4 packaging
- [Zernio](https://zernio.com/) for Facebook + TikTok scheduling

## License

[MIT](./LICENSE) — fork it, ship it, monetize it. Attribution appreciated.

## Keywords (for discovery)

`ai-content-studio` · `vietnamese-ecommerce` · `cloudflare-pages-template` · `gemini-api-react` · `mcp-server-example` · `claude-code-project` · `agents-md` · `single-file-react` · `facebook-content-automation` · `meta-marketing-api` · `webcodecs-mp4` · `vietnamese-tts` · `storyboard-ai` · `veo-flash` · `nano-banana-pro` · `omni-flash` · `cloudflare-d1` · `cloudflare-r2` · `cloudflare-workers` · `oauth-2.1` · `dynamic-client-registration` · `tiktok-content` · `gemini-2.5-pro` · `gemini-2.5-flash-image` · `ecommerce-saas` · `content-calendar-generator` · `brand-dna` · `viral-content-system` · `ho-chi-minh-city-ecommerce` · `vietnamese-saas`
