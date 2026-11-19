import { describe, it, expect } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { initVault } from "../src/core/capture";
import { findTemplate } from "../src/core/config";
import { loadVault, touchUsage } from "../src/core/vault";
import { buildBrief, estimateTokens } from "../src/core/brief";
import { findContradictions, planFiling, applyFiling, reviewText } from "../src/core/consolidate";
import { importObsidian } from "../src/core/obsidian";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "orrery-p5-"));
const vault = () => { const r = tmp(); initVault(r, findTemplate()); return r; };
const w = (r: string, id: string, body: string) => { fs.mkdirSync(path.dirname(path.join(r, id + ".md")), { recursive: true }); fs.writeFileSync(path.join(r, id + ".md"), body); };

describe("contradictions", () => {
  it("flags conflicting single-valued facts and ignores consistent ones", () => {
    const r = tmp();
    w(r, "Inbox/2026-01-02", "- 10:00 I live in Paris now\n- I work at Acme\n");
    w(r, "Inbox/2026-03-04", "- 09:00 I moved to Lyon.\n- I work at Acme\n- ~~I live in Nice~~\n");
    const c = findContradictions(loadVault(r));
    expect(c.map(x => x.key)).toEqual(["lives in"]);
    expect(c[0].facts.map(f => f.value).sort()).toEqual(["Lyon", "Paris"]);
    expect(reviewText(loadVault(r))).toMatch(/lives in: .*Lyon.*Paris|lives in: .*Paris.*Lyon/);
  });
});

describe("inbox consolidation", () => {
  it("files single-link bullets into the target's Log and removes them from the inbox", () => {
    const r = vault();
    w(r, "Inbox/2026-05-01", "# x\n- 08:00 Shipped v1 [[Orrery]]\n- 09:00 ambiguous [[Me]] [[Values]]\n- 10:00 no links\n");
    const plan = planFiling(loadVault(r));
    expect(plan).toHaveLength(1); expect(plan[0].to).toBe("Projects/Orrery");
    applyFiling(r, plan);
    expect(fs.readFileSync(path.join(r, "Projects/Orrery.md"), "utf8")).toMatch(/## Log\n- 2026-05-01 Shipped v1 \[\[Orrery\]\]/);
    const inbox = fs.readFileSync(path.join(r, "Inbox/2026-05-01.md"), "utf8");
    expect(inbox).not.toContain("Shipped"); expect(inbox).toContain("ambiguous");
  });
});

describe("brief", () => {
  it("topic puts relevant notes first and still respects the budget", () => {
    const r = vault(); const g = loadVault(r);
    const b = buildBrief(g, { budget: 900, topic: "friends" });
    expect(b).toMatch(/## Relevant to "friends"[\s\S]*Close Friends/);
    expect(estimateTokens(b)).toBeLessThanOrEqual(900);
  });
  it("stays within budget on a 10k-note vault", () => {
    const r = tmp();
    for (let i = 0; i < 10000; i++) w(r, `${["Projects", "People", "Ideas", "Journal"][i % 4]}/N${i}`, `# N${i}\nnote ${i} about topic${i % 50} [[N${(i * 7) % 10000}]]\n`);
    const t0 = Date.now(); const g = loadVault(r); const cold = Date.now() - t0;
    const t1 = Date.now(); loadVault(r); const warm = Date.now() - t1;
    for (const budget of [600, 1800, 4000]) expect(estimateTokens(buildBrief(g, { budget }))).toBeLessThanOrEqual(budget);
    expect(fs.existsSync(path.join(r, ".orrery/index.json"))).toBe(true);
    expect(warm).toBeLessThan(cold);
  }, 60000);
});

describe("promotion", () => {
  it("frequently used notes rise an orbit", () => {
    const r = tmp(); w(r, "Ideas/Lonely", "# Lonely\njust me\n"); w(r, "Ideas/Other", "# Other\n");
    expect(loadVault(r).notes.find(n => n.id === "Ideas/Lonely")!.orbit).toBe("asteroid");
    for (let i = 0; i < 3; i++) touchUsage(r, ["Ideas/Lonely"]);
    expect(loadVault(r).notes.find(n => n.id === "Ideas/Lonely")!.orbit).toBe("moon");
  });
});

describe("obsidian import", () => {
  it("copies notes and attachments, skips .obsidian, never overwrites", () => {
    const src = tmp(), dest = vault();
    w(src, "Daily/2026-11-01", "# day\n[[Me]]\n"); w(src, "Core/Me", "# Me\nDIFFERENT\n");
    fs.mkdirSync(path.join(src, ".obsidian")); fs.writeFileSync(path.join(src, ".obsidian/app.json"), "{}");
    fs.writeFileSync(path.join(src, "pic.png"), "png");
    const dry = importObsidian(src, dest, { dryRun: true }); expect(fs.existsSync(path.join(dest, "Daily"))).toBe(false); expect(dry.notes).toBe(2);
    const r = importObsidian(src, dest);
    expect(r).toMatchObject({ notes: 2, attachments: 1 }); expect(r.renamed).toEqual(["Core/Me (obsidian).md"]);
    expect(fs.readFileSync(path.join(dest, "Core/Me.md"), "utf8")).not.toContain("DIFFERENT");
    expect(fs.existsSync(path.join(dest, ".obsidian"))).toBe(false);
    expect(importObsidian(src, dest).notes).toBe(0);
  });
});
