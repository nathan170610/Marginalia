# Orrery: phased build prompt

Paste the **Master prompt** once at the start of a Claude Code session, then paste one **Phase prompt** at a time.
Each phase has acceptance criteria; don't start the next phase until they pass (`npm test`, `npm run typecheck`, `npm run build`, and a real screenshot for visual work).

Status legend: ✅ built in this repo · 🟡 partly built · ⬜ not started

---

## Master prompt

> You are building **Orrery**: an open-source, local-first desktop app that turns a markdown vault (Obsidian-compatible) into a living solar system of the user's mind, and gives Claude a persistent, *token-cheap* memory through an MCP server.
>
> **Product principles**
> 1. *Plain files are the source of truth.* Everything is `.md` + frontmatter + `[[wikilinks]]`. Delete the app and the notes still work in Obsidian.
> 2. *Token efficiency is a feature.* An AI starting a conversation must get everything essential in ≤ ~2k tokens regardless of vault size, via tiered summaries (core full → planets one-liners → moons titles → asteroids count), then pull detail on demand with search/read tools.
> 3. *Beautiful by default.* Dark space aesthetic; planets orbit; links glow with light pulses; hovering lights up a node's neighbourhood; new memories visibly ignite. 60fps with 2,000 nodes.
> 4. *Private.* No accounts, no telemetry, no cloud. Server binds to 127.0.0.1. Path-traversal-safe.
> 5. *Installable.* One-command dev setup; installers for Windows, macOS, Linux.
>
> **Architecture** (keep it): `src/core` (pure TS: vault parser, graph, BM25 search, brief builder, capture) · `src/mcp.ts` (MCP stdio server) · `src/server.ts` + `src/cli.ts` · `electron/` (main + preload, IPC mirrors the HTTP API) · `src/renderer` (Canvas 2D, no framework; same `backend` adapter for IPC/HTTP).
>
> **Working rules:** small commits; tests for every core change (vitest); never rewrite working modules without a reason; verify UI changes with a real Playwright screenshot and read it; don't add dependencies unless they pay for themselves; report what you could not verify.

---

## Phase 0: Foundation ✅
**Prompt:** Scaffold the repo: TypeScript, Vite for the renderer, esbuild bundling for node entry points (cli, mcp, electron main/preload), vitest, GitHub Actions CI, MIT license, starter vault template (Core/Me, Values, Life Vision; Projects; People; Goals; Inbox).
**Done when:** `npm run build` and `npm test` pass in CI.

## Phase 1: Memory engine ✅
**Prompt:** Implement in `src/core`: markdown vault loader (frontmatter, tags, wikilinks incl. aliases/headings, id resolution by path/basename/title), orbit assignment (frontmatter `orbit:` > folder > link degree), BM25 search with title/tag boosts and orbit weighting, `remember()` that appends timestamped bullets to `Inbox/YYYY-MM-DD.md` with wikilinks, `initVault()` that never overwrites, and `buildBrief(graph,{budget})` that is strictly token-budgeted and degrades by tier.
**Done when:** tests cover parsing, orbits, ranking, budget compliance on a 200-note vault, no-overwrite init, and path traversal rejection.

## Phase 2: Claude bridge ✅ (rule-based import; (e) end-of-conversation template ⬜)
**Prompt:** (a) ✅ MCP server with `get_brief`, `search`, `read_note`, `remember`. (b) ✅ Add `update_note` (replace body, keep frontmatter) and `link_notes(a,b,reason)`. (c) ✅ **Conversation ingestion:** `orrery import-claude <export.zip|conversations.json>` reads a Claude data export and, for each conversation, distils *durable* facts only (identity, preferences, decisions, project state, people), writes them as small notes with `summary:` + wikilinks, de-duplicates against existing notes (BM25 similarity + exact-fact match), and records provenance in frontmatter (`source: claude-export`, conversation date). Provide a `--dry-run` that prints the proposed notes. (d) ✅ Ship a copy-paste instruction block and an `orrery setup-claude` command that writes the Claude Desktop MCP config (backup the old file first, ask before overwriting). (e) ⬜ Optional "end-of-conversation" prompt template that makes Claude call `remember` 1–5 times with concise facts.
**Done when:** an MCP client integration test passes (list tools, brief within budget, remember → search finds it, traversal rejected); import on a fixture export yields stable, deduplicated notes on a second run.

## Phase 3: Visual polish 🟡 (v1 ✅; below ⬜)
**Prompt:** Upgrade the renderer without hurting performance: (a) cluster planets angularly by folder/tag and add faint orbit labels; (b) real parallax depth and subtle 3D tilt on drag; (c) comet trails for recently-edited notes and a "time-lapse" slider that replays the vault growing by `mtime`; (d) edge bundling or alpha scaling so 2,000 notes stay readable; (e) level-of-detail: labels only for core/planets unless zoomed or focused; (f) themes (deep space, aurora, paper) and a reduced-motion mode; (g) minimap and keyboard navigation; (h) in-app note editor with live link autocomplete (`[[`) that writes back to disk.
**Done when:** 2,000-node synthetic vault holds ≥ 50fps in Chromium (measure and report), screenshots reviewed for overlap/legibility, reduced-motion respected.

## Phase 4: Desktop app & installers 🟡 (Electron shell launch ✅ verified under Xvfb; installers/packaging ⬜ untested)
**Prompt:** Make the Electron app production quality: first-run vault picker (default `~/Orrery`, or point at an existing Obsidian vault), file watcher (chokidar) pushing live updates over IPC instead of 4s polling, tray icon + global hotkey for quick capture, single-instance lock, app icon set, electron-builder configs for NSIS/dmg/AppImage/deb, code-signing hooks (documented, optional), auto-update via GitHub Releases, CSP on the renderer, and a Settings panel that shows the exact MCP config to copy.
**Done when:** CI builds installers on all three OS, a fresh install launches, creates/opens a vault, shows the graph, and the MCP snippet from Settings works in Claude Desktop (manual checklist in `docs/RELEASE_CHECKLIST.md`).

## Phase 5: Smarter, cheaper memory ⬜
**Prompt:** Reduce tokens and improve recall: (a) cache parsed index in `.orrery/index.json` keyed by mtime so big vaults load instantly; (b) per-note auto-summaries stored in frontmatter (`summary:`) when missing, generated only on request via an optional `orrery summarize` that uses the user's own API key; (c) *consolidation:* merge Inbox bullets into the right notes, flag contradictions ("lives in X" vs "lives in Y") for the user rather than silently overwriting; (d) *decay & promotion:* notes referenced often rise toward the core, stale ones drift outward; (e) optional local embeddings (e.g. transformers.js) for hybrid BM25+vector search behind a flag; (f) brief personalisation: `get_brief({topic})` re-ranks planets by relevance to the topic while staying within budget.
**Done when:** benchmark script reports brief tokens and retrieval hit-rate on a fixture vault before/after; brief stays ≤ budget for 10k notes; contradiction detection has tests.

## Phase 6: Open-source release ⬜
**Prompt:** Prepare v1.0: README with GIF/screenshots, CONTRIBUTING, issue templates, SECURITY.md (threat model: local files, localhost server, MCP prompt-injection from note contents, so document that note text is untrusted input to the AI), semantic versioning + CHANGELOG, plugin hooks for importers (ChatGPT export, Notion, Obsidian daily notes), docs site (static), and a demo vault. Run a security review (path traversal, XSS in note rendering, IPC surface).
**Done when:** a stranger can follow the README on a clean Windows, macOS and Linux machine and have the app plus Claude connection running in under 10 minutes.
