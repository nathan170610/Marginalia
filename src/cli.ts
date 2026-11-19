import path from "node:path";
import { api } from "./core/api";
import { initVault } from "./core/capture";
import { findTemplate, resolveVault } from "./core/config";
import { estimateTokens } from "./core/brief";
import { serve } from "./server";
import { ingestClaude } from "./core/ingest";
import { claudeDesktopConfigPath, setupClaude } from "./core/setup";
import { importObsidian } from "./core/obsidian";
import { reviewText, planFiling, applyFiling } from "./core/consolidate";
import { loadVault } from "./core/vault";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf("--" + n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const vault = resolveVault(flag("vault"));
const budget = flag("budget");
const bool = (n: string) => { const i = args.indexOf("--" + n); if (i < 0) return false; args.splice(i, 1); return true; };
const dryRun = bool("dry-run"), yes = bool("yes"), all = bool("all");
const port = Number(flag("port") || 4747);
const cmd = args.shift();
const rest = args.join(" ");

const help = `orrery — a living solar system of your mind

  orrery init                 create the vault (default ~/Orrery) from the starter template
  orrery serve [--port 4747]  open the visual view in your browser (http://localhost:4747)
  orrery brief [--budget N]   print the token-budgeted memory brief for an AI
  orrery search <query>       ranked search over the vault
  orrery add <text>           capture a memory into today's Inbox note
  orrery mcp-config           print the Claude MCP config snippet
  orrery setup-claude [--yes] add Orrery to Claude Desktop's config (shows the change; --yes writes it, with a backup)
  orrery import-obsidian <dir> [--dry-run]  copy an Obsidian vault in (never overwrites)
  orrery review                 contradictions to confirm + Inbox items ready to file
  orrery consolidate [--yes]    file linked Inbox bullets into their notes' Log
  orrery brief [topic]          the brief, optionally focused on a topic
  orrery import-claude <export.zip|conversations.json|dir> [--dry-run] [--all]
                              import a Claude data export as Conversation notes with durable facts

  --vault <dir>  or ORRERY_VAULT env var selects the vault`;

switch (cmd) {
  case "init": console.log(`created ${initVault(vault, findTemplate())} files in ${vault}`); break;
  case "brief": { const b = api.brief(vault, budget ? Number(budget) : undefined, rest || undefined); console.log(b); console.error(`\n[~${estimateTokens(b)} tokens]`); break; }
  case "search": for (const h of api.search(vault, rest)) console.log(`${h.score.toFixed(2)}  [${h.orbit}] ${h.id}\n      ${h.snippet}`); break;
  case "add": { const r = api.remember(vault, rest); console.log("saved to", r.id); break; }
  case "serve": {
    serve(vault, path.resolve(__dirname, "renderer"), port);
    console.log(`Orrery running at http://localhost:${port}  (vault: ${vault})`);
    break;
  }
  case "mcp-config":
    console.log(JSON.stringify({ mcpServers: { orrery: { command: "node", args: [path.resolve(__dirname, "mcp.cjs")], env: { ORRERY_VAULT: vault } } } }, null, 2));
    break;
  case "setup-claude": {
    const r = setupClaude(claudeDesktopConfigPath(), path.resolve(__dirname, "mcp.cjs"), vault, yes);
    if (!r.changed) { console.log(`Already configured in ${r.file}`); break; }
    console.log(JSON.stringify({ mcpServers: { orrery: r.config.mcpServers.orrery } }, null, 2));
    if (!yes) console.log(`\nThis would ${r.replacing ? "replace the orrery entry" : "add an orrery entry"} in ${r.file}.\nRe-run with --yes to write it (other servers are kept; the old file is backed up).`);
    else console.log(`\nWrote ${r.file}${r.backup ? ` (backup: ${r.backup})` : ""}. Restart Claude Desktop.`);
    break;
  }
  case "import-claude": {
    if (!rest) { console.log("usage: orrery import-claude <export.zip|conversations.json|dir> [--dry-run]"); break; }
    const r = ingestClaude(vault, path.resolve(rest), { dryRun, all });
    for (const p of r.created) console.log(`${dryRun ? "would create" : "created"} ${p.id}  (${p.facts.length} facts${p.links.length ? ", links: " + p.links.join(", ") : ""})${dryRun && p.facts.length ? "\n    - " + p.facts.join("\n    - ") : ""}`);
    console.log(`\n${r.created.length} notes ${dryRun ? "proposed" : "written"}, ${r.skipped} conversations skipped (already imported or no durable facts), ${r.duplicateFacts} duplicate facts dropped.`);
    break;
  }
  case "import-obsidian": {
    if (!rest) { console.log("usage: orrery import-obsidian <obsidian-vault-folder> [--dry-run]"); break; }
    const r = importObsidian(path.resolve(rest), vault, { dryRun });
    console.log(`${dryRun ? "would copy" : "copied"} ${r.notes} notes and ${r.attachments} attachments into ${vault} (${r.unchanged} already identical)`);
    if (r.renamed.length) console.log(`kept both versions for ${r.renamed.length} notes that differ:\n  ` + r.renamed.slice(0, 20).join("\n  "));
    break;
  }
  case "review": console.log(reviewText(loadVault(vault))); break;
  case "consolidate": {
    const plan = planFiling(loadVault(vault));
    if (!plan.length) { console.log("Nothing to file."); break; }
    for (const p of plan) console.log(`${p.from} → ${p.to}: ${p.line.trim()}`);
    if (yes) console.log(`\nFiled ${applyFiling(vault, plan)} items into their notes' "## Log" sections.`); else console.log(`\nRe-run with --yes to file these ${plan.length} items.`);
    break;
  }
  default: console.log(help);
}
