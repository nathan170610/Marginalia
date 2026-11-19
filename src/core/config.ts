import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Vault location: --vault flag > ORRERY_VAULT env > ~/Orrery */
export function resolveVault(flag?: string): string {
  return path.resolve(flag || process.env.ORRERY_VAULT || path.join(os.homedir(), "Orrery"));
}
export function findTemplate(): string {
  const candidates = [
    path.resolve(__dirname, "..", "template"), path.resolve(__dirname, "..", "..", "template"),
    path.resolve(process.cwd(), "template"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("template folder not found");
}
