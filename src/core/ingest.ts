import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadVault } from "./vault";

/** Shape of a Claude data export (Settings → Privacy → Export data → conversations.json). */
interface ExportMsg { sender?: string; text?: string; content?: { type?: string; text?: string }[]; created_at?: string }
interface ExportConv { uuid: string; name?: string; created_at?: string; updated_at?: string; chat_messages?: ExportMsg[] }

export interface ProposedNote { id: string; sourceId: string; title: string; date: string; facts: string[]; links: string[]; content: string }
export interface IngestResult { created: ProposedNote[]; skipped: number; duplicateFacts: number }

// First-person statements that tend to be durable (identity, preference, decision, plans, people).
const DURABLE = /\b(i am|i'm|i was born|my (name|age|birthday|wife|husband|partner|girlfriend|boyfriend|friend|best friend|brother|sister|mom|mother|dad|father|son|daughter|job|goal|dream|project|company|school|values?)|i (live|work|study|prefer|love|like|hate|dislike|want|need|value|believe|decided|chose|plan|am planning|am building|am learning|always|never|usually))\b/i;
const NOISE = /\b(can you|could you|please|help me|how do i|what is|what's|write|fix|explain|why does|thanks|thank you)\b/i;

const msgText = (m: ExportMsg) => (m.text || (m.content || []).filter(c => c.type === "text").map(c => c.text || "").join("\n")).trim();
export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

export function extractFacts(text: string, max = 8): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/```[\s\S]*?```/g, " ").split(/(?<=[.!?])\s+|\n+/)) {
    const s = raw.trim().replace(/^[-*>\d.)\s]+/, "");
    if (s.length < 12 || s.length > 220 || !DURABLE.test(s) || NOISE.test(s) || s.endsWith("?")) continue;
    if (!out.some(o => norm(o) === norm(s))) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function readExport(src: string): ExportConv[] {
  let json: string;
  if (fs.statSync(src).isDirectory()) json = fs.readFileSync(path.join(src, "conversations.json"), "utf8");
  else if (src.toLowerCase().endsWith(".zip")) json = execFileSync("unzip", ["-p", src, "conversations.json"], { maxBuffer: 1 << 30 }).toString("utf8");
  else json = fs.readFileSync(src, "utf8");
  const data = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error("expected an array of conversations");
  return data;
}

const slug = (s: string) => (s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim() || "Untitled").slice(0, 60);

/** Turn an export into Conversation notes. Idempotent: conversations already imported (by source_id) are skipped, facts already in the vault are dropped. */
export function ingestClaude(root: string, src: string, opts: { dryRun?: boolean; all?: boolean } = {}): IngestResult {
  const g = loadVault(root);
  const imported = new Set(g.notes.map(n => n.meta.source_id).filter(Boolean));
  const known = new Set<string>();
  for (const n of g.notes) for (const l of n.body.split("\n")) { const t = norm(l.replace(/^\s*-\s*(\d\d:\d\d\s+)?/, "")); if (t) known.add(t); }
  const linkables = g.notes.filter(n => n.title.length >= 4 && !n.id.startsWith("Conversations/") && !n.id.startsWith("Inbox/"))
    .map(n => ({ id: n.id, re: new RegExp(`\\b${n.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));
  const res: IngestResult = { created: [], skipped: 0, duplicateFacts: 0 };
  for (const c of readExport(src)) {
    if (!c.uuid || imported.has(c.uuid)) { res.skipped++; continue; }
    const human = (c.chat_messages || []).filter(m => m.sender === "human").map(msgText).filter(Boolean);
    if (!human.length) { res.skipped++; continue; }
    const facts = extractFacts(human.join("\n")).filter(f => { const dup = known.has(norm(f)); if (dup) res.duplicateFacts++; else known.add(norm(f)); return !dup; });
    if (!facts.length && !opts.all) { res.skipped++; continue; }
    const date = (c.created_at || c.updated_at || "").slice(0, 10) || "unknown";
    const title = slug(c.name || human[0].slice(0, 50));
    const hay = (c.name || "") + "\n" + human.join("\n");
    const links = linkables.filter(l => l.re.test(hay)).map(l => l.id).slice(0, 8);
    let id = `Conversations/${date} ${title}`; let k = 2;
    while (fs.existsSync(path.join(root, id + ".md")) || res.created.some(p => p.id === id)) id = `Conversations/${date} ${title} (${k++})`;
    const first = human[0].replace(/\s+/g, " ").slice(0, 140);
    const content = `---\nsummary: "${(facts[0] || first).replace(/"/g, "'")}"\nsource: claude-export\nsource_id: ${c.uuid}\ndate: ${date}\norbit: ${facts.length ? "moon" : "asteroid"}\ntags: [conversation]\n---\n# ${c.name || title}\n\n${facts.length ? "## Facts\n" + facts.map(f => `- ${f}`).join("\n") + "\n\n" : ""}## Context\n- Started with: ${first}\n${links.length ? "- Related: " + links.map(l => `[[${l}]]`).join(" ") + "\n" : ""}`;
    res.created.push({ id, sourceId: c.uuid, title: c.name || title, date, facts, links, content });
  }
  if (!opts.dryRun) for (const p of res.created) { const f = path.join(root, p.id + ".md"); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, p.content); }
  return res;
}
