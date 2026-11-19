import fs from "node:fs";
import path from "node:path";
import type { Graph, Note, Orbit, Edge } from "./types";

const IGNORE = new Set([".git", ".obsidian", "node_modules", ".trash", ".orrery"]);
const FOLDER_ORBIT: Record<string, Orbit> = {
  core: "core", values: "planet", projects: "planet", people: "planet", goals: "planet",
};

export function parseFrontmatter(raw: string): { meta: Record<string, string>; tags: string[]; body: string } {
  const meta: Record<string, string> = {};
  let tags: string[] = [];
  let body = raw;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      const key = kv[1].toLowerCase();
      let val = kv[2].trim().replace(/^["']|["']$/g, "");
      if (key === "tags") {
        tags = val.replace(/^\[|\]$/g, "").split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);
      } else meta[key] = val;
    }
  }
  for (const t of body.matchAll(/(?:^|\s)#([A-Za-z][\w/-]*)/g)) if (!tags.includes(t[1])) tags.push(t[1]);
  return { meta, tags, body };
}

export function extractWikilinks(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) out.push(m[1].trim());
  return out;
}

export function summarize(body: string, max = 160): string {
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith(">") || t.startsWith("---")) continue;
    const clean = t.replace(/^[-*]\s+/, "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);
    return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
  }
  return "";
}

function walk(dir: string, root: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(e.name) || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, root, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(p);
  }
}

export function loadVault(root: string): Graph {
  const files: string[] = [];
  if (fs.existsSync(root)) walk(root, root, files);
  const notes: Note[] = [];
  const byKey = new Map<string, string>(); // lowercased id or title -> id
  for (const f of files) {
    const id = path.relative(root, f).replace(/\\/g, "/").replace(/\.md$/i, "");
    const raw = fs.readFileSync(f, "utf8");
    const { meta, tags, body } = parseFrontmatter(raw);
    const base = id.split("/").pop()!;
    const title = meta.title || base;
    const first = id.includes("/") ? id.split("/")[0] : "";
    notes.push({
      id, title, folder: first, tags, body, meta, links: [], unresolved: [],
      summary: meta.summary || summarize(body), mtime: fs.statSync(f).mtimeMs, orbit: "asteroid",
    });
    byKey.set(id.toLowerCase(), id);
    if (!byKey.has(base.toLowerCase())) byKey.set(base.toLowerCase(), id);
    if (!byKey.has(title.toLowerCase())) byKey.set(title.toLowerCase(), id);
  }
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const degree = new Map<string, number>();
  for (const n of notes) {
    for (const l of extractWikilinks(n.body)) {
      const t = byKey.get(l.toLowerCase());
      if (!t) { if (!n.unresolved.includes(l)) n.unresolved.push(l); continue; }
      if (t === n.id) continue;
      if (!n.links.includes(t)) n.links.push(t);
      const k = n.id < t ? `${n.id}\0${t}` : `${t}\0${n.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({ source: n.id, target: t });
      degree.set(n.id, (degree.get(n.id) || 0) + 1);
      degree.set(t, (degree.get(t) || 0) + 1);
    }
  }
  for (const n of notes) {
    const explicit = (n.meta.orbit || "").toLowerCase() as Orbit;
    if (["core", "planet", "moon", "asteroid"].includes(explicit)) { n.orbit = explicit; continue; }
    const byFolder = FOLDER_ORBIT[n.folder.toLowerCase()];
    if (byFolder) { n.orbit = byFolder; continue; }
    const d = degree.get(n.id) || 0;
    n.orbit = d >= 4 ? "planet" : d >= 1 ? "moon" : "asteroid";
  }
  return { notes, edges };
}

export function safeNotePath(root: string, id: string): string {
  const p = path.resolve(root, id + ".md");
  if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error("path escapes vault");
  return p;
}
