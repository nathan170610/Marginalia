import { backend, GraphData, GNode, NoteData } from "./api";

const cv = document.getElementById("sky") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- layout: concentric tilted orbits, one band per tier ----------
const TIER = {
  core:     { r0: 78,  r1: 104, speed: 0.10, size: 15, color: [255, 212, 121] },
  planet:   { r0: 190, r1: 300, speed: 0.045, size: 8,  color: [122, 167, 255] },
  moon:     { r0: 350, r1: 450, speed: 0.028, size: 4.6, color: [111, 240, 224] },
  asteroid: { r0: 500, r1: 600, speed: 0.016, size: 2.3, color: [139, 147, 184] },
} as const;
const TILT = 0.78;

interface Body extends GNode { r: number; a: number; w: number; x: number; y: number; size: number; col: number[]; born: number; hue?: number }
interface Pulse { e: number; t: number; v: number }

let bodies: Body[] = []; let byId = new Map<string, Body>();
let edges: { s: Body; t: Body }[] = []; let pulses: Pulse[] = [];
let adj = new Map<string, Set<string>>();
let hover: Body | null = null; let selected: string | null = null; let matches: Set<string> | null = null;
let zoom = 1, panX = 0, panY = 0, W = 0, H = 0, dpr = 1, speedMul = 1;

const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const hsl = (h: number, s: number, l: number) => { const k = (n: number) => (n + h * 12) % 12, a = s * Math.min(l, 1 - l); const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255]; };

function layout(data: GraphData, first: boolean) {
  const old = byId; const now = performance.now();
  const tiers: Record<string, GNode[]> = { core: [], planet: [], moon: [], asteroid: [] };
  for (const n of data.nodes) tiers[n.orbit].push(n);
  const next: Body[] = [];
  for (const k of Object.keys(tiers) as (keyof typeof TIER)[]) {
    const list = tiers[k].sort((a, b) => a.folder.localeCompare(b.folder) || a.id.localeCompare(b.id));
    const T = TIER[k];
    list.forEach((n, i) => {
      const prev = old.get(n.id);
      const frac = list.length > 1 ? i / list.length : 0;
      const rr = T.r0 + (T.r1 - T.r0) * ((i * 0.618033 + hash(n.id) * 0.5) % 1);
      const col = k === "planet" ? hsl(0.55 + hash(n.folder || "x") * 0.45, 0.85, 0.66).map(Math.round) : [...T.color];
      const size = k === "planet" ? T.size + Math.min(n.deg, 8) * 0.9 : k === "moon" ? T.size + Math.min(n.deg, 5) * 0.4 : T.size;
      next.push({ ...n, r: prev?.r ?? rr, a: prev?.a ?? (frac * Math.PI * 2 + hash(n.id) * 0.6), w: T.speed * (0.8 + hash(n.id + "w") * 0.5) * (80 / Math.sqrt(rr)) / 8, x: prev?.x ?? 0, y: prev?.y ?? 0, size, col, born: prev?.born ?? (first ? now - 5000 : now) });
    });
  }
  bodies = next; byId = new Map(bodies.map(b => [b.id, b]));
  edges = data.edges.map(e => ({ s: byId.get(e.source)!, t: byId.get(e.target)! })).filter(e => e.s && e.t);
  adj = new Map(); for (const e of edges) { (adj.get(e.s.id) ?? adj.set(e.s.id, new Set()).get(e.s.id)!).add(e.t.id); (adj.get(e.t.id) ?? adj.set(e.t.id, new Set()).get(e.t.id)!).add(e.s.id); }
  pulses = edges.map((_, i) => ({ e: i, t: Math.random(), v: 0.12 + Math.random() * 0.18 }));
  $("stats").textContent = `${bodies.length} notes · ${edges.length} links`;
}

// ---------- background ----------
const stars = Array.from({ length: 260 }, (_, i) => ({ x: hash("sx" + i), y: hash("sy" + i), z: 0.3 + hash("sz" + i) * 0.7, p: hash("sp" + i) * 6.28 }));

function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
addEventListener("resize", resize); resize();

