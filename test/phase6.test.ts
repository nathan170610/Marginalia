import { describe, it, expect } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { createNote, vaultHealth } from "../src/core/api";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "orrery-p6-"));
const w = (r: string, id: string, body: string) => { fs.mkdirSync(path.dirname(path.join(r, id + ".md")), { recursive: true }); fs.writeFileSync(path.join(r, id + ".md"), body); };

describe("createNote", () => {
  it("creates nested notes, refuses duplicates and escapes", () => {
    const r = tmp();
    expect(createNote(r, "Projects/Idea").id).toBe("Projects/Idea");
    expect(fs.readFileSync(path.join(r, "Projects/Idea.md"), "utf8")).toMatch(/^# Idea/);
    expect(() => createNote(r, "Projects/Idea")).toThrow(/exists/);
    expect(() => createNote(r, "../evil")).toThrow();
    expect(() => createNote(r, "  ")).toThrow(/invalid/);
  });
});

describe("vaultHealth", () => {
  it("counts orphans, broken links and hubs", () => {
    const r = tmp();
    w(r, "A", "links [[B]] and [[Missing]]"); w(r, "B", "back to [[A]]"); w(r, "Lonely", "nobody links me");
    const h = vaultHealth(r);
    expect(h.notes).toBe(3);
    expect(h.orphans).toEqual(["Lonely"]);
    expect(h.unresolved).toEqual([{ from: "A", to: "Missing" }]);
    expect(h.hubs[0].n).toBeGreaterThan(0);
    expect(h.words).toBeGreaterThan(5);
  });
});
