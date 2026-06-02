# Game of Ecom

> An AI-powered, quest-driven content creation studio for Vietnamese e-commerce sellers.
> Single-file React + Cloudflare Pages + D1 + R2 + Google Gemini.

Game of Ecom (formerly FB Pack Studio) turns a brand intake into a complete 30-day Facebook content pack: posts, images, voice-overs, storyboards, and short videos, all on-brand and ready to publish. It includes an MCP server so AI agents (Claude, Cowork, Claude Code) can drive the entire pipeline programmatically.

## What it does

- **Wizard → 30-day pack**: brand intake → AI Strategist generates 30 daily posts (caption + image prompt + first comment + hashtags) grounded in optional vault documents
- **AI image generation**: Gemini 2.5 Flash Image / Nano Banana Pro 3 with mascot + product reference continuity
- **Voice-over**: Gemini TTS (30 Vietnamese voices) with auto-pacing
- **Storyboard pipeline**: voice → 10s scenes → 8-frame hand-drawn breakdown → Omni Flash 10s video clips with character lock
- **Video Studio**: WebCodecs MP4 export, CapCut-style timeline, Ken Burns, subtitles, BGM picker
- **Brand Genesis Lab** (advanced): 4-phase research engine producing keyword tree → content matrix (300+ ideas) → visual DNA → 30/90-day execution plan
- **MCP server**: 50+ tools so Claude/Cowork/Claude Code can run the whole flow over JSON-RPC + OAuth 2.1
- **Publishing**: Zernio integration (Facebook/TikTok scheduling) + Meta Marketing API native (campaigns/adsets/ads)
- **Quest/XP system**: gamified onboarding, daily quests, badges, leaderboard

## Architecture (high level)

```
┌────────────────────────────────────────────────────────────────┐
│ Browser (single-page React, Babel standalone, Tailwind)       │
│   fb-pack-studio.html  ~20,000 lines                          │
│                                                                │
│   • IndexedDB: packs, assets (images/audio/video), drafts     │
│   • Direct Gemini API calls (bypass CF geo-block)             │
│   • WebCodecs MP4 export                                       │
└──────────────┬─────────────────────────────────────────────────┘
               │  fetch /api/*  (cookies)
               ▼
┌────────────────────────────────────────────────────────────────┐
│ Cloudflare Pages Functions  (functions/api/**)                │
│                                                                │
│   • Auth: Google OAuth → session cookies                       │
│   • D1: packs, posts, scheduled posts, vault, sessions, etc.  │
│   • R2: media staging for Zernio publish + Drive sync mirror  │
│   • KV (optional): MCP OAuth tokens                            │
│   • MCP JSON-RPC handler at /mcp (OAuth 2.1 + DCR)            │
└──────────────┬─────────────────────────────────────────────────┘
               │
   ┌───────────┴────────────┬────────────────┬──────────────────┐
   ▼                        ▼                ▼                  ▼
Google Gemini       Google Drive       Zernio API       Meta Marketing
(text/image/        (media sync)       (FB/TikTok       API v21
 video/TTS)                             publish)
```

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 (CDN), Babel standalone, Tailwind 3, single-file HTML |
| Edge runtime | Cloudflare Pages Functions (Workers V8 isolates) |
| Database | Cloudflare D1 (SQLite at edge) |
| Object storage | Cloudflare R2 (S3-compatible) |
| Auth | Google OAuth 2.0 (sign-in) + custom OAuth 2.1 + DCR for MCP |
| AI models | Gemini 2.5 Flash / Pro / Flash-Image, Veo 3.1 / Omni Flash, Gemini TTS |
| MCP | JSON-RPC 2.0 over Streamable HTTP |
| External | Google Drive, Facebook Graph, Meta Marketing v21, Zernio |

## Quick start (clone → deploy your own)

### Prerequisites

- Cloudflare account (free tier OK)
- Node.js 18+ (for wrangler CLI)
- PowerShell (Windows) or bash (Mac/Linux)
- Google Cloud project with: OAuth client, **Generative Language API** + **Drive API** enabled
- Optional: Facebook App + Zernio account for publishing

### Setup

1. **Clone + install wrangler**
   ```bash
   git clone https://github.com/YOUR_USER/game-of-ecom.git
   cd game-of-ecom
   npm install -g wrangler
   wrangler login
   ```

2. **Create Cloudflare bindings**
   ```bash
   # D1 database
   wrangler d1 create fb-pack-studio-db
   # → copy database_id into fb-pack-studio-deploy/wrangler.toml

   # R2 bucket
   wrangler r2 bucket create fb-pack-studio-media
   ```

3. **Apply D1 schemas** (in order)
   ```bash
   cd fb-pack-studio-deploy
   for f in schema_v*.sql; do
     wrangler d1 execute fb-pack-studio-db --file=$f --remote
   done
   ```

4. **Set secrets in Cloudflare dashboard**
   Pages → Settings → Environment variables → Production:
   - `GOOGLE_CLIENT_ID` (from Google Cloud Console)
   - `GOOGLE_CLIENT_SECRET` (secret type)
   - `FB_APP_ID` + `FB_APP_SECRET` (optional, for Zernio integration)
   - `META_APP_SECRET` (optional, for Meta Ads)

5. **Download free CC0 music** (excluded from repo to keep size small)
   ```bash
   mkdir -p fb-pack-studio-deploy/audio
   # Download MP3s from https://freepd.com/ or your own CC0 library
   # Name them: ambient_*.mp3, chill_*.mp3, epic_*.mp3, etc.
   # See V14.18a in source code for the expected list (~10-15 tracks)
   ```

6. **Deploy**
   ```powershell
   # Windows
   cd fb-pack-studio-deploy
   .\deploy_goe.ps1
   ```

   Or manually:
   ```bash
   wrangler pages deploy fb-pack-studio-deploy --project-name=fb-pack-studio
   ```

7. **First-time use**
   - Open the deployed URL
   - Settings → set Gemini API key (from https://aistudio.google.com/apikey — needs Generative Language API enabled)
   - Sign in with Google (for cloud sync + Drive)
   - Welcome → 🧙 AI Strategy Wizard → fill brand → generate 30-day pack

## For AI agents working on this codebase

See **[AGENTS.md](./AGENTS.md)** for architecture map, conventions, key file locations, and modification guardrails.

The codebase is a single-file React app (`fb-pack-studio.html`, ~20k lines). The repo is structured so an AI agent can:
- Locate a feature by version marker (`V22.X — <name>`) via grep
- Understand the React component tree via the section comments
- Add new MCP tools by extending `functions/mcp/_tools.js`
- Add new Cloudflare Pages endpoints in `functions/api/<area>/<name>.js`
- Apply D1 migrations via `wrangler d1 execute`

## License

MIT — see [LICENSE](./LICENSE). You're free to fork, customize, monetize. Attribution appreciated.

## Credits

Built iteratively by Năng (nangluongmr@gmail.com) with Claude as pair-programmer. ~290 versioned increments from V14 → V22.8.

The free music bundle is sourced from [FreePD](https://freepd.com/) (Public Domain CC0). Mascot/icon credits in-app.
