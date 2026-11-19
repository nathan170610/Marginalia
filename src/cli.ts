import path from "node:path";
import { api } from "./core/api";
import { initVault } from "./core/capture";
import { findTemplate, resolveVault } from "./core/config";
import { estimateTokens } from "./core/brief";
import { serve } from "./server";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf("--" + n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const vault = resolveVault(flag("vault"));
const budget = flag("budget");
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

  --vault <dir>  or ORRERY_VAULT env var selects the vault`;

switch (cmd) {
  case "init": console.log(`created ${initVault(vault, findTemplate())} files in ${vault}`); break;
  case "brief": { const b = api.brief(vault, budget ? Number(budget) : undefined); console.log(b); console.error(`\n[~${estimateTokens(b)} tokens]`); break; }
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
  default: console.log(help);
}
