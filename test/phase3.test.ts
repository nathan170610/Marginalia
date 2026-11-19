import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type http from "node:http";
import { serve } from "../src/server";
import { initVault } from "../src/core/capture";
import { findTemplate } from "../src/core/config";

let root: string, server: http.Server; const port = 4790 + Math.floor(Math.random() * 100);
const base = () => `http://127.0.0.1:${port}`;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "orrery-p3-")); initVault(root, findTemplate());
  server = serve(root, path.join(root, "nonexistent-ui"), port); await new Promise(r => server.once("listening", r));
});
afterAll(() => server.close());

describe("in-app editor backend", () => {
  it("writes a note body and keeps its frontmatter", async () => {
    const r = await fetch(base() + "/api/write", { method: "POST", body: JSON.stringify({ id: "Values/Curiosity", body: "# Curiosity\n\nEdited. [[Me]]\n" }) });
    expect(r.status).toBe(200);
    const raw = fs.readFileSync(path.join(root, "Values/Curiosity.md"), "utf8");
    expect(raw.startsWith("---")).toBe(true);
    expect(raw).toContain("Edited. [[Me]]");
    const note = await (await fetch(base() + "/api/note?id=Values/Curiosity")).json();
    expect(note.links).toContain("Core/Me");
  });
  it("refuses writes from other websites and outside the vault", async () => {
    const cross = await fetch(base() + "/api/write", { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ id: "Core/Me", body: "x" }) });
    expect(cross.status).toBe(403);
    const cross2 = await fetch(base() + "/api/remember", { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ text: "x" }) });
    expect(cross2.status).toBe(403);
    const trav = await fetch(base() + "/api/write", { method: "POST", body: JSON.stringify({ id: "../escape", body: "x" }) });
    expect(trav.status).toBe(500);
    expect(fs.existsSync(path.join(root, "..", "escape.md"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "Core/Me.md"), "utf8")).not.toBe("x");
  });
});
