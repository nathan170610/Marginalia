/**
 * Memory hygiene. Two jobs, both reviewable before anything changes:
 *  1. File Inbox bullets that link to a note into that note's "## Log" section.
 *  2. Flag contradictions ("I live in Paris" vs "I live in Lyon") for the user. Never overwrite silently.
 */
import fs from "node:fs";
import type { Graph } from "./types";
import { safeNotePath, extractWikilinks } from "./vault";

// Single-valued facts about the user: a key, and the value captured after it.
const FACT_PATTERNS: [string, RegExp][] = [
  ["lives in", /\bI (?:live|am living|moved) (?:in|to) ([A-Z][\w .'-]{1,40})/],
  ["works at", /\bI (?:work|am working) (?:at|for) ([A-Z][\w .&'-]{1,40})/],
  ["job", /\bI(?:'m| am) an? ([a-z][\w -]{2,40}?) (?:by profession|for a living)\b/i],
  ["age", /\bI(?:'m| am) (\d{1,3}) (?:years old|yo)\b/i],
  ["birthday", /\bmy birthday is (?:on )?([\w ,]{3,30})/i],
  ["best friend", /\bmy best friend is ([A-Z][\w'-]+(?: [A-Z][\w'-]+)?)/],
  ["partner", /\bmy (?:girlfriend|boyfriend|partner|wife|husband) is ([A-Z][\w'-]+)/],
  ["school", /\bI (?:study|go to school|am studying) at ([A-Z][\w .'-]{1,40})/],
];
const clean = (v: string) => v.replace(/[.,;!].*$/, "").trim().replace(/\s+(now|currently|since.*)$/i, "");

export interface Fact { key: string; value: string; note: string; line: string; when: number }
export interface Contradiction { key: string; facts: Fact[] }

export function extractFacts(g: Graph): Fact[] {
  const out: Fact[] = [];
  for (const n of g.notes) for (const line of n.body.split("\n")) {
    if (/^\s*>|~~/.test(line)) continue; // quotes and struck-out lines are not current facts
    for (const [key, re] of FACT_PATTERNS) {
      const m = re.exec(line); if (!m) continue;
      out.push({ key, value: clean(m[1]), note: n.id, line: line.trim(), when: n.mtime });
    }
  }
  return out;
}

export function findContradictions(g: Graph): Contradiction[] {
  const by = new Map<string, Fact[]>();
  for (const f of extractFacts(g)) (by.get(f.key) ?? by.set(f.key, []).get(f.key)!).push(f);
  const out: Contradiction[] = [];
  for (const [key, fs_] of by) {
    const values = new Set(fs_.map(f => f.value.toLowerCase()));
    if (values.size > 1) out.push({ key, facts: fs_.sort((a, b) => b.when - a.when) });
  }
  return out;
}

export interface FilingPlan { from: string; line: string; to: string }

/** Inbox bullets with exactly one resolvable link go to that note. Ambiguous ones stay put. */
export function planFiling(g: Graph): FilingPlan[] {
  const byKey = new Map<string, string>();
  for (const n of g.notes) { byKey.set(n.id.toLowerCase(), n.id); byKey.set(n.title.toLowerCase(), n.id); byKey.set(n.id.split("/").pop()!.toLowerCase(), n.id); }
  const plan: FilingPlan[] = [];
  for (const n of g.notes) {
    if (!/^inbox\//i.test(n.id)) continue;
    for (const line of n.body.split("\n")) {
      if (!/^\s*-\s/.test(line)) continue;
      const targets = [...new Set(extractWikilinks(line).map(l => byKey.get(l.toLowerCase())).filter((x): x is string => !!x && !/^inbox\//i.test(x)))];
      if (targets.length === 1) plan.push({ from: n.id, line, to: targets[0] });
    }
  }
  return plan;
}

export function applyFiling(root: string, plan: FilingPlan[]): number {
  const date = (id: string) => /(\d{4}-\d{2}-\d{2})/.exec(id)?.[1] ?? "";
  for (const p of plan) {
    const to = safeNotePath(root, p.to); let raw = fs.readFileSync(to, "utf8");
    const entry = p.line.replace(/^\s*-\s*(\d\d:\d\d\s+)?/, `- ${date(p.from)} `).trimEnd();
    raw = /^## Log\s*$/m.test(raw) ? raw.replace(/^## Log\s*$/m, m => `${m}\n${entry}`) : raw.replace(/\s*$/, "\n\n## Log\n") + entry + "\n";
    fs.writeFileSync(to, raw);
    const from = safeNotePath(root, p.from);
    fs.writeFileSync(from, fs.readFileSync(from, "utf8").split("\n").filter(l => l !== p.line).join("\n"));
  }
  return plan.length;
}

/** Compact text report for Claude or the CLI. */
export function reviewText(g: Graph): string {
  const c = findContradictions(g); const plan = planFiling(g);
  const out: string[] = [];
  if (c.length) {
    out.push("## Possible contradictions (ask the user which is current; then fix with edit_note)");
    for (const x of c) out.push(`- ${x.key}: ` + x.facts.map(f => `"${f.value}" (${f.note})`).join(" vs "));
  }
  if (plan.length) { out.push(`## Inbox items ready to file (${plan.length}); run consolidate to apply`); for (const p of plan.slice(0, 15)) out.push(`- ${p.from} → ${p.to}: ${p.line.trim().slice(0, 100)}`); }
  return out.length ? out.join("\n") : "memory is tidy: no contradictions, nothing to file";
}
