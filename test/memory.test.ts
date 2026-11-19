import { describe, it, expect } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { initVault } from "../src/core/capture";
import { findTemplate } from "../src/core/config";
import { loadVault } from "../src/core/vault";
import { api } from "../src/core/api";
import { estimateTokens } from "../src/core/brief";
import { fmtHits, fmtNote, recall, explore, editNote, rememberMany } from "../src/core/memory";

const vault = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), "orrery-mem-")); initVault(r, findTemplate()); return r; };

describe("token-lean memory tools", () => {
  it("compact formats cost far fewer tokens than JSON", () => {
    const r = vault(); const g = loadVault(r);
    const hits = api.search(r, "values friends");
    expect(estimateTokens(fmtHits(hits))).toBeLessThan(estimateTokens(JSON.stringify(hits, null, 1)) * 0.75);
    expect(estimateTokens(fmtNote(g, "Core/Me"))).toBeLessThan(estimateTokens(JSON.stringify(api.note(r, "Core/Me"), null, 1)));
  });
  it("recall stays within budget and returns matching lines", () => {
    const r = vault(); const g = loadVault(r);
    const out = recall(g, "curiosity", 200);
    expect(estimateTokens(out)).toBeLessThanOrEqual(210);
    expect(out).toMatch(/Curiosity/);
  });
  it("read_note can return one section", () => {
    const r = vault(); fs.writeFileSync(path.join(r, "Projects/X.md"), "# X\n\n## Plan\nship it\n\n## Log\nlong log text\n");
    const out = fmtNote(loadVault(r), "Projects/X", { section: "Plan" });
    expect(out).toContain("ship it"); expect(out).not.toContain("long log");
  });
  it("explore lists neighbours and suggests unlinked bridges", () => {
    const r = vault();
    for (const [n, l] of [["A", "[[Hub1]] [[Hub2]]"], ["B", "[[Hub1]] [[Hub2]]"], ["Hub1", ""], ["Hub2", ""]]) fs.writeFileSync(path.join(r, `Inbox/${n}.md`), `# ${n}\n${l}\n`);
    const out = explore(loadVault(r), "Inbox/A");
    expect(out).toMatch(/Hub1/); expect(out).toMatch(/Possibly related[\s\S]*Inbox\/B/);
  });
  it("edit_note appends and replaces exactly, keeping frontmatter", () => {
    const r = vault(); const f = path.join(r, "Values/Curiosity.md"); const before = fs.readFileSync(f, "utf8");
    editNote(r, "Values/Curiosity", { append: "- new line" });
    expect(fs.readFileSync(f, "utf8")).toBe(before.replace(/\s*$/, "\n") + "- new line\n");
    editNote(r, "Values/Curiosity", { replace: { old: "- new line", new: "- changed" } });
    expect(fs.readFileSync(f, "utf8")).toContain("- changed");
    expect(() => editNote(r, "Values/Curiosity", { replace: { old: "nope-not-here", new: "x" } })).toThrow();
  });
  it("remember batches and skips duplicates", () => {
    const r = vault();
    expect(rememberMany(r, loadVault(r), [{ text: "Likes tea" }, { text: "likes tea." }])).toMatch(/saved 1 .*1 already known/);
    expect(rememberMany(r, loadVault(r), [{ text: "Likes tea" }])).toMatch(/saved 0; 1 already known/);
  });
});
