import { build } from "esbuild";
const common = { bundle: true, platform: "node", format: "cjs", target: "node20", sourcemap: false, logLevel: "info" };
await build({ ...common, entryPoints: ["src/cli.ts"], outfile: "dist/cli.cjs", banner: { js: "#!/usr/bin/env node" } });
await build({ ...common, entryPoints: ["src/mcp.ts"], outfile: "dist/mcp.cjs" });
await build({ ...common, entryPoints: ["electron/main.ts"], outfile: "dist/electron/main.cjs", external: ["electron"] });
await build({ ...common, entryPoints: ["electron/preload.ts"], outfile: "dist/electron/preload.cjs", external: ["electron"] });