const rgba = (c: number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const sx = (x: number) => W / 2 + panX + x * zoom, sy = (y: number) => H / 2 + panY + y * zoom;

function nodeAlpha(b: Body): number {
  let a = 1;
  if (matches) a = matches.has(b.id) ? 1 : 0.12;
  else if (hover) a = b === hover || adj.get(hover.id)?.has(b.id) ? 1 : 0.22;
  else if (selected) a = b.id === selected || adj.get(selected)?.has(b.id) ? 1 : 0.35;
  return a;
}
const focusId = () => hover?.id ?? selected;

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const target = hover ? 0.12 : 1; speedMul += (target - speedMul) * 0.08;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#03040a"; ctx.fillRect(0, 0, W, H);
  // nebula
  const ng = ctx.createRadialGradient(sx(0), sy(0), 0, sx(0), sy(0), 700 * zoom);
  ng.addColorStop(0, "rgba(70,50,160,.22)"); ng.addColorStop(.5, "rgba(20,30,90,.10)"); ng.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    const tw = 0.5 + 0.5 * Math.sin(now / 1000 * s.z * 2 + s.p);
    ctx.fillStyle = `rgba(200,215,255,${0.15 + 0.5 * s.z * tw})`;
    ctx.fillRect(((s.x * W + panX * s.z * 0.2) % W + W) % W, ((s.y * H + panY * s.z * 0.2) % H + H) % H, s.z * 1.6, s.z * 1.6);
  }
  // orbit rings
  ctx.lineWidth = 1;
  for (const k of Object.keys(TIER) as (keyof typeof TIER)[]) {
    if (!bodies.some(b => b.orbit === k)) continue;
    const T = TIER[k]; const r = (T.r0 + T.r1) / 2 * zoom;
    ctx.strokeStyle = rgba(T.color as unknown as number[], 0.07);
    ctx.setLineDash([2, 7]); ctx.beginPath(); ctx.ellipse(sx(0), sy(0), r, r * TILT, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  // advance
  for (const b of bodies) { b.a += b.w * dt * speedMul; b.x = Math.cos(b.a) * b.r; b.y = Math.sin(b.a) * b.r * TILT; }
  // sun
  const pulse = 1 + 0.06 * Math.sin(now / 900);
  const sg = ctx.createRadialGradient(sx(0), sy(0), 0, sx(0), sy(0), 70 * zoom * pulse);
  sg.addColorStop(0, "rgba(255,244,200,1)"); sg.addColorStop(.18, "rgba(255,200,110,.85)"); sg.addColorStop(.5, "rgba(255,140,70,.25)"); sg.addColorStop(1, "rgba(255,120,60,0)");
  ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx(0), sy(0), 70 * zoom * pulse, 0, 7); ctx.fill();

  // edges (additive glow)
  const fid = focusId(); const heavy = edges.length > 500;
  for (const e of edges) {
    const hot = fid && (e.s.id === fid || e.t.id === fid);
    let a = matches ? (matches.has(e.s.id) && matches.has(e.t.id) ? 0.5 : 0.015) : fid ? (hot ? 0.75 : 0.035) : heavy ? 0.06 : 0.13;
    const x1 = sx(e.s.x), y1 = sy(e.s.y), x2 = sx(e.t.x), y2 = sy(e.t.y);
    const mx = (x1 + x2) / 2 + (sx(0) - (x1 + x2) / 2) * 0.35, my = (y1 + y2) / 2 + (sy(0) - (y1 + y2) / 2) * 0.35;
    const g = ctx.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0, rgba(e.s.col, a)); g.addColorStop(1, rgba(e.t.col, a));
    ctx.strokeStyle = g; ctx.lineWidth = hot ? 1.8 : 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
  }
  // pulses travelling along links
  for (const p of pulses) {
    p.t += p.v * dt * (0.4 + speedMul * 0.6); if (p.t > 1) p.t -= 1;
    const e = edges[p.e]; if (!e) continue;
    const hot = fid && (e.s.id === fid || e.t.id === fid);
    if ((fid || matches) && !hot) continue; if (heavy && !hot) continue;
    const x1 = sx(e.s.x), y1 = sy(e.s.y), x2 = sx(e.t.x), y2 = sy(e.t.y);
    const mx = (x1 + x2) / 2 + (sx(0) - (x1 + x2) / 2) * 0.35, my = (y1 + y2) / 2 + (sy(0) - (y1 + y2) / 2) * 0.35;
    const t = p.t, u = 1 - t; const px = u * u * x1 + 2 * u * t * mx + t * t * x2, py = u * u * y1 + 2 * u * t * my + t * t * y2;
    const c = [(e.s.col[0] + e.t.col[0]) / 2 + 40, (e.s.col[1] + e.t.col[1]) / 2 + 40, (e.s.col[2] + e.t.col[2]) / 2 + 40];
    const rg = ctx.createRadialGradient(px, py, 0, px, py, hot ? 9 : 6); rg.addColorStop(0, rgba(c, hot ? 1 : 0.8)); rg.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, hot ? 9 : 6, 0, 7); ctx.fill();
  }
  // bodies
  for (const b of bodies) {
    const al = nodeAlpha(b); const age = (now - b.born) / 1000;
    const flare = age < 4 ? 1 + (4 - age) * 1.4 : 1; // newly-born notes ignite
    const r = b.size * zoom * (b === hover ? 1.35 : 1);
    const gr = r * (b.orbit === "asteroid" ? 3 : 4.2) * flare;
    const g = ctx.createRadialGradient(sx(b.x), sy(b.y), 0, sx(b.x), sy(b.y), gr);
    g.addColorStop(0, rgba(b.col, 0.55 * al)); g.addColorStop(1, rgba(b.col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), gr, 0, 7); ctx.fill();
    ctx.fillStyle = rgba([Math.min(255, b.col[0] + 70), Math.min(255, b.col[1] + 70), Math.min(255, b.col[2] + 70)], al);
    ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), Math.max(1, r), 0, 7); ctx.fill();
    if (b.id === selected) { ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), r + 6, 0, 7); ctx.stroke(); }
  }
  // labels
  ctx.globalCompositeOperation = "source-over"; ctx.textAlign = "center";
  const showAll = zoom > 0.9;
  for (const b of bodies) {
    const al = nodeAlpha(b); const isFocus = b === hover || b.id === selected || adj.get(fid || "")?.has(b.id) || matches?.has(b.id);
    if (!(b.orbit === "core" || b.orbit === "planet" && showAll || isFocus)) continue;
    ctx.font = `${b.orbit === "core" ? 600 : 500} ${b.orbit === "core" ? 13 : 11.5}px system-ui,sans-serif`;
    ctx.fillStyle = `rgba(225,232,255,${Math.min(1, al + (isFocus ? 0.3 : 0)) * 0.9})`;
    ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
    ctx.fillText(b.title, sx(b.x), sy(b.y) + b.size * zoom + 16); ctx.shadowBlur = 0;
  }
  requestAnimationFrame(frame);
}

