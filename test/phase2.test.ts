import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ingestClaude, extractFacts } from "../src/core/ingest";
import { setupClaude, claudeDesktopConfigPath } from "../src/core/setup";
import { initVault } from "../src/core/capture";
import { loadVault } from "../src/core/vault";
import { api } from "../src/core/api";
import { estimateTokens } from "../src/core/brief";

const tpl = path.resolve(__dirname, "..", "template");
const fixture = path.resolve(__dirname, "fixtures", "conversations.json");
const vault = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), "orrery-")); initVault(r, tpl); return r; };

describe("extractFacts", () => {
  it("keeps durable first-person statements, drops requests and questions", () => {
    const f = extractFacts("I live in Lyon. Can you help me with X? How do I sort? My sister is a doctor. ok.");
    expect(f).toEqual(["I live in Lyon.", "My sister is a doctor."]);
  });
});

describe("import-claude", () => {
  it("writes notes with facts, provenance and links; ignores assistant text", () => {
    const root = vault();
    const r = ingestClaude(root, fixture);
    expect(r.created.map(c => c.sourceId)).toEqual(["c-1", "c-2"]);
    const first = r.created[0];
    expect(first.facts).toContain("I decided to use plain Canvas 2D.");
    expect(first.facts.some(f => f.includes("happy to help"))).toBe(false);
    expect(first.links).toContain("Projects/Orrery");
    const n = loadVault(root).notes.find(x => x.id === first.id)!;
    expect(n.meta.source_id).toBe("c-1");
    expect(n.links).toContain("Projects/Orrery");
  });
  it("dedupes facts across conversations and is idempotent", () => {
    const root = vault();
    const r1 = ingestClaude(root, fixture);
    expect(r1.duplicateFacts).toBe(1); // "I prefer dark, glowing interfaces." repeated in c-2
    expect(r1.created[1].facts).toEqual(["I live in Lyon and I work as a student."]);
    const r2 = ingestClaude(root, fixture);
    expect(r2.created).toEqual([]);
    expect(fs.readdirSync(path.join(root, "Conversations")).length).toBe(2);
  });
  it("dry run writes nothing", () => {
    const root = vault();
    expect(ingestClaude(root, fixture, { dryRun: true }).created.length).toBe(2);
    expect(fs.existsSync(path.join(root, "Conversations"))).toBe(false);
  });
});

describe("setup-claude", () => {
  it("picks the OS-specific config path", () => {
    expect(claudeDesktopConfigPath("darwin", "/h")).toBe("/h/Library/Application Support/Claude/claude_desktop_config.json");
    expect(claudeDesktopConfigPath("win32", "C:/h", { APPDATA: "C:/AppData" })).toContain(path.join("C:/AppData", "Claude"));
  });
  it("merges, keeps other servers, backs up, and does nothing without write", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-")); const f = path.join(dir, "c.json");
    fs.writeFileSync(f, JSON.stringify({ mcpServers: { other: { command: "x" } }, theme: "dark" }));
    expect(setupClaude(f, "/m.cjs", "/v", false).changed).toBe(true);
    expect(JSON.parse(fs.readFileSync(f, "utf8")).mcpServers.orrery).toBeUndefined();
    const r = setupClaude(f, "/m.cjs", "/v", true);
    const cfg = JSON.parse(fs.readFileSync(f, "utf8"));
    expect(cfg.mcpServers.other).toEqual({ command: "x" });
    expect(cfg.theme).toBe("dark");
    expect(cfg.mcpServers.orrery.env.ORRERY_VAULT).toBe("/v");
    expect(fs.existsSync(r.backup!)).toBe(true);
    expect(setupClaude(f, "/m.cjs", "/v", true).changed).toBe(false);
  });
});

describe("link_notes / update_note", () => {
  it("links once, refuses unknown notes, keeps frontmatter on update", () => {
    const root = vault();
    expect(api.link(root, "Values/Curiosity", "People/Family", "test")).toEqual({ linked: true });
    expect(api.link(root, "Values/Curiosity", "People/Family")).toEqual({ linked: false, reason: "already linked" });
    expect(() => api.link(root, "Nope", "Core/Me")).toThrow();
    api.write(root, "People/Family", "# Family\nnew body");
    const raw = fs.readFileSync(path.join(root, "People/Family.md"), "utf8");
    expect(raw.startsWith("---\nsummary:")).toBe(true);
    expect(raw).toContain("new body");
  });
});

describe("MCP server (built dist/mcp.cjs)", () => {
  const mcp = path.resolve(__dirname, "..", "dist", "mcp.cjs");
  beforeAll(() => { if (!fs.existsSync(mcp)) execFileSync("node", ["scripts/build-node.mjs"], { cwd: path.resolve(__dirname, "..") }); });
  it("exposes all tools and round-trips a memory", async () => {
    const root = vault();
    const c = new Client({ name: "test", version: "1" });
    await c.connect(new StdioClientTransport({ command: "node", args: [mcp], env: { ...process.env, ORRERY_VAULT: root } as Record<string, string> }));
    const names = (await c.listTools()).tools.map(t => t.name).sort();
    expect(names).toEqual(["edit_note", "explore", "get_brief", "link_notes", "read_note", "recall", "remember", "review_memory", "search", "update_note"]);
    expect(c.getInstructions()).toMatch(/get_brief once/);
    const brief = (await c.callTool({ name: "get_brief", arguments: { budget: 600 } })) as any;
    expect(estimateTokens(brief.content[0].text)).toBeLessThanOrEqual(640);
    await c.callTool({ name: "remember", arguments: { text: "Allergic to peanuts", links: ["Core/Me"] } });
    const hits = ((await c.callTool({ name: "search", arguments: { query: "peanuts" } })) as any).content[0].text;
    expect(hits).toMatch(/^Inbox\//);
    const again = ((await c.callTool({ name: "remember", arguments: { facts: [{ text: "allergic to peanuts!" }, { text: "Runs on Tuesdays" }] } })) as any).content[0].text;
    expect(again).toMatch(/saved 1 .*1 already known/);
    const rec = ((await c.callTool({ name: "recall", arguments: { query: "peanuts" } })) as any).content[0].text;
    expect(rec).toContain("Allergic to peanuts");
    const bad = (await c.callTool({ name: "read_note", arguments: { id: "../../etc/passwd" } })) as any;
    expect(bad.isError).toBe(true);
    await c.close();
  }, 20000);
});
