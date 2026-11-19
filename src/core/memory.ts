/**
 * Token-lean views of the vault for an AI. Everything here returns plain text, not JSON,
 * and is budgeted: Claude should be able to answer most questions in one or two calls.
 */
import fs from "node:fs";
import type { Graph, Note, SearchHit } from "./types";
import { search } from "./search";
import { estimateTokens } from "./brief";
import { safeNotePath } from "./vault";
import { norm } from "./ingest";
import { remember } from "./capture";

const tok = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const byId = (g: Graph) => new Map(g.notes.map(n => [n.id, n]));
const neighbours = (g: Graph, id: string) => {
  const out = new Set<string>();
  for (const e of g.edges) { if (e.source === id) out.add(e.target); if (e.target === id) out.add(e.source); }
  return out;
};

/** `id (orbit) — snippet` one per line: ~3x fewer tokens than pretty JSON. */
export function fmtHits(hits: SearchHit[]): string {
  if (!hits.length) return "no matches";
  return hits.map(h => `${h.id} (${h.orbit}) — ${h.snippet}`).join("\n");
}

/** A note as compact text. `section` returns only that heading's block; `maxChars` truncates. */
export function fmtNote(g: Graph, id: string, opts: { section?: string; maxChars?: number } = {}): string {
  const map = byId(g); const n = map.get(id);
  if (!n) throw new Error(`no such note: ${id}`);
  let body = n.body.replace(/^\s*# .*\n/, "").trim();
  if (opts.section) {
    const m = new RegExp(`^(#{1,6})\\s+${opts.section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").exec(body);
    if (!m) body = `(no section "${opts.section}"; headings: ${(body.match(/^#{1,6} .*/gm) || []).join(" | ") || "none"})`;
    else { const rest = body.slice(m.index + m[0].length); const end = new RegExp(`^#{1,${m[1].length}}\\s`, "m").exec(rest); body = rest.slice(0, end ? end.index : undefined).trim(); }
  }
  const max = opts.maxChars ?? 6000;
  if (body.length > max) body = body.slice(0, max).trimEnd() + `\n…(truncated at ${max} chars; pass section= or a larger max_chars)`;
  const back = g.notes.filter(x => x.links.includes(id)).map(x => x.id);
  return [`# ${n.title} [${n.id}] (${n.orbit}${n.tags.length ? ", #" + n.tags.join(" #") : ""})`, body,
    n.links.length ? `links: ${n.links.join(", ")}` : "", back.length ? `linked from: ${back.join(", ")}` : ""].filter(Boolean).join("\n");
}

/**
 * One-call answer: ranked notes, and from each only the lines that match the query,
 * plus one-hop neighbours as titles. Stays inside `budget` tokens.
 */
export function recall(g: Graph, query: string, budget = 700): string {
  const q = new Set(tok(query)); const hits = search(g, query, 8); const map = byId(g);
  if (!hits.length) return "no matches";
  const out: string[] = []; const used = () => estimateTokens(out.join("\n"));
  for (const h of hits) {
    const n = map.get(h.id)!;
    const lines = n.body.split("\n").map(l => l.trim()).filter(l => l && !/^#\s/.test(l));
    const scored = lines.map(l => ({ l, s: tok(l).filter(w => q.has(w)).length })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.l);
    const nb = [...neighbours(g, n.id)].slice(0, 5).map(i => map.get(i)?.title ?? i);
    const block = [`## ${n.title} [${n.id}]${n.summary ? " — " + n.summary : ""}`, ...(scored.length ? scored : [n.summary || lines[0] || ""]).map(l => "  " + l.slice(0, 220)), nb.length ? `  ↔ ${nb.join(", ")}` : ""].filter(Boolean).join("\n");
    if (used() + estimateTokens(block) > budget) { if (out.length) break; out.push(block.slice(0, budget * 4)); break; }
    out.push(block);
  }
  return out.join("\n");
}

/**
 * Connect the dots around a note: its neighbours as one-liners, plus "bridges" — notes that share
 * two or more neighbours with it but aren't linked yet (likely relationships worth confirming with link_notes).
 */
export function explore(g: Graph, id: string, budget = 600): string {
  const map = byId(g); const n = map.get(id);
  if (!n) throw new Error(`no such note: ${id}`);
  const nb = neighbours(g, id);
  const line = (x: Note) => `- ${x.title} [${x.id}] (${x.orbit})${x.summary ? " — " + x.summary.slice(0, 120) : ""}`;
  const out = [`# ${n.title} [${n.id}] — ${n.summary || ""}`, `## Connected (${nb.size})`];
  const ranked = [...nb].map(i => map.get(i)).filter((x): x is Note => !!x).sort((a, b) => ["core", "planet", "moon", "asteroid"].indexOf(a.orbit) - ["core", "planet", "moon", "asteroid"].indexOf(b.orbit));
  for (const x of ranked) { if (estimateTokens(out.join("\n")) > budget * 0.7) { out.push(`- …+${ranked.length - out.length + 2} more`); break; } out.push(line(x)); }
  const shared = new Map<string, number>();
  for (const x of nb) for (const y of neighbours(g, x)) if (y !== id && !nb.has(y)) shared.set(y, (shared.get(y) || 0) + 1);
  const bridges = [...shared].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (bridges.length) { out.push("## Possibly related (share neighbours, not linked)"); for (const [b, c] of bridges) out.push(`- ${map.get(b)?.title ?? b} [${b}] — ${c} shared`); }
  return out.join("\n");
}

/** Small edits without resending the whole note: append text, or replace one exact passage. */
export function editNote(root: string, id: string, op: { append?: string; replace?: { old: string; new: string } }): string {
  const f = safeNotePath(root, id);
  if (!fs.existsSync(f)) throw new Error(`no such note: ${id}`);
  let raw = fs.readFileSync(f, "utf8");
  if (op.replace) {
    const i = raw.indexOf(op.replace.old);
    if (i < 0) throw new Error("text to replace not found (copy it exactly from read_note)");
    if (raw.indexOf(op.replace.old, i + 1) >= 0) throw new Error("text to replace occurs more than once; include more context");
    raw = raw.slice(0, i) + op.replace.new + raw.slice(i + op.replace.old.length);
  }
  if (op.append) raw = raw.replace(/\s*$/, "\n") + op.append.trim() + "\n";
  fs.writeFileSync(f, raw);
  return `updated ${id}`;
}

/** Save several facts in one call; facts already present anywhere in the vault are skipped. */
export function rememberMany(root: string, g: Graph, facts: { text: string; links?: string[]; note?: string }[]): string {
  const known = new Set<string>();
  for (const n of g.notes) for (const l of n.body.split("\n")) { const t = norm(l.replace(/^\s*-\s*(\d\d:\d\d\s+)?/, "").replace(/\[\[[^\]]*\]\]/g, "")); if (t) known.add(t); }
  const saved: string[] = []; let skipped = 0;
  for (const f of facts) {
    const k = norm(f.text.replace(/\[\[[^\]]*\]\]/g, ""));
    if (!k || known.has(k)) { skipped++; continue; }
    known.add(k); saved.push(remember(root, f.text, { links: f.links, note: f.note }).id);
  }
  return `saved ${saved.length}${saved.length ? " → " + [...new Set(saved)].join(", ") : ""}${skipped ? `; ${skipped} already known` : ""}`;
}