// ---------- interaction ----------
function pick(mx: number, my: number): Body | null {
  let best: Body | null = null, bd = 1e9;
  for (const b of bodies) { const d = Math.hypot(sx(b.x) - mx, sy(b.y) - my); const r = Math.max(10, b.size * zoom + 6); if (d < r && d < bd) { best = b; bd = d; } }
  return best;
}
let drag: { x: number; y: number; moved: boolean } | null = null;
cv.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, moved: false }; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
cv.addEventListener("pointermove", e => {
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; panX += dx; panY += dy; drag.x = e.clientX; drag.y = e.clientY; hover = null; return; }
  hover = pick(e.clientX, e.clientY); cv.classList.toggle("hover", !!hover);
  if (hover) { tip(hover, e.clientX, e.clientY); } else tipEl.style.display = "none";
});
cv.addEventListener("pointerup", e => { cv.style.cursor = ""; if (drag && !drag.moved) { const b = pick(e.clientX, e.clientY); if (b) openNote(b.id); else closePanel(); } drag = null; });
cv.addEventListener("wheel", e => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0012); const nz = Math.max(0.35, Math.min(3, zoom * f)); const k = nz / zoom; panX = (e.clientX - W / 2) - (e.clientX - W / 2 - panX) * k; panY = (e.clientY - H / 2) - (e.clientY - H / 2 - panY) * k; zoom = nz; }, { passive: false });

