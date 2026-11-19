import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("orrery", {
  graph: () => ipcRenderer.invoke("graph"),
  note: (id: string) => ipcRenderer.invoke("note", id),
  search: (q: string) => ipcRenderer.invoke("search", q),
  write: (id: string, body: string) => ipcRenderer.invoke("write", id, body),
  remember: (text: string, opts?: object) => ipcRenderer.invoke("remember", text, opts),
});
