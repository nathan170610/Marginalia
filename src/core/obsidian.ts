import fs from "node:fs";
import path from "node:path";

/**
 * Copy an Obsidian vault's markdown into an Orrery vault, keeping folders and [[links]] as they are.
 * Never overwrites: a note that already exists with different content is saved as "<name> (obsidian).md".
 * Attachments (images, PDFs) are copied too so embeds keep working. .obsidian/ and .trash/ are skipped.
 */
export function importObsidian(src: string, dest: string, opts: { dryRun?: boolean } = {}) {
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) throw new Error(`not a folder: ${src}`);
  const r = { notes: 0, attachments: 0, unchanged: 0, renamed: [] as string[] };
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const from = path.join(dir, e.name);
      if (e.isDirectory()) { walk(from); continue; }
      if (!e.isFile()) continue;
      const rel = path.relative(src, from); let to = path.join(dest, rel);
      const isNote = /\.md$/i.test(e.name);
      if (fs.existsSync(to)) {
        if (fs.readFileSync(to).equals(fs.readFileSync(from))) { r.unchanged++; continue; }
        if (!isNote) continue; // keep the existing attachment
        to = to.replace(/\.md$/i, " (obsidian).md"); r.renamed.push(path.relative(dest, to).split(path.sep).join("/"));
        if (fs.existsSync(to)) { r.unchanged++; continue; }
      }
      if (!opts.dryRun) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
      if (isNote) r.notes++; else r.attachments++;
    }
  };
  walk(src);
  return r;
}
