import fs from "node:fs";
import path from "node:path";
import { safeNotePath } from "./vault";

const today = () => new Date().toISOString().slice(0, 10);
const hhmm = () => new Date().toISOString().slice(11, 16);

/** Append a memory. Goes to a daily Inbox note unless `note` is given. Wikilinks in text become graph edges. */
export function remember(root: string, text: string, opts: { note?: string; links?: string[] } = {}): { id: string } {
  const id = opts.note || `Inbox/${today()}`;
  const file = safeNotePath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const links = (opts.links || []).filter(l => !text.includes(`[[${l}]]`)).map(l => `[[${l}]]`).join(" ");
  const line = `- ${hhmm()} ${text.trim()}${links ? " " + links : ""}\n`;
  if (!fs.existsSync(file)) fs.writeFileSync(file, `---\nsummary: Memories captured on ${today()}\n---\n# ${path.basename(id)}\n\n${line}`);
  else fs.appendFileSync(file, line);
  return { id };
}

export function initVault(root: string, templateDir: string): number {
  let n = 0;
  const copy = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const s = path.join(from, e.name), d = path.join(to, e.name);
      if (e.isDirectory()) copy(s, d);
      else if (!fs.existsSync(d)) { fs.copyFileSync(s, d); n++; }
    }
  };
  copy(templateDir, root);
  return n;
}
