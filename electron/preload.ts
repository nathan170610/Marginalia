import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("orrery", {
  graph: () => ipcRenderer.invoke("graph"),
  note: (id: string) => ipcRenderer.invoke("note", id),
  search: (q: string) => ipcRenderer.invoke("search", q),
  write: (id: string, body: string) => ipcRenderer.invoke("write", id, body),
  create: (id: string, body?: string) => ipcRenderer.invoke("create", id, body),
  health: () => ipcRenderer.invoke("health"),
  remember: (text: string, opts?: object) => ipcRenderer.invoke("remember", text, opts),
  settings: () => ipcRenderer.invoke("settings"),
  setupClaude: () => ipcRenderer.invoke("setup-claude"),
  changeVault: () => ipcRenderer.invoke("change-vault"),
  openVault: () => ipcRenderer.invoke("open-vault"),
  onChange: (cb: () => void) => { ipcRenderer.on("vault-changed", () => cb()); },
  onFocusCapture: (cb: () => void) => { ipcRenderer.on("focus-capture", () => cb()); },
});
