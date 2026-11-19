# Orrery: handoff summary (2026-11-20)

Paste this into a new Claude session (ideally one running **on your computer**) to continue.

## What it is
**Orrery** is an Obsidian-style markdown vault shown as a living solar system, and long-term memory for Claude via MCP. Claude can read and write it cheaply in tokens.
- **The sun (Core):** you — `Core/Me` (age, identity), `Core/Values` and `Core/Life Vision`.
- **The rings:** planets (Projects, People, Goals, Values), moons (linked notes) and asteroids (loose notes).
- **Links:** wikilinks glow, and pulses travel along them. Notes light up when created.
- **Repo:** github.com/nathan170610/Marginalia (the old Marginalia Android placeholder was replaced).
  - `main` has Phases 0–1 (PR #1, merged).
  - Branch **`claude/cloud-environment-setup-9xj30v`** has everything up to v0.3.0. It is not merged yet; open a PR to merge it.
- **Live demo (browser, nothing saved):** https://claude.ai/artifact/Ue6TH7YG4reB6Uo4YM314z

## Tech
- **Stack:** TypeScript, a Canvas 2D renderer (Vite), Electron 45 desktop app, MCP server (@modelcontextprotocol/sdk) and Vitest.
- **Install:** `npm install --legacy-peer-deps`. The flag is needed because of an npm bug.
- **Commands:** `npm run build`, `npm test` (30 tests), `npm run typecheck`, `npm run app` (desktop dev).
- **Browser version:** `node dist/cli.cjs serve --vault <dir>` at http://127.0.0.1:4747.
- **Installers:** `npx electron-builder --linux` writes to `release/`. GitHub Actions builds Windows, Mac and Linux when a `v*` tag is pushed.
- **Files:**
  - `src/core/`: vault, search, brief, memory, consolidate, ingest, obsidian, setup, api
  - `src/mcp.ts`: Claude tools
  - `src/renderer/`: the UI
  - `electron/`: the desktop shell
  - `docs/BUILD_PROMPT.md`: phase plan and status
  - Also: `SECURITY.md`, `CHANGELOG.md`, `docs/RELEASE_CHECKLIST.md`

## Done
- **Phase 0–1:** vault format with `orbit`, `summary` and `tags` in frontmatter; BM25 search; token-budgeted brief; MCP server; orbit UI; capture box.
- **Phase 2:** `orrery import-claude <export.zip>` (rule-based fact extraction) and `orrery setup-claude --yes`, which writes Claude Desktop's config with a backup.
- **Phase 3:** visuals.
  - Themes (deep space, aurora, paper) and reduced motion.
  - Folder clusters, 3D depth and tilt, comet trails, time-lapse replay, minimap, keyboard navigation.
  - In-app editor with `[[` autocomplete.
  - 2,000 notes at ≥ 50 fps.
- **Phase 4:** desktop app.
  - First-run vault picker (new `~/Orrery` or an existing Obsidian folder) and live file watching.
  - Tray icon and **Ctrl/Cmd+Shift+O** quick capture.
  - Settings → **Connect automatically** to Claude Desktop (no Node needed).
  - Auto-update and CSP.
  - Linux AppImage and .deb verified; Windows and Mac are built by CI but untested.
- **Token efficiency:** about half the tokens of the original tools for a typical lookup.
  - `get_brief` (once, with `topic=`), `recall` (one-call answer within a budget), `explore` (connect the dots and suggest missing links).
  - `edit_note` (append or replace without resending the note) and batched `remember` that skips duplicates.
  - All output is plain text, and the server tells Claude how to use the tools cheaply.
- **Phase 5:** memory hygiene.
  - Parse cache: a 10k-note vault loads in about 0.3 s.
  - Contradiction flags (`review_memory`, `orrery review`); Claude asks which fact is current.
  - `orrery consolidate --yes` files Inbox items into their notes.
  - Used notes rise an orbit; notes untouched for 180 days sink.
  - `orrery import-obsidian <dir> [--dry-run]` never overwrites.
- **Phase 6 (docs):** SECURITY, CONTRIBUTING, CHANGELOG and issue templates; version 0.3.0.

## Not done yet
1. **Import my Obsidian vault.**
   - Run `node dist/cli.cjs import-obsidian <vault> --dry-run`, then without `--dry-run`.
   - Or open the vault directly in the app (first run → Open existing folder).
2. **Connect to Claude Desktop:** in the app, Settings → Connect automatically, then restart Claude Desktop.
3. **Merge the branch into `main`:** open a PR.
4. **Test the Windows and Mac installers:** push a tag such as `v0.3.0` and follow `docs/RELEASE_CHECKLIST.md`.
5. **Queued task ideas:**
   - ChatGPT export importer.
   - End-of-conversation `save_session` prompt (Phase 2(e)).
   - Local embedding search (Phase 5(e)).
   - AI summaries using my own API key (Phase 5(b)).
6. **Read my week in Obsidian and suggest overnight tasks** for my other projects.

## My preferences
- Use my Obsidian vault as persistent memory.
  - Log decisions in `Projects/<project>/`.
  - Add a daily summary to `Claude_Memory/Recent_Decisions.md` with [[backlinks]].
  - Dense, dated bullets; a short Status section at the top of each note; append rather than rewrite.
- Keep Claude's token usage low when reading and writing memory.
- Don't install untrusted tools that take control of my computer. Use Claude's built-in computer use instead.
