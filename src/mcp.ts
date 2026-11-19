import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./core/api";
import { resolveVault } from "./core/config";

const vault = resolveVault();
const server = new McpServer({ name: "orrery", version: "0.1.0" });
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

server.tool("get_brief",
  "Call this FIRST in every conversation. Returns a compact, token-budgeted summary of the user's identity, values, projects and people. Prefer this over reading notes one by one.",
  { budget: z.number().int().min(300).max(8000).optional().describe("max tokens, default 1800") },
  async ({ budget }) => text(api.brief(vault, budget)));

server.tool("search", "Ranked search across the user's memory vault. Returns ids, scores and short snippets (cheap). Follow up with read_note only for what you need.",
  { query: z.string(), limit: z.number().int().min(1).max(20).optional() },
  async ({ query, limit }) => text(JSON.stringify(api.search(vault, query, limit), null, 1)));

server.tool("read_note", "Read one note in full, with its outgoing links and backlinks.",
  { id: z.string().describe("note id from brief/search, e.g. Projects/Orrery") },
  async ({ id }) => text(JSON.stringify(api.note(vault, id), null, 1)));

server.tool("remember",
  "Save a new fact, decision or preference the user just shared. Include [[wikilinks]] to related notes (e.g. [[Core/Values]]) so it connects in the graph. Do this proactively when something durable comes up.",
  { text: z.string().describe("one concise fact; no transcript dumps"), links: z.array(z.string()).optional().describe("note ids to link"), note: z.string().optional().describe("append to this existing note instead of the daily Inbox") },
  async ({ text: t, links, note }) => text(`saved to ${api.remember(vault, t, { links, note }).id}`));

server.tool("update_note", "Replace the body of an existing note (frontmatter is kept). Read it first with read_note; keep edits minimal and never delete content the user wrote unless asked.",
  { id: z.string(), body: z.string() },
  async ({ id, body }) => { api.write(vault, id, body); return text(`updated ${id}`); });

server.tool("link_notes", "Connect two existing notes (adds a 'related' line to the first). Use when you notice a real relationship.",
  { from: z.string(), to: z.string(), reason: z.string().optional() },
  async ({ from, to, reason }) => text(JSON.stringify(api.link(vault, from, to, reason))));

server.connect(new StdioServerTransport());
