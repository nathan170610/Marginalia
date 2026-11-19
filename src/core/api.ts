import fs from "node:fs";
import path from "node:path";
import { loadVault, safeNotePath } from "./vault";
import { findContradictions } from "./consolidate";
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
  return { id, saved: true };
}
export function linkNotes(root: string, a: string, b: string, reason = "") {
  const g = loadVault(root);
  if (!g.notes.some(n => n.id === a)) throw new Error(`no such note: ${a}`);
  if (!g.notes.some(n => n.id === b)) throw new Error(`no such note: ${b}`);
  if (a === b) throw new Error("cannot link a note to itself");
  if (g.notes.find(n => n.id === a)!.links.includes(b)) return { linked: false, reason: "already linked" };
  fs.appendFileSync(safeNotePath(root, a), `\n- related: [[${b}]]${reason ? " — " + reason.replace(/\n/g, " ") : ""}\n`);
  return { linked: true };
}
/** New note from the app. Ids are vault-relative ("Projects/Idea"); refuses to overwrite. */
export function createNote(root: string, id: string, body = "") {
  const clean = id.trim().replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\/+|\/+$/g, "");
  if (!clean || /[<>:"|?*]/.test(clean)) throw new Error("invalid note name");
  const f = safeNotePath(root, clean);
  if (fs.existsSync(f)) throw new Error("a note with that name already exists");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body || `# ${path.basename(clean)}\n\n`);
  return { id: clean };
}
/** Memory health for the settings panel: orphans, broken links, contradictions, hubs. */
export function vaultHealth(root: string) {
  const g = loadVault(root);
  const linked = new Set(g.edges.flatMap(e => [e.source, e.target]));
  const deg = new Map<string, number>(); for (const e of g.edges) for (const k of [e.source, e.target]) deg.set(k, (deg.get(k) || 0) + 1);
  const week = Date.now() - 7 * 864e5;
  return {
    notes: g.notes.length, links: g.edges.length,
    words: g.notes.reduce((a, n) => a + (n.body.match(/\S+/g)?.length || 0), 0),
    orphans: g.notes.filter(n => !linked.has(n.id)).map(n => n.id),
    unresolved: g.notes.flatMap(n => n.unresolved.map(u => ({ from: n.id, to: u }))),
    contradictions: findContradictions(g).map(c => ({ key: c.key, values: c.facts.map(f => f.value), notes: [...new Set(c.facts.map(f => f.note))] })),
    hubs: [...deg].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ id, n })),
    thisWeek: g.notes.filter(n => n.mtime >= week).length,
  };
}
export const api = {
  graph: graphPayload, note: readNote, write: writeNote, remember, link: linkNotes, create: createNote, health: vaultHealth,
  search: (root: string, q: string, limit?: number) => search(loadVault(root), q, limit),
  brief: (root: string, budget?: number, topic?: string) => buildBrief(loadVault(root), { budget, topic }),
};
