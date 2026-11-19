export interface GNode { id: string; title: string; orbit: "core" | "planet" | "moon" | "asteroid"; tags: string[]; summary: string; folder: string; mtime: number; deg: number }
export interface GEdge { source: string; target: string }
export interface GraphData { nodes: GNode[]; edges: GEdge[]; unresolved: number }
export interface NoteData { id: string; title: string; orbit: string; tags: string[]; body: string; links: string[]; backlinks: string[] }
export interface Hit { id: string; title: string; orbit: string; score: number; snippet: string }

declare global { interface Window { orrery?: {
  graph(): Promise<GraphData>; note(id: string): Promise<NoteData>; search(q: string): Promise<Hit[]>; remember(t: string, o?: object): Promise<{ id: string }>; write(id: string, body: string): Promise<unknown>;
} } }

const j = async (u: string, init?: RequestInit) => { const r = await fetch(u, init); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };

/** Same interface in the desktop app (IPC) and the browser (local HTTP). */
export const backend = window.orrery ?? {
  graph: (): Promise<GraphData> => j("/api/graph"),
  note: (id: string): Promise<NoteData> => j("/api/note?id=" + encodeURIComponent(id)),
  search: (q: string): Promise<Hit[]> => j("/api/search?q=" + encodeURIComponent(q)),
  write: (id: string, body: string) => j("/api/write", { method: "POST", body: JSON.stringify({ id, body }) }),
  remember: (text: string, o: object = {}) => j("/api/remember", { method: "POST", body: JSON.stringify({ text, ...o }) }),
};