const tipEl = Object.assign(document.createElement("div"), { id: "tip" });
tipEl.style.cssText = "position:fixed;pointer-events:none;display:none;max-width:280px;padding:8px 12px;border-radius:10px;background:rgba(10,14,32,.85);border:1px solid rgba(140,160,255,.3);backdrop-filter:blur(10px);font-size:12px;z-index:5";
document.body.appendChild(tipEl);
function tip(b: Body, x: number, y: number) {
  tipEl.style.display = "block"; tipEl.style.left = Math.min(x + 16, W - 300) + "px"; tipEl.style.top = y + 16 + "px";
  tipEl.innerHTML = `<b>${esc(b.title)}</b> <span style="color:#8b93b8">· ${b.orbit}</span><br><span style="color:#aab3d8">${esc(b.summary || "")}</span>`;
}

// ---------- note panel ----------
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function md(src: string): string {
  const lines = esc(src).split("\n"); let html = "", list = false;
  const inline = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, id, al) => `<span class="wl" data-id="${id.trim()}">${al || id.split("/").pop()}</span>`);
  for (const l of lines) {
    const h = /^(#{1,3})\s+(.*)/.exec(l), li = /^\s*(?:[-*]|\d+\.)\s+(.*)/.exec(l);
    if (li) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { html += "</ul>"; list = false; }
    if (h) html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  return html + (list ? "</ul>" : "");
}
function resolveLink(raw: string): string | null {
  const low = raw.toLowerCase(); const hit = bodies.find(b => b.id.toLowerCase() === low) || bodies.find(b => b.id.split("/").pop()!.toLowerCase() === low || b.title.toLowerCase() === low);
  return hit ? hit.id : null;
}
async function openNote(id: string) {
  const n: NoteData = await backend.note(id); selected = id;
  $("panel").hidden = false; $("ptitle").textContent = n.title;
  $("pmeta").textContent = `${n.orbit} · ${n.id}${n.tags.length ? " · " + n.tags.map(t => "#" + t).join(" ") : ""}`;
  $("pbody").innerHTML = md(n.body);
  const chips = (ids: string[]) => ids.map(i => `<span class="wl" data-id="${i}">${esc(byId.get(i)?.title ?? i)}</span>`).join(" · ");
  $("plinks").innerHTML = (n.links.length ? `<h4>Links</h4>${chips(n.links)}` : "") + (n.backlinks.length ? `<h4>Linked from</h4>${chips(n.backlinks)}` : "");
}
function closePanel() { $("panel").hidden = true; selected = null; }
$("close").onclick = closePanel;
$("panel").addEventListener("click", e => { const t = (e.target as HTMLElement).closest(".wl") as HTMLElement | null; if (t) { const id = resolveLink(t.dataset.id!); if (id) openNote(id); } });
addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); } if (e.key === "Escape") { ($("q") as HTMLInputElement).value = ""; matches = null; $("results").innerHTML = ""; closePanel(); (document.activeElement as HTMLElement)?.blur(); } });

// ---------- search ----------
let st: number | undefined;
$<HTMLInputElement>("q").addEventListener("input", e => {
  const q = (e.target as HTMLInputElement).value.trim(); clearTimeout(st); hover = null; tipEl.style.display = "none";
  if (!q) { matches = null; $("results").innerHTML = ""; return; }
  st = window.setTimeout(async () => {
    const hits = await backend.search(q); matches = new Set(hits.map(h => h.id));
    $("results").innerHTML = hits.map(h => `<div class="hit" data-id="${h.id}"><b>${esc(h.title)}</b><small>${esc(h.snippet)}</small></div>`).join("");
  }, 120);
});
$("results").addEventListener("click", e => { const t = (e.target as HTMLElement).closest(".hit") as HTMLElement | null; if (t) openNote(t.dataset.id!); });

// ---------- capture ----------
$("capture").addEventListener("submit", async e => {
  e.preventDefault(); const inp = $<HTMLInputElement>("cap"); const t = inp.value.trim(); if (!t) return;
  await backend.remember(t); inp.value = ""; await refresh();
});

// ---------- live refresh (Claude writes notes -> they ignite) ----------
let sig = "";
async function refresh(first = false) {
  try { const d = await backend.graph(); const s = d.nodes.map(n => n.id + n.mtime).join("|") + d.edges.length; if (s === sig) return; sig = s; layout(d, first); } catch (e) { console.error(e); }
}
refresh(true).then(() => requestAnimationFrame(frame));
setInterval(() => refresh(), 4000);
(window as any).__orrery = { get bodies() { return bodies; } };
