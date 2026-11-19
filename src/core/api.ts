import fs from "node:fs";
import { loadVault, safeNotePath } from "./vault";
import { search } from "./search";
import { buildBrief } from "./brief";
import { remember } from "./capture";

/** Slim payload for the renderer: no bodies, so it stays small even for big vaults. */
export function graphPayload(root: string) {
  const g = loadVault(root);
  return {
    nodes: g.notes.map(n => ({ id: n.id, title: n.title, orbit: n.orbit, tags: n.tags, summary: n.summary, folder: n.folder, mtime: n.mtime, deg: n.links.length })),
    edges: g.edges,
    unresolved: g.notes.reduce((a, n) => a + n.unresolved.length, 0),
  };
}
export function readNote(root: string, id: string) {
  const g = loadVault(root);
  const n = g.notes.find(x => x.id === id);
  if (!n) throw new Error(`no such note: ${id}`);
  const backlinks = g.notes.filter(x => x.links.includes(id)).map(x => x.id);
  return { id: n.id, title: n.title, orbit: n.orbit, tags: n.tags, body: n.body, links: n.links, backlinks };
}
export function writeNote(root: string, id: string, body: string) {
  const f = safeNotePath(root, id);
  if (!fs.existsSync(f)) throw new Error("note does not exist");
  const raw = fs.readFileSync(f, "utf8");
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  fs.writeFileSync(f, (m ? m[0] : "") + body);
}
export const api = {
  graph: graphPayload, note: readNote, write: writeNote, remember,
  search: (root: string, q: string, limit?: number) => search(loadVault(root), q, limit),
  brief: (root: string, budget?: number) => buildBrief(loadVault(root), { budget }),
};
