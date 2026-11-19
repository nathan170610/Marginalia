import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, globalShortcut, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { api } from "../src/core/api";
import { initVault } from "../src/core/capture";
import { findTemplate } from "../src/core/config";
import { claudeDesktopConfigPath, setupClaude, mcpEntry, Runtime } from "../src/core/setup";

// ---------- settings (userData/config.json) ----------
const cfgFile = () => path.join(app.getPath("userData"), "config.json");
const readCfg = (): { vault?: string } => { try { return JSON.parse(fs.readFileSync(cfgFile(), "utf8")); } catch { return {}; } };
const writeCfg = (c: object) => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2)); };

let vault = "";
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
const HOTKEY = "CommandOrControl+Shift+O";

/** How Claude Desktop should launch the MCP server for this install. */
function mcpRuntime(): { path: string; rt: Runtime } {
  if (app.isPackaged) {
    // Copy the server to a stable location: the AppImage remounts at a random path each launch, and updates move the app.
    const stable = path.join(app.getPath("userData"), "mcp.cjs");
    try { fs.copyFileSync(path.join(process.resourcesPath, "app.asar.unpacked", "dist", "mcp.cjs"), stable); } catch { /* keep previous copy */ }
    return { path: stable, rt: { command: process.env.APPIMAGE || process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } } };
  }
  return { path: path.join(__dirname, "..", "mcp.cjs"), rt: { command: "node" } };
}

/** First run: create a fresh vault at ~/Orrery, or point at an existing folder (e.g. an Obsidian vault). */
async function chooseVault(firstRun: boolean): Promise<string | null> {
  const def = path.join(os.homedir(), "Orrery");
  const r = await dialog.showMessageBox({
    type: "question", title: "Orrery", message: firstRun ? "Welcome to Orrery" : "Change vault",
    detail: `Orrery keeps your memory as plain markdown files.\n\nCreate a new vault at ${def}, or open a folder you already have (an Obsidian vault works).`,
    buttons: [`Create ${def}`, "Open existing folder…", "Cancel"], defaultId: 0, cancelId: 2,
  });
  if (r.response === 2) return null;
  if (r.response === 0) { if (!fs.existsSync(def)) initVault(def, findTemplate()); return def; }
  const pick = await dialog.showOpenDialog({ title: "Choose your vault folder", properties: ["openDirectory", "createDirectory"] });
  return pick.canceled || !pick.filePaths[0] ? null : pick.filePaths[0];
}

// ---------- live updates: watch the vault, tell the renderer ----------
let watcher: fs.FSWatcher | null = null; let pending: NodeJS.Timeout | undefined;
function watch() {
  watcher?.close();
  const ping = (_e: string, f?: string | Buffer | null) => {
    if (f && !String(f).endsWith(".md")) return;
    clearTimeout(pending); pending = setTimeout(() => win?.webContents.send("vault-changed"), 250);
  };
  try { watcher = fs.watch(vault, { recursive: true }, ping); } catch { watcher = null; /* renderer falls back to polling */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, backgroundColor: "#03040a", title: "Orrery", autoHideMenuBar: true, icon: iconPath(),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // never navigate away or open windows inside the app; external links go to the browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.on("closed", () => { win = null; });
}
const iconPath = () => path.join(__dirname, "..", "..", "assets", "icon.png");
function show(capture = false) {
  if (!win) createWindow();
  if (win!.isMinimized()) win!.restore();
  win!.show(); win!.focus();
  if (capture) win!.webContents.send("focus-capture");
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => show());
  app.whenReady().then(async () => {
    const cfg = readCfg();
    vault = process.env.ORRERY_VAULT || cfg.vault || "";
    if (!vault || !fs.existsSync(vault)) {
      const v = await chooseVault(true);
      if (!v) { app.quit(); return; }
      vault = v; writeCfg({ ...cfg, vault });
    }
    ipcMain.handle("graph", () => api.graph(vault));
    ipcMain.handle("note", (_e, id: string) => api.note(vault, id));
    ipcMain.handle("search", (_e, q: string) => api.search(vault, q));
    ipcMain.handle("write", (_e, id: string, body: string) => api.write(vault, id, body));
    ipcMain.handle("create", (_e, id: string, body?: string) => api.create(vault, id, body));
    ipcMain.handle("health", () => api.health(vault));
    ipcMain.handle("remember", (_e, text: string, opts) => api.remember(vault, text, opts));
    ipcMain.handle("settings", () => {
      const m = mcpRuntime();
      return { vault, hotkey: HOTKEY, claudeConfig: claudeDesktopConfigPath(), snippet: JSON.stringify({ mcpServers: { orrery: mcpEntry(m.path, vault, m.rt) } }, null, 2) };
    });
    ipcMain.handle("setup-claude", () => { const m = mcpRuntime(); const r = setupClaude(claudeDesktopConfigPath(), m.path, vault, true, m.rt); return { file: r.file, changed: r.changed, backup: r.backup }; });
    ipcMain.handle("change-vault", async () => { const v = await chooseVault(false); if (!v) return null; vault = v; writeCfg({ ...readCfg(), vault }); watch(); win?.webContents.send("vault-changed"); return v; });
    ipcMain.handle("open-vault", () => shell.openPath(vault));

    watch();
    createWindow();
    try {
      tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 18, height: 18 }));
      tray.setToolTip("Orrery");
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: "Show Orrery", click: () => show() },
        { label: `Quick capture  (${HOTKEY.replace("CommandOrControl", process.platform === "darwin" ? "Cmd" : "Ctrl")})`, click: () => show(true) },
        { type: "separator" }, { label: "Quit", role: "quit" },
      ]));
      tray.on("click", () => show());
    } catch { /* some Linux desktops have no tray */ }
    globalShortcut.register(HOTKEY, () => show(true));
    if (app.isPackaged) {
      try { const { autoUpdater } = require("electron-updater"); autoUpdater.checkForUpdatesAndNotify().catch(() => {}); } catch { /* updater optional */ }
    }
    app.on("activate", () => show());
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
}
