import type { Graph, Note } from "./types";
import { search } from "./search";

/** Rough token estimate (~4 chars/token). Good enough for budgeting. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export interface BriefOptions { budget?: number; recent?: number; topic?: string }

/**
 * The brief is what an AI reads at the start of every conversation.
 * Tiered by orbit so the most important context is always included first and
 * detail degrades gracefully when the token budget runs out:
 *   core     -> full text (capped)
 *   planets  -> one line + neighbours
 *   moons    -> titles only
 *   asteroids-> count only
 */
export function buildBrief(g: Graph, opts: BriefOptions = {}): string {
  const budget = opts.budget ?? 1800;
  const out: string[] = [];
  const used = () => estimateTokens(out.join("\n"));
  const push = (s: string) => { if (used() + estimateTokens(s) <= budget) { out.push(s); return true; } return false; };
  const by = (o: Note["orbit"]) => g.notes.filter(n => n.orbit === o).sort((a, b) => (b.links.length - a.links.length) || a.id.localeCompare(b.id));

  push("# Memory brief (Orrery)");
  push("Persistent memory of the user. Core = identity & values (full). Planets = key projects/people/goals (one-liners). Moons = supporting notes. Use `search` / `read_note` for detail; use `remember` to add new facts.");

  const core = by("core");
  if (core.length) {
    push("\n## Core");
    for (const n of core) {
      const text = n.body.replace(/^\s*# .*\n/, "").replace(/\n{3,}/g, "\n\n").trim();
      const cap = Math.max(300, Math.floor(budget * 0.45 / core.length)) * 4;
      push(`### ${n.title} [[${n.id}]]\n${text.length > cap ? text.slice(0, cap).trimEnd() + " …(truncated, read_note for rest)" : text}`);
    }
  }
  // topic: surface the most relevant notes first and re-rank planets, all inside the same budget
  const rel = new Map<string, number>();
  if (opts.topic) {
    const hits = search(g, opts.topic, 12); hits.forEach((h, i) => rel.set(h.id, hits.length - i));
    if (hits.length) {
      push(`\n## Relevant to "${opts.topic}"`);
      for (const h of hits.slice(0, 5)) if (!push(`- ${h.title} (${h.id}) — ${h.snippet}`)) break;
    }
  }
  const planets = by("planet").sort((a, b) => (rel.get(b.id) || 0) - (rel.get(a.id) || 0));
  if (planets.length) {
    push("\n## Planets");
    for (const n of planets) {
      const nb = n.links.slice(0, 4).map(l => `[[${l}]]`).join(" ");
      if (!push(`- **${n.title}** (${n.id}) — ${n.summary}${nb ? "  → " + nb : ""}`)) break;
    }
  }
  const moons = by("moon");
  if (moons.length) {
    push("\n## Moons");
    let line = "";
    for (const n of moons) {
      const piece = (line ? ", " : "") + n.title;
      if (estimateTokens(line + piece) > 60) { if (!push(line)) break; line = n.title; } else line += piece;
    }
    if (line) push(line);
  }
  const recent = [...g.notes].sort((a, b) => b.mtime - a.mtime).slice(0, opts.recent ?? 5);
  if (recent.length) {
    push("\n## Recently changed");
    for (const n of recent) if (!push(`- ${n.title} (${n.id}) — ${n.summary}`)) break;
  }
  const ast = by("asteroid").length;
  if (ast) push(`\n(+${ast} asteroid notes not listed; reachable via search.)`);
  push(`\n<!-- ${g.notes.length} notes, ${g.edges.length} links, ~${used()} tokens -->`);
  return out.join("\n");
}
