import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function claudeDesktopConfigPath(platform = process.platform, home = os.homedir(), env = process.env): string {
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

/** Merge the orrery MCP server into Claude Desktop's config. Never touches other servers; backs up the old file. */
export function setupClaude(file: string, mcpPath: string, vault: string, write: boolean) {
  let cfg: any = {};
  const exists = fs.existsSync(file);
  if (exists) { const raw = fs.readFileSync(file, "utf8").trim(); cfg = raw ? JSON.parse(raw) : {}; }
  const entry = { command: "node", args: [mcpPath], env: { ORRERY_VAULT: vault } };
  const before = cfg.mcpServers?.orrery;
  const changed = JSON.stringify(before) !== JSON.stringify(entry);
  const next = { ...cfg, mcpServers: { ...(cfg.mcpServers || {}), orrery: entry } };
  let backup: string | undefined;
  if (write && changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (exists) { backup = `${file}.bak-${Date.now()}`; fs.copyFileSync(file, backup); }
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  }
  return { file, changed, replacing: !!before, backup, config: next };
}
