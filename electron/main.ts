import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { api } from "../src/core/api";
import { initVault } from "../src/core/capture";
import { findTemplate, resolveVault } from "../src/core/config";

const vault = resolveVault();

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, backgroundColor: "#03040a", title: "Orrery", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  if (!fs.existsSync(vault)) initVault(vault, findTemplate());
  ipcMain.handle("graph", () => api.graph(vault));
  ipcMain.handle("note", (_e, id: string) => api.note(vault, id));
  ipcMain.handle("search", (_e, q: string) => api.search(vault, q));
  ipcMain.handle("remember", (_e, text: string, opts) => api.remember(vault, text, opts));
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
