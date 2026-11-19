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

## Phase 3: Visual polish ✅ (2026-11-19)
**Prompt:** Upgrade the renderer without hurting performance: (a) cluster planets angularly by folder/tag and add faint orbit labels; (b) real parallax depth and subtle 3D tilt on drag; (c) comet trails for recently-edited notes and a "time-lapse" slider that replays the vault growing by `mtime`; (d) edge bundling or alpha scaling so 2,000 notes stay readable; (e) level-of-detail: labels only for core/planets unless zoomed or focused; (f) themes (deep space, aurora, paper) and a reduced-motion mode; (g) minimap and keyboard navigation; (h) in-app note editor with live link autocomplete (`[[`) that writes back to disk.
**Done when:** 2,000-node synthetic vault holds ≥ 50fps in Chromium (measure and report), screenshots reviewed for overlap/legibility, reduced-motion respected.
**Result:** (a)–(h) all shipped. Measured with `scripts/synth-vault.mjs` (2,000 notes, 2,987 links), 1280×800, headless Chromium with **CPU-only rendering on 4 cores**: 50–57 fps (it started at 6 fps). A real GPU should do better. How:
- One cached glow sprite per colour.
- In vaults over 400 notes: glows only for core notes, the top-60 planets and focused notes; dots batched by colour; links between minor notes hidden until zoom ≥ 1.4; no label blur; cached label widths.
- Reduced motion follows the OS setting and can be toggled with `M`; checked that bodies don't move with it on.
- The editor writes through `/api/write`, which refuses cross-site POSTs. Screenshots: `docs/overview.png`, `docs/paper.png`, `docs/2000-notes.png`, `docs/editor.png`.

## Phase 4: Desktop app & installers ✅ Linux verified · Windows/macOS built by CI, untested (2026-11-19)
**Prompt:** Make the Electron app production quality: first-run vault picker (default `~/Orrery`, or point at an existing Obsidian vault), file watcher (chokidar) pushing live updates over IPC instead of 4s polling, tray icon + global hotkey for quick capture, single-instance lock, app icon set, electron-builder configs for NSIS/dmg/AppImage/deb, code-signing hooks (documented, optional), auto-update via GitHub Releases, CSP on the renderer, and a Settings panel that shows the exact MCP config to copy.
**Done when:** CI builds installers on all three OS, a fresh install launches, creates/opens a vault, shows the graph, and the MCP snippet from Settings works in Claude Desktop (manual checklist in `docs/RELEASE_CHECKLIST.md`).
**Result:**
- **Shipped:** first-run vault picker, a `fs.watch` watcher that pushes changes over IPC (polling every 15 s as a fallback), tray icon, `Ctrl/Cmd+Shift+O` quick capture, single-instance lock, icon (`assets/`), CSP with navigation blocked, Settings panel (vault path, one-click Claude Desktop setup, copyable snippet) and electron-updater on GitHub Releases. Code signing is documented and optional.
- **Verified on Linux:** AppImage (131 MB) and .deb (105 MB) build. The packaged app launches under Xvfb, and the watcher reflects an outside edit in about 250 ms.
- **The packaged MCP server needs no Node install:** Claude Desktop runs the app binary with `ELECTRON_RUN_AS_NODE=1`, using a copy of `mcp.cjs` in userData (AppImage mount paths change on every launch). Tested end to end with an MCP client.
- **Not tested:** Windows and macOS installers (built by CI on a `v*` tag), and the interactive first-run dialog.

### Token efficiency pass (done alongside Phase 4)
- **New tools:** `recall`, a one-call answer within a budget (matching lines plus neighbours); `explore`, which connects the dots (neighbours plus "possibly related" notes that share neighbours but aren't linked); `edit_note`, which appends or replaces an exact passage without resending the note; batched `remember` that skips duplicates.
- **Leaner output:** plain-text results instead of pretty JSON, and `read_note section=` reads one heading.
- **Server instructions:** the MCP server tells Claude how to work cheaply (brief once, recall before read, batch remembers).
- **Measured on the starter vault:** search 202→118 tokens, and search + 2 reads (327) became one recall (158).

## Phase 5: Smarter, cheaper memory ✅ core (a,c,d,f) · ⬜ (b) API summaries, (e) embeddings (2026-11-19)
**Prompt:** Reduce tokens and improve recall: (a) cache parsed index in `.orrery/index.json` keyed by mtime so big vaults load instantly; (b) per-note auto-summaries stored in frontmatter (`summary:`) when missing, generated only on request via an optional `orrery summarize` that uses the user's own API key; (c) *consolidation:* merge Inbox bullets into the right notes, flag contradictions ("lives in X" vs "lives in Y") for the user rather than silently overwriting; (d) *decay & promotion:* notes referenced often rise toward the core, stale ones drift outward; (e) optional local embeddings (e.g. transformers.js) for hybrid BM25+vector search behind a flag; (f) brief personalisation: `get_brief({topic})` re-ranks planets by relevance to the topic while staying within budget.
**Done when:** benchmark script reports brief tokens and retrieval hit-rate on a fixture vault before/after; brief stays ≤ budget for 10k notes; contradiction detection has tests.
**Result:**
- **(a) Parse cache:** in memory for the app and MCP server, plus `.orrery/index.json` keyed by mtime and size. A 10k-note vault produces its brief in about 0.3 s from the CLI.
- **(c) Consolidation:** `orrery consolidate [--yes]` files Inbox bullets that link to exactly one note into that note's `## Log`. Contradictions such as "lives in", "works at", age, best friend or partner are flagged, never auto-resolved. Available as `orrery review` and the `review_memory` MCP tool.
- **(d) Promotion and decay:** `.orrery/usage.json` counts recall, read and explore hits. Used notes rise an orbit; notes untouched for 180 days sink one.
- **(f) Topic brief:** `get_brief(topic=…)` adds a "Relevant to" section and re-ranks planets within the same budget.
- **Obsidian import:** `orrery import-obsidian <dir>` copies notes and attachments, skips `.obsidian/`, and never overwrites (a differing note becomes `X (obsidian).md`).
- **Tests:** the brief stays within budget for a 10k-note vault at 600, 1,800 and 4,000 tokens; contradiction tests included.
- **Not done:** (b) needs an API key and (e) needs a model download. Deferred: plain-text search (BM25) plus `recall` covers retrieval for now.

## Phase 6: Open-source release ⬜
**Prompt:** Prepare v1.0: README with GIF/screenshots, CONTRIBUTING, issue templates, SECURITY.md (threat model: local files, localhost server, MCP prompt-injection from note contents, so document that note text is untrusted input to the AI), semantic versioning + CHANGELOG, plugin hooks for importers (ChatGPT export, Notion, Obsidian daily notes), docs site (static), and a demo vault. Run a security review (path traversal, XSS in note rendering, IPC surface).
**Done when:** a stranger can follow the README on a clean Windows, macOS and Linux machine and have the app plus Claude connection running in under 10 minutes.
