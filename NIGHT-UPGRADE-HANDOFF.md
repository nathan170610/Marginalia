# Night upgrade: where it stopped (2026-11-19, ~21:45)

The session stopped here because the 5-hour usage limit was near.

## Done
- **Branch:** `claude/night-upgrade`, pushed to GitHub with 3 commits.
- **Checks:** 32 tests pass, plus typecheck and build.
- **Browser check:** the orbit, constellation and timeline views work in the browser, with no console errors.

## Added
**Backend**
- `create` (new note) and `health` endpoints: IPC, HTTP and the demo backend, plus `test/phase6.test.ts`.

**Look**
- Procedural planet textures lit by the sun, rings on hub notes, a nebula noise texture.
- Themes "solar" and "midnight ink", with a cross-fade between themes.

**3D**
- Right-drag or Shift+drag to tilt and spin.
- Double-click to reset the view.
- Depth of field (`D`).
- Fly-to camera, and follow mode (`F`).

**Views** (`V` cycles them)
- Orbit, constellation (force layout), timeline (folder lanes), and a list overlay.

**Reader**
- Text size A−/A+, a serif font, width (`W`: wide/full/narrow), and focus dimming.
- A table of contents, reading time, link hover previews, and a better markdown renderer (code, quotes, tasks, highlights, tags).

**More**
- `Ctrl+K` palette: actions, themes, views, folder filters and notes.
- Tier filters and a "last 7 days" highlight in the legend.
- Pins.
- New note (`N`).
- Random note (`R`), tour (`P`), zen mode (`Z`), PNG export.
- Back and forward (`[` `]`).
- Memory health in Settings.

## Remaining (in order)
1. **Tune the timeline.** When most notes share one date, spread the x-axis by rank instead of by date. The code is `timeline()` in `src/renderer/views.ts`.
2. **Test the real app.** Run `npm run app`, then try every button with computer use: palette, list, new note, reader buttons and health.
3. **Prepare the release.**
   - Set the version in `package.json` to 0.4.0.
   - Add a CHANGELOG entry and update the README features list.
   - Delete this file, then commit.
4. **Merge.** Open the PR `claude/night-upgrade` → `main` on github.com/nathan170610/Marginalia and merge it, using Claude in Chrome.
5. **Release.**
   - Tag it: `git checkout main && git pull && git tag v0.4.0 && git push origin v0.4.0`.
   - This runs `release.yml`, which builds the installers and publishes a GitHub Release.
6. **Download.** Get the Windows installer from the Release into `C:\Users\lecom\Downloads\orrery-release\`.
   - Nathan runs it himself. It installs to `C:\Program Files\Orrery`, so Windows asks for admin.
   - electron-updater may also offer the update automatically.
