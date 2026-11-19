# Contributing

```bash
npm install --legacy-peer-deps
npm run build && npm test && npm run typecheck
npm run app          # desktop app (dev)
node dist/cli.cjs serve --vault ./template   # browser at http://127.0.0.1:4747
```

- **Layout:** `src/core/` holds the vault logic shared by the CLI, MCP server, HTTP server and Electron. `src/renderer/` is the Canvas UI. `electron/` is the desktop shell.
- **Rules:** keep MCP output plain text and token-budgeted. Never overwrite user notes without a preview or backup. Add a test for every core change.
- **Performance:** check with `node scripts/synth-vault.mjs /tmp/big 2000`, then serve it. Large vaults should hold ≥ 50 fps.
- **Releases:** see `docs/RELEASE_CHECKLIST.md`.
