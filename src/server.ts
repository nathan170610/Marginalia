import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { api } from "./core/api";
import { claudeDesktopConfigPath, mcpEntry } from "./core/setup";

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

export function serve(root: string, uiDir: string, port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const send = (code: number, body: unknown | Buffer, type = "application/json") => {
        res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
        res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
      };
      if (url.pathname === "/api/settings") return send(200, { vault: root, claudeConfig: claudeDesktopConfigPath(),
        snippet: JSON.stringify({ mcpServers: { orrery: mcpEntry(path.resolve(__dirname, "mcp.cjs"), root) } }, null, 2) });
      if (url.pathname === "/api/graph") return send(200, api.graph(root));
      if (url.pathname === "/api/note") return send(200, api.note(root, url.searchParams.get("id") || ""));
      if (url.pathname === "/api/search") return send(200, api.search(root, url.searchParams.get("q") || ""));
      if (req.method === "POST") {
        // Only the Orrery page itself may write: block cross-site POSTs from other websites.
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}`) return send(403, { error: "cross-origin write refused" });
      }
      if (url.pathname === "/api/write" && req.method === "POST") {
        let b = ""; for await (const c of req) b += c;
        const j = JSON.parse(b);
        return send(200, api.write(root, String(j.id || ""), String(j.body ?? "")));
      }
      if (url.pathname === "/api/remember" && req.method === "POST") {
        let b = ""; for await (const c of req) b += c;
        const j = JSON.parse(b);
        return send(200, api.remember(root, String(j.text || ""), { note: j.note, links: j.links }));
      }
      // static files (renderer build); only from uiDir
      let rel = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = path.resolve(uiDir, "." + rel);
      if (!file.startsWith(path.resolve(uiDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, { error: "not found" });
      send(200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
    } catch (e: any) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
  server.listen(port, "127.0.0.1");
  return server;
}
