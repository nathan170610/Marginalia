# Release checklist

## Cut a release
1. Bump `version` in `package.json`, commit, then `git tag v0.x.y && git push --tags`.
2. `.github/workflows/release.yml` builds Windows (NSIS `.exe`), macOS (`.dmg`) and Linux (`.AppImage`, `.deb`) and attaches them to a GitHub Release.
3. The packaged app checks that Release feed on launch (electron-updater) and offers the update.

## Code signing (optional, documented, off by default)
Without signing, Windows SmartScreen and macOS Gatekeeper warn on first launch. Users can still open the app: Windows "More info → Run anyway"; macOS right-click → Open.
- **macOS:** add repo secrets `CSC_LINK` (base64 .p12 Developer ID), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. electron-builder signs and notarizes automatically.
- **Windows:** add `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.
- Pass them as `env:` on the `electron-builder` step.

## Manual smoke test per OS (fresh user account)
- [ ] The installer runs, and the app launches with the Orrery icon.
- [ ] First run asks: **Create ~/Orrery** or **Open existing folder** (try an Obsidian vault).
- [ ] The graph shows the starter notes; click one, then edit and save it.
- [ ] Edit a `.md` file in another editor: the app updates within about a second (file watcher).
- [ ] `Ctrl/Cmd+Shift+O` from another app brings up Orrery with the capture box focused, and the tray menu works.
- [ ] Launching a second time focuses the existing window (single instance).
- [ ] ⚙ Settings → **Connect automatically**, then restart Claude Desktop. In a chat, ask "what do you know about me?" Claude should call `get_brief` and `recall`.
- [ ] Settings → Change vault… switches the graph.
