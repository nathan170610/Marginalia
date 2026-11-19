import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./core/api";
import { resolveVault } from "./core/config";
import { loadVault } from "./core/vault";
import { fmtHits, fmtNote, recall, explore, editNote, rememberMany } from "./core/memory";

const vault = resolveVault();

/** Sent to Claude once when it connects: the cheapest way to use this memory. */
const INSTRUCTIONS = `Orrery is the user's long-term memory: a vault of markdown notes. Use it to keep context outside the conversation, and spend as few tokens as you can.
1. At the start of a conversation, call get_brief once. Don't call it again in the same conversation.
2. To find something, use recall: one call returns the matching lines and connected notes. Use read_note only when you need a whole note, and prefer its section= option.
3. To connect the dots, use explore on a note. It lists its neighbours and notes that look related but aren't linked yet. When a relationship is real, link it with link_notes.
4. When the user shares something durable (a decision, preference, goal, person, or status change), save it with remember. Batch several facts into one call, one short sentence each, with [[links]]. Never save transcripts.
5. To change a note, use edit_note (append, or replace one exact passage) instead of rewriting it with update_note.`;

const server = new McpServer({ name: "orrery", version: "0.2.0" }, { instructions: INSTRUCTIONS });
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

server.tool("get_brief",
  "Call ONCE at the start of a conversation. Compact, token-budgeted summary of the user: identity, values, projects, people, recent changes.",
  { budget: z.number().int().min(300).max(8000).optional().describe("max tokens, default 1800") },
  async ({ budget }) => text(api.brief(vault, budget)));

server.tool("recall",
  "Best first move for any question about the user. Returns the matching lines from the most relevant notes and their connected notes, within a token budget, in one call.",
  { query: z.string(), budget: z.number().int().min(150).max(3000).optional().describe("max tokens, default 700") },
  async ({ query, budget }) => text(recall(loadVault(vault), query, budget)));

server.tool("search", "Ranked list of matching note ids with one-line snippets (cheapest lookup).",
  { query: z.string(), limit: z.number().int().min(1).max(20).optional() },
  async ({ query, limit }) => text(fmtHits(api.search(vault, query, limit))));

server.tool("read_note", "Read a note as compact text with its links and backlinks. Pass section= to read one heading only.",
  { id: z.string().describe("note id, e.g. Projects/Orrery"), section: z.string().optional().describe("heading text to read only that part"), max_chars: z.number().int().min(200).max(40000).optional() },
  async ({ id, section, max_chars }) => text(fmtNote(loadVault(vault), id, { section, maxChars: max_chars })));

server.tool("explore", "Connect the dots around a note: its neighbours as one-liners, plus notes that share neighbours with it but aren't linked yet.",
  { id: z.string(), budget: z.number().int().min(150).max(3000).optional() },
  async ({ id, budget }) => text(explore(loadVault(vault), id, budget)));

server.tool("remember",
  "Save durable facts the user shared (decisions, preferences, goals, people, status). Batch them: one call, one short sentence per fact, with [[wikilinks]] to related notes. Duplicates are skipped automatically.",
  {
    facts: z.array(z.object({ text: z.string(), links: z.array(z.string()).optional(), note: z.string().optional().describe("append to this note instead of today's Inbox") })).optional(),
    text: z.string().optional().describe("single fact (shorthand)"), links: z.array(z.string()).optional(), note: z.string().optional(),
  },
  async ({ facts, text: t, links, note }) => {
    const all = [...(facts ?? []), ...(t ? [{ text: t, links, note }] : [])];
    if (!all.length) throw new Error("give facts[] or text");
    return text(rememberMany(vault, loadVault(vault), all));
  });

server.tool("edit_note", "Small edit without resending the note: append text, and/or replace one exact passage (copy it from read_note).",
  { id: z.string(), append: z.string().optional(), old: z.string().optional().describe("exact text to replace"), new: z.string().optional() },
  async ({ id, append, old, new: nw }) => text(editNote(vault, id, { append, replace: old !== undefined ? { old, new: nw ?? "" } : undefined })));

server.tool("update_note", "Replace a note's whole body (frontmatter kept). Expensive; prefer edit_note. Never delete what the user wrote unless asked.",
  { id: z.string(), body: z.string() },
  async ({ id, body }) => { api.write(vault, id, body); return text(`updated ${id}`); });

server.tool("link_notes", "Connect two existing notes (adds a 'related' line to the first). Use when you notice a real relationship.",
  { from: z.string(), to: z.string(), reason: z.string().optional() },
  async ({ from, to, reason }) => { const r = api.link(vault, from, to, reason); return text(r.linked ? `linked ${from} → ${to}` : `not linked: ${r.reason}`); });

server.connect(new StdioServerTransport());
