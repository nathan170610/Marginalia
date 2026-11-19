export interface GNode { id: string; title: string; orbit: "core" | "planet" | "moon" | "asteroid"; tags: string[]; summary: string; folder: string; mtime: number; deg: number }
export interface GEdge { source: string; target: string }
export interface GraphData { nodes: GNode[]; edges: GEdge[]; unresolved: number }
export interface NoteData { id: string; title: string; orbit: string; tags: string[]; body: string; links: string[]; backlinks: string[] }
export interface Settings { vault: string; snippet: string; claudeConfig: string; hotkey?: string }
export interface Health { notes: number; links: number; words: number; orphans: string[]; unresolved: { from: string; to: string }[];
  contradictions: { key: string; values: string[]; notes: string[] }[]; hubs: { id: string; n: number }[]; thisWeek: number }
export interface Hit { id: string; title: string; orbit: string; score: number; snippet: string }

export interface Backend {
  graph(): Promise<GraphData>; note(id: string): Promise<NoteData>; search(q: string): Promise<Hit[]>; remember(t: string, o?: object): Promise<{ id: string }>; write(id: string, body: string): Promise<unknown>;
  create(id: string, body?: string): Promise<{ id: string }>; health(): Promise<Health>;
  settings(): Promise<Settings>; setupClaude?(): Promise<{ file: string; changed: boolean; backup?: string }>;
  changeVault?(): Promise<string | null>; openVault?(): Promise<void>; onChange?(cb: () => void): void; onFocusCapture?(cb: () => void): void;
}
declare global { interface Window { orrery?: Backend } }

const j = async (u: string, init?: RequestInit) => { const r = await fetch(u, init); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };

/** Same interface in the desktop app (IPC) and the browser (local HTTP). */
/** Browser-only demo: the whole vault is embedded in the page and edits live in memory. */
function demoBackend(d: { graph: GraphData; notes: Record<string, NoteData> }): Backend {
  const g = d.graph, notes = d.notes; const now = () => Date.now();
  const linksOf = (body: string) => [...body.matchAll(/\[\[([^\]|#]+)/g)].map(m => m[1].trim()).map(t => g.nodes.find(n => n.id === t || n.title.toLowerCase() === t.toLowerCase())?.id).filter((x): x is string => !!x);
  const relink = (id: string) => {
    g.edges = g.edges.filter(e => e.source !== id); for (const t of linksOf(notes[id].body)) if (t !== id) g.edges.push({ source: id, target: t });
    notes[id].links = linksOf(notes[id].body); for (const n of Object.values(notes)) n.backlinks = g.edges.filter(e => e.target === n.id).map(e => e.source);
    for (const n of g.nodes) n.deg = g.edges.filter(e => e.source === n.id).length;
  };
  return {
    graph: async () => JSON.parse(JSON.stringify(g)),
    note: async id => { const n = notes[id]; if (!n) throw new Error("no such note"); return n; },
    search: async q => { const w = q.toLowerCase().split(/\s+/).filter(Boolean);
      return Object.values(notes).map(n => { const t = (n.title + " " + n.body).toLowerCase(); const score = w.reduce((a, x) => a + (t.split(x).length - 1) + (n.title.toLowerCase().includes(x) ? 3 : 0), 0);
        const i = Math.max(0, t.indexOf(w[0]) - 30); return { id: n.id, title: n.title, orbit: n.orbit, score, snippet: n.body.replace(/\s+/g, " ").slice(i, i + 120) }; })
        .filter(h => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 8); },
    write: async (id, body) => { notes[id].body = body; g.nodes.find(n => n.id === id)!.mtime = now(); relink(id); return { id }; },
    remember: async text => { const day = new Date().toISOString().slice(0, 10); const id = "Inbox/" + day;
      if (!notes[id]) { notes[id] = { id, title: day, orbit: "asteroid", tags: [], body: "", links: [], backlinks: [] }; g.nodes.push({ id, title: day, orbit: "asteroid", tags: [], summary: "Memories captured on " + day, folder: "Inbox", mtime: now(), deg: 0 }); }
      notes[id].body += `- ${new Date().toTimeString().slice(0, 5)} ${text}\n`; g.nodes.find(n => n.id === id)!.mtime = now(); relink(id); return { id }; },
    create: async (id, body) => { if (notes[id]) throw new Error("a note with that name already exists");
      const folder = id.includes("/") ? id.split("/")[0] : ""; const title = id.split("/").pop()!;
      notes[id] = { id, title, orbit: "moon", tags: [], body: body || `# ${title}\n\n`, links: [], backlinks: [] };
      g.nodes.push({ id, title, orbit: "moon", tags: [], summary: "", folder, mtime: now(), deg: 0 }); return { id }; },
    health: async () => { const linked = new Set(g.edges.flatMap(e => [e.source, e.target])); const deg = new Map<string, number>();
      for (const e of g.edges) for (const k of [e.source, e.target]) deg.set(k, (deg.get(k) || 0) + 1);
      return { notes: g.nodes.length, links: g.edges.length, words: Object.values(notes).reduce((a, n) => a + (n.body.match(/\S+/g)?.length || 0), 0),
        orphans: g.nodes.filter(n => !linked.has(n.id)).map(n => n.id), unresolved: [], contradictions: [],
        hubs: [...deg].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ id, n })), thisWeek: g.nodes.filter(n => n.mtime > now() - 7 * 864e5).length }; },
    settings: async () => ({ vault: "(demo — runs in your browser, nothing is saved)", claudeConfig: "claude_desktop_config.json", snippet: "Install the desktop app to connect Claude." }),
  };
}
const demo = (window as any).__ORRERY_DEMO__;
export const backend: Backend = demo ? demoBackend(demo) : window.orrery ?? {
  graph: (): Promise<GraphData> => j("/api/graph"),
  note: (id: string): Promise<NoteData> => j("/api/note?id=" + encodeURIComponent(id)),
  search: (q: string): Promise<Hit[]> => j("/api/search?q=" + encodeURIComponent(q)),
  settings: (): Promise<Settings> => j("/api/settings"),
  health: (): Promise<Health> => j("/api/health"),
  create: (id: string, body = "") => j("/api/create", { method: "POST", body: JSON.stringify({ id, body }) }),
  write: (id: string, body: string) => j("/api/write", { method: "POST", body: JSON.stringify({ id, body }) }),
  remember: (text: string, o: object = {}) => j("/api/remember", { method: "POST", body: JSON.stringify({ text, ...o }) }),
};
