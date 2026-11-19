import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadVault, parseFrontmatter, extractWikilinks } from "../src/core/vault";
import { search } from "../src/core/search";
import { buildBrief, estimateTokens } from "../src/core/brief";
import { remember, initVault } from "../src/core/capture";
import { api } from "../src/core/api";

const tpl = path.resolve(__dirname, "..", "template");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "orrery-"));

describe("vault", () => {
  it("parses frontmatter, tags and wikilinks", () => {
    const p = parseFrontmatter("---\nsummary: hi\ntags: [a, #b]\n---\nbody #c [[X|alias]] [[Y#h]]");
    expect(p.meta.summary).toBe("hi");
    expect(p.tags).toEqual(["a", "b", "c"]);
    expect(extractWikilinks(p.body)).toEqual(["X", "Y"]);
  });
  it("builds graph with orbits from the template", () => {
    const root = tmp(); initVault(root, tpl);
    const g = loadVault(root);
    expect(g.notes.length).toBeGreaterThanOrEqual(9);
    expect(g.notes.find(n => n.id === "Core/Me")!.orbit).toBe("core");
    expect(g.notes.find(n => n.id === "Projects/Orrery")!.orbit).toBe("planet");
    expect(g.edges.length).toBeGreaterThan(8);
    expect(g.notes.reduce((a, n) => a + n.unresolved.length, 0)).toBe(0);
  });
  it("initVault never overwrites user files", () => {
    const root = tmp(); initVault(root, tpl);
    fs.writeFileSync(path.join(root, "Core/Me.md"), "mine");
    initVault(root, tpl);
    expect(fs.readFileSync(path.join(root, "Core/Me.md"), "utf8")).toBe("mine");
  });
});

describe("search", () => {
  it("ranks title matches first", () => {
    const root = tmp(); initVault(root, tpl);
    const hits = search(loadVault(root), "curiosity");
    expect(hits[0].id).toBe("Values/Curiosity");
  });
  it("returns nothing for junk", () => {
    const root = tmp(); initVault(root, tpl);
    expect(search(loadVault(root), "zzzqqq")).toEqual([]);
  });
});

describe("brief", () => {
  it("respects the token budget and puts core first", () => {
    const root = tmp(); initVault(root, tpl);
    for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(root, `Projects/P${i}.md`), `Project number ${i} does something unique${i}. [[Core/Me]]`);
    const g = loadVault(root);
    for (const budget of [400, 900, 1800]) {
      const b = buildBrief(g, { budget });
      expect(estimateTokens(b)).toBeLessThanOrEqual(budget + 40);
    }
    const b = buildBrief(g, { budget: 1800 });
    expect(b.indexOf("## Core")).toBeGreaterThan(-1);
    expect(b.indexOf("## Core")).toBeLessThan(b.indexOf("## Planets"));
  });
});

describe("capture", () => {
  it("appends memories and creates graph links", () => {
    const root = tmp(); initVault(root, tpl);
    const { id } = remember(root, "Prefers dark UIs", { links: ["Core/Values"] });
    remember(root, "Likes the sea");
    const g = loadVault(root);
    const n = g.notes.find(x => x.id === id)!;
    expect(n.body).toContain("Prefers dark UIs");
    expect(n.body).toContain("Likes the sea");
    expect(n.links).toContain("Core/Values");
  });
  it("blocks path traversal", () => {
    const root = tmp();
    expect(() => remember(root, "x", { note: "../../evil" })).toThrow();
    expect(() => api.note(root, "../x")).toThrow();
  });
});
