// Build a single self-contained HTML demo (starter vault embedded): node scripts/build-demo.mjs <out.html>
import { build } from "esbuild"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
const out = process.argv[2] || "demo.html";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orrery-demo-"));
await build({ bundle: true, platform: "node", format: "cjs", outfile: path.join(tmp, "dump.cjs"), logLevel: "error",
  stdin: { resolveDir: process.cwd(), contents: `import { api } from "./src/core/api"; import { initVault } from "./src/core/capture";
    const v = process.argv[2]; initVault(v, "template"); const graph = api.graph(v); const notes = {}; for (const n of graph.nodes) notes[n.id] = api.note(v, n.id);
    process.stdout.write(JSON.stringify({ graph, notes }));` } });
const { execFileSync } = await import("node:child_process");
const data = execFileSync("node", [path.join(tmp, "dump.cjs"), path.join(tmp, "vault")]).toString();
const dir = "dist/renderer"; let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, "");
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/, (_, f) => `<style>${fs.readFileSync(path.join(dir, f), "utf8")}</style>`);
html = html.replace(/<script type="module" crossorigin src="\.?\/?([^"]+)"><\/script>/, (_, f) => `<script>window.__ORRERY_DEMO__=${data.replace(/</g, "\\u003c")}</script><script type="module">${fs.readFileSync(path.join(dir, f), "utf8").replace(/<\/script/g, "<\\/script")}</script>`);
fs.writeFileSync(out, html); console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
