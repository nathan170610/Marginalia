import type { Graph, SearchHit } from "./types";

const tok = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

export function search(g: Graph, query: string, limit = 8): SearchHit[] {
  const q = tok(query);
  if (!q.length) return [];
  const N = g.notes.length || 1;
  const docs = g.notes.map(n => {
    const fields = { t: tok(n.title + " " + n.id), g: tok(n.tags.join(" ")), b: tok(n.summary + " " + n.body) };
    return { n, fields, len: fields.b.length + 1 };
  });
  const avg = docs.reduce((a, d) => a + d.len, 0) / N || 1;
  const df = new Map<string, number>();
  for (const w of new Set(q)) df.set(w, docs.filter(d => d.fields.t.includes(w) || d.fields.g.includes(w) || d.fields.b.includes(w)).length);
  const hits: SearchHit[] = [];
  for (const d of docs) {
    let score = 0;
    for (const w of q) {
      const idf = Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5));
      const tf = d.fields.b.filter(x => x === w).length;
      const bm = (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.len / avg));
      const boost = (d.fields.t.includes(w) ? 3 : 0) + (d.fields.g.includes(w) ? 1.5 : 0);
      score += idf * (bm + boost);
    }
    if (score > 0) {
      const orbitBoost = { core: 1.3, planet: 1.15, moon: 1, asteroid: 0.9 }[d.n.orbit];
      hits.push({ id: d.n.id, title: d.n.title, orbit: d.n.orbit, score: +(score * orbitBoost).toFixed(3), snippet: snippet(d.n.body || d.n.summary, q) });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function snippet(text: string, q: string[]): string {
  const flat = text.replace(/\s+/g, " ");
  const low = flat.toLowerCase();
  let at = -1;
  for (const w of q) { const i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = Math.max(0, at - 40);
  return (start > 0 ? "…" : "") + flat.slice(start, start + 140).trim() + (flat.length > start + 140 ? "…" : "");
}
