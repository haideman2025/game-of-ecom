# Agent guide — Game of Ecom codebase

This document orients an AI coding agent (Claude Code, Cursor, Cowork, Aider, etc.) so it can make safe, useful modifications to this repo without wasting iterations.

## Mental model

**Single source of truth**: `fb-pack-studio.html` (~20k lines) is the entire React app. Everything client-side lives here:
- React components (App, modals, panels, cards)
- Helper functions (IndexedDB, asset library, Gemini callers, audio/video utils)
- CSS via inline `<style>` blocks + Tailwind utility classes
- Babel standalone transforms JSX in-browser (no build step)

**Deploy mirror**: `fb-pack-studio-deploy/index.html` is a byte-for-byte copy of `fb-pack-studio.html`. The PowerShell script `deploy_goe.ps1` syncs them.

**Backend**: `fb-pack-studio-deploy/functions/**` are Cloudflare Pages Functions. Each `.js` file maps 1:1 to a URL:
- `functions/api/packs/[id].js` → `GET/PUT/DELETE /api/packs/:id`
- `functions/mcp/index.js` → `POST /mcp` (MCP JSON-RPC handler)

**Database**: `fb-pack-studio-deploy/schema_v*.sql` are D1 migrations applied in order. Each represents a feature increment.

## Find a feature fast

Every feature edit is tagged with a version marker comment. Examples:
- `// V22.8 — 10s scenes + 8-frame breakdown`
- `// V21.5 — Auto-push materialized pack vào workspace`
- `{/* V14.36 — CreateAdModal */}`

To find a feature:
```bash
grep -n "V22.X" fb-pack-studio.html
grep -rn "V20.A" fb-pack-studio-deploy/functions/
```

The deploy script `deploy_goe.ps1` has a marker validation list at the top — useful for understanding what features should be present.

## React component map (rough)

```
App (root)
├── WelcomeScreen           — pack picker + AI Wizard / Brand Genesis CTAs
├── WizardModal             — 5-step AI Strategist intake
├── ViralGridModal          — Brand Genesis Lab (4-phase research + materialize)
├── ProjectsModal           — pack list / create / delete
├── PostCard                — single post tile w/ all action buttons
├── BrandIntakePanel        — brand setup form
├── StrategistContentBar    — "+ Day kế tiếp" / "🤖 Sản xuất 30 ngày" extender
├── StoryboardEditorModal   — scenes grid w/ Frame Pack + Omni copy
├── VoiceGenModal           — voice picker + TTS gen
├── VoiceProductionModal    — VO → 4-AI-prompt HTML pack (NotebookLM/Nano Banana/Veo/CapCut)
├── PreviewPane             — fanpage mockup w/ slideshow modes
├── AssetLibrary            — IndexedDB browser w/ filters
├── VideoStudioModal        — CapCut-style timeline + WebCodecs MP4 export
├── MetaAdsManagerModal     — Meta Marketing API direct campaign manager
├── CreateAdModal / BoostAdsModal — Meta ads creation
├── ZernioPublishModal      — Zernio FB/TikTok publish
├── ScheduleViewModal       — calendar view
├── AutoScheduleModal       — bulk smart scheduling
├── QuestHUD / QuestMapModal / LevelUpModal — gamification
├── ConnectClaudeModal      — MCP key management
└── ... (many more)
```

## Conventions

### Versioning
- Every meaningful change gets a `V{MAJOR}.{MINOR}` marker. Increment minor for additive features, major for rebuilds.
- Markers live in code comments AND in `deploy_goe.ps1` validation list.

### Browser-direct Gemini calls
**Critical**: Cloudflare edge IPs are geo-blocked by Gemini in some regions. All Gemini text/image calls happen **browser-side** with the user's API key from localStorage. Backend only proxies Drive/Zernio/Meta where origin doesn't matter.

If adding a Gemini-dependent feature: do it client-side in `fb-pack-studio.html`, not in a Pages Function.

### Asset library scheme
All generated media goes through `saveAsset({ type, postN, sceneN, base64, mime, source, prompt, brand, ... })`. Asset types currently in use:
- `image` (post hero)
- `mascot`, `product` (reference images)
- `audio` (voice-over)
- `video` (chain clip), `final_video` (cinema export), `bgm` (music)
- `storyboard` (scene image)
- `frame_pack` (V22.X 8-panel hand-drawn breakdown for Omni Flash)

