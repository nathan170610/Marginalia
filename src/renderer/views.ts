// Alternative layouts for the same bodies. Each runs once per vault change, never per frame.
export type View = "orbit" | "constellation" | "timeline" | "list";
export const VIEWS: { v: View; icon: string; name: string }[] = [
  { v: "orbit", icon: "◎", name: "Orbit" }, { v: "constellation", icon: "✦", name: "Constellation" },
  { v: "timeline", icon: "⇢", name: "Timeline" }, { v: "list", icon: "☰", name: "List" },
];
interface N { id: string; folder: string; mtime: number; deg: number; title: string; orbit: string; summary: string }
type P = Map<string, [number, number]>;
const h = (s: string) => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967295; };

/** Force-directed constellation: links pull, everything repels, folders seed the start angle. Budgeted by vault size. */
export function constellation(nodes: N[], edges: { s: string; t: string }[]): P {
  const n = nodes.length, idx = new Map(nodes.map((v, i) => [v.id, i]));
  const folders = [...new Set(nodes.map(v => v.folder))];
  const x = new Float64Array(n), y = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n);
  nodes.forEach((v, i) => { const a = folders.indexOf(v.folder) / Math.max(1, folders.length) * 6.283 + h(v.id) * 0.9, r = 120 + h(v.id + "r") * 260; x[i] = Math.cos(a) * r; y[i] = Math.sin(a) * r; });
  const E = edges.map(e => [idx.get(e.s), idx.get(e.t)]).filter((p): p is number[] => p[0] !== undefined && p[1] !== undefined);
  const iters = Math.max(30, Math.min(220, Math.floor(4e6 / Math.max(1, n * n))));
  for (let it = 0; it < iters; it++) {
    const cool = 1 - it / iters;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j], dy = y[i] - y[j], d2 = dx * dx + dy * dy + 25, f = 2600 / d2;
      vx[i] += dx * f / Math.sqrt(d2); vy[i] += dy * f / Math.sqrt(d2); vx[j] -= dx * f / Math.sqrt(d2); vy[j] -= dy * f / Math.sqrt(d2);
    }
    for (const [a, b] of E) { const dx = x[b] - x[a], dy = y[b] - y[a], d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 90) * 0.02; vx[a] += dx / d * f; vy[a] += dy / d * f; vx[b] -= dx / d * f; vy[b] -= dy / d * f; }
    for (let i = 0; i < n; i++) { vx[i] -= x[i] * 0.004; vy[i] -= y[i] * 0.004; x[i] += Math.max(-30, Math.min(30, vx[i])) * cool; y[i] += Math.max(-30, Math.min(30, vy[i])) * cool; vx[i] *= 0.6; vy[i] *= 0.6; }
  }
  // fit into roughly ±560 so it frames like the orbit view
  let m = 1; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(x[i]), Math.abs(y[i]) * 1.35);
  const k = 560 / m; const out: P = new Map(); nodes.forEach((v, i) => out.set(v.id, [x[i] * k, y[i] * k])); return out;
}

/** Timeline: x = last edit date, one horizontal lane per folder. */
export function timeline(nodes: N[]): { pos: P; lanes: string[]; t0: number; t1: number } {
  const ts = nodes.map(v => v.mtime).filter(Boolean); const t0 = Math.min(...ts, Date.now()), t1 = Math.max(...ts, t0 + 864e5);
  const lanes = [...new Set(nodes.map(v => v.folder || "(root)"))].sort();
  const pos: P = new Map();
  // half date, half rank: notes edited on the same day still spread out instead of piling up
  const rank = new Map([...nodes].sort((a, b) => a.mtime - b.mtime).map((v, i) => [v.id, i / Math.max(1, nodes.length - 1)]));
  for (const v of nodes) { const li = lanes.indexOf(v.folder || "(root)"); pos.set(v.id, [-620 + 1240 * (0.5 * (v.mtime - t0) / (t1 - t0) + 0.5 * rank.get(v.id)!), (li - (lanes.length - 1) / 2) * 56 + (h(v.id) - 0.5) * 22]); }
  return { pos, lanes, t0, t1 };
}
export const laneY = (i: number, n: number) => (i - (n - 1) / 2) * 56;

const ago = (t: number) => { const d = (Date.now() - t) / 864e5; return d < 1 ? "today" : d < 2 ? "yesterday" : d < 30 ? `${Math.floor(d)} d ago` : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }); };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Plain, fast list: filter text, sort, folder chips. Returns HTML; clicks are handled by the caller via data-id. */
export function listHTML(nodes: N[], q: string, sort: string, folder: string, color: (n: N) => string, pinned: Set<string>): { chips: string; items: string } {
  const folders = [...new Set(nodes.map(v => v.folder || "(root)"))].sort();
  const ql = q.trim().toLowerCase();
  let list = nodes.filter(v => (!folder || (v.folder || "(root)") === folder) && (!ql || (v.title + " " + v.summary + " " + v.id).toLowerCase().includes(ql)));
  list = list.sort(sort === "az" ? (a, b) => a.title.localeCompare(b.title) : sort === "links" ? (a, b) => b.deg - a.deg : (a, b) => b.mtime - a.mtime);
  list.sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  const chips = [`<button class="chip${folder ? "" : " on"}" data-f="">All · ${nodes.length}</button>`, ...folders.map(f => `<button class="chip${f === folder ? " on" : ""}" data-f="${esc(f)}">${esc(f)}</button>`)].join("");
  const items = list.map(v => `<div class="li" data-id="${esc(v.id)}"><i style="--c:${color(v)}"></i><div><b>${pinned.has(v.id) ? "★ " : ""}${esc(v.title)}</b><small>${esc(v.summary || v.id)}</small></div><span>${esc(v.folder || "")}<br>${ago(v.mtime)} · ${v.deg}↔</span></div>`).join("")
    || `<p class="dim" style="padding:12px">No notes match.</p>`;
  return { chips, items };
}
