// Generate a synthetic vault for performance testing: node scripts/synth-vault.mjs <dir> [count]
import fs from "node:fs"; import path from "node:path";
const [dir, n = "2000"] = process.argv.slice(2); const N = +n;
if (!dir) { console.error("usage: synth-vault.mjs <dir> [count]"); process.exit(1); }
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const folders = ["Core", "Projects", "People", "Goals", "Values", "Ideas", "Reading", "Journal", "Inbox"];
const notes = Array.from({ length: N }, (_, i) => ({ folder: i < 4 ? "Core" : folders[1 + Math.floor(rnd() * (folders.length - 1))], title: `Note ${i}` }));
const now = Date.now();
notes.forEach((nt, i) => {
  const links = Array.from({ length: Math.floor(rnd() * 4) }, () => notes[Math.floor(Math.pow(rnd(), 2) * N)].title).filter(t => t !== nt.title);
  const d = path.join(dir, nt.folder); fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, nt.title + ".md");
  fs.writeFileSync(f, `---\nsummary: Synthetic note ${i}\n---\n# ${nt.title}\n\nBody ${i}. ${links.map(l => `[[${l}]]`).join(" ")}\n`);
  const t = new Date(now - (N - i) * 3600e3 * 4); fs.utimesSync(f, t, t);
});
console.log(`wrote ${N} notes to ${dir}`);