Pack scoping: `getCurrentPackId()` auto-attaches `pack_id` so assets are workspace-isolated.

### Toast & XP rewards
- `setToast({ type:'success'|'warn'|'error'|'info', msg, duration })`
- `awardXP(amount, label, { questProgress, completeQuest, badge })` for gamification hooks.

### Single-pack worldview
The user picks ONE active pack at a time. All UI state (brand, posts, generatedImages, mascotRefs, productRefs) reloads on `handleOpenPack(id)`.

## Where to make common changes

| You want to... | Edit |
|---|---|
| Add a new post action button | `PostCard` component in `fb-pack-studio.html` |
| Add a new D1 column | Create `schema_v{N}_<name>.sql` + apply via wrangler |
| Add a new MCP tool | `fb-pack-studio-deploy/functions/mcp/_tools.js` (50+ tools live here) |
| Add a Pages Function endpoint | `fb-pack-studio-deploy/functions/api/<area>/<name>.js` |
| Change brand auto-fill flow | `WizardModal` or `BrandIntakePanel` |
| Adjust storyboard pacing | `geminiPlanStoryboard()` in `fb-pack-studio.html` |
| Update Omni Flash prompt | `handleCopyOmniPrompt()` in `StoryboardEditorModal` |
| Change Gemini model | Update model strings (Gemini 2.5 Pro, 3 Pro Image, Veo 3.1 / Omni Flash) |

## Deploy workflow

1. Edit `fb-pack-studio.html` (Windows-side, not bash mount which may have caching lag)
2. Run `cd fb-pack-studio-deploy && .\deploy_goe.ps1`
3. PowerShell script copies `fb-pack-studio.html` → `index.html`, validates markers, applies any new schema, deploys via `wrangler pages deploy`
4. Hard refresh browser (`Ctrl+Shift+R`) — Babel cache is aggressive

## Common pitfalls

1. **Don't add server-side Gemini calls** — they'll fail intermittently due to geo-block. Browser-direct only.
2. **Don't use server-side localStorage** — Workers don't have it. Use D1/R2/KV.
3. **JSX in single-file means Babel parses everything** — a syntax error in one component breaks the whole app. Test parse before deploy.
4. **D1 migrations are forward-only** — name them with monotonically increasing version numbers.
5. **Asset base64 in IndexedDB is large** — keep size guards on parallel batch ops (5-10 concurrent max).
6. **Aspect ratio is sticky** — `post.aspect_ratio` cascades to scenes, image gen, video gen. Default fallback: `brand?.default_aspect_ratio || '1:1'`.

## Testing

There's no automated test suite. Workflow:
1. Hard refresh after deploy
2. Open DevTools Console — watch for `[V22.X]` log lines and red errors
3. Network tab — check `/api/*` returns expected JSON
4. Generate a small pack (5 posts) end-to-end before bigger runs

## Recent feature history (last ~30 versions)

- **V14.x** — FB/Zernio integration, OAuth, multi-pack, Drive sync, Music library, Video Studio
- **V15** — Meta Marketing API direct (replaced Zernio Ads)
- **V16-V18** — MCP server: 50+ tools, OAuth 2.1 + DCR for Claude/Cowork
- **V19** — Vault grounding for course/info products
- **V20** — Viral Grid Master 4-phase strategy (keyword tree → matrix → DNA → execution)
- **V21** — Brand Genesis unified pipeline
- **V22** — Voice production engine, Omni Flash workflow, 10s scenes, 8-frame storyboard

See git history for granular increments.

## What this repo is NOT

- Not a public SaaS product. It's a single-user workstation tool that the operator deploys to their own Cloudflare account.
- Not a typed codebase. Plain JS, no TypeScript.
- Not test-covered. Smoke-test manually after each deploy.
- Not multi-tenant beyond per-Google-account scoping. There's no team RBAC inside a workspace beyond pack-share invites.

## Help wanted areas

If you're an agent looking for high-impact work:

- Refactor the 20k-line HTML into multi-file build (Vite or similar) while keeping browser-direct Gemini calls
- Add automated Playwright smoke tests for the wizard → pack flow
- Improve mobile UX (V14.11 was a start; many modals still desktop-first)
- Internationalize (currently Vietnamese-first with some English mix)
- Build a public template marketplace (export pack as JSON, import to another instance)

---

Questions about the codebase? Search for the relevant `V{X}.{Y}` marker in `fb-pack-studio.html` first — almost every feature has self-documenting comments at its definition site.
