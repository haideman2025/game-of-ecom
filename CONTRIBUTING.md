# Contributing to Game of Ecom

Thanks for thinking about contributing! This project welcomes PRs, issues, AI-agent-assisted refactors, doc fixes, and use-case feedback.

## Ground rules

1. **Read [AGENTS.md](./AGENTS.md) first.** It maps the codebase in 5 minutes — you'll save hours.
2. **Single-file frontend is intentional.** Don't propose a Vite/webpack migration without a plan for preserving browser-direct Gemini calls (geo-block bypass). See FAQ in README.
3. **All Gemini calls go through the browser.** Backend Pages Functions handle Drive/Zernio/Meta only.
4. **Version markers.** Tag your change with the next `V{X}.{Y}` increment in a comment. Update `deploy_goe.ps1` marker validation list if you add a major feature.
5. **D1 migrations are forward-only.** Name them `schema_v{N+1}_<feature>.sql`. Never edit a previously deployed migration.
6. **No automated test suite yet.** Smoke-test manually: fresh deploy → wizard → 5-post pack → verify console + network tab.
7. **Vietnamese is the primary locale.** New UI strings should be VN-first; English in parentheses is fine.

## How to set up a dev environment

See [README.md → Quick Start](./README.md#quick-start). Most contributors deploy to their own free Cloudflare account.

## How to propose a change

1. Fork the repo
2. Create a branch: `git checkout -b feat/V23.1-my-feature`
3. Edit `fb-pack-studio.html` (and any `functions/api/*.js` or `schema_v*.sql` you need)
4. Test locally: `cd fb-pack-studio-deploy && .\deploy_goe.ps1` to your own CF account
5. Commit with the version marker: `V23.1 — add X`
6. Push and open a PR

## Areas where PRs are especially welcome

- **i18n** — extract Vietnamese strings into a locale file
- **Mobile UX** — many modals still desktop-first (see roadmap in README)
- **Playwright smoke tests** — end-to-end wizard → pack → publish
- **New MCP tools** — see `functions/mcp/_tools.js` for the pattern
- **New AI model integrations** — add an image/video provider alongside Gemini (e.g., Flux, Stability)
- **Better deploy tooling** — auto-detect missing schemas, idempotent re-runs
- **Docs** — clearer setup walkthroughs, screen recordings, troubleshooting

## What I won't merge

- Telemetry / analytics that phone home
- Hard-coded API keys or secrets
- Changes that break browser-direct Gemini pattern without justification
- Vendor lock-in to a specific cloud provider beyond Cloudflare (which is opt-in)
- Code that requires a paid third-party SaaS to function

## Code style

- Plain JavaScript (no TypeScript)
- 2-space indent, single quotes for strings, semicolons
- Tailwind utility classes for styling, inline `<style>` for one-off custom CSS
- Functional React components with hooks; classes only if a hook can't express the pattern
- Comments in English; UI strings in Vietnamese

## Reporting bugs

Open an issue with:
1. What you did (steps)
2. What you expected
3. What actually happened (screenshot + DevTools console + network tab if relevant)
4. Browser + OS
5. Your `V{X}.{Y}` if you remember the last deployed version

## Security

If you find a security issue — credential leak path, XSS in user-controlled content, OAuth flow bug, MCP auth bypass — **do not open a public issue**. Email nangluongmr@gmail.com directly with the details. Coordinated disclosure preferred.

## License

By contributing, you agree your contributions will be licensed under the [MIT License](./LICENSE).
