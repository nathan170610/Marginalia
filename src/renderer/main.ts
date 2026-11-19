import { backend, GraphData, GNode, NoteData } from "./api";
import { planetTexture, nebulaTexture, snapshot, clearTextures } from "./fx";
import { View, VIEWS, constellation, timeline, laneY, listHTML } from "./views";
import { esc, md, toc, readingStats, loadPrefs, applyPrefs } from "./reader";
import { createPalette, Cmd } from "./palette";

const cv = document.getElementById("sky") as HTMLCanvasElement;
const ctx = cv.getContext("2d", { alpha: false })!;
const mm = document.getElementById("minimap") as HTMLCanvasElement;
const mctx = mm.getContext("2d")!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type Tier = "core" | "planet" | "moon" | "asteroid";
type RGB = number[];

// ---------- themes ----------
interface Theme { name: string; bg: string; nebula: [string, string]; star: RGB; stars: boolean; sun: string[]; label: RGB; shadow: string; additive: boolean;
  tier: Record<Tier, RGB>; planetHue: [number, number]; planetSL: [number, number]; edgeK: number }
const THEMES: Record<string, Theme> = {
  space: { name: "deep space", bg: "#03040a", nebula: ["rgba(70,50,160,.22)", "rgba(20,30,90,.10)"], star: [200, 215, 255], stars: true,
    sun: ["rgba(255,244,200,1)", "rgba(255,200,110,.85)", "rgba(255,140,70,.25)", "rgba(255,120,60,0)"], label: [225, 232, 255], shadow: "rgba(0,0,0,.85)", additive: true,
    tier: { core: [255, 212, 121], planet: [122, 167, 255], moon: [111, 240, 224], asteroid: [139, 147, 184] }, planetHue: [0.55, 0.45], planetSL: [0.85, 0.66], edgeK: 1 },
  aurora: { name: "aurora", bg: "#020a0c", nebula: ["rgba(30,160,120,.20)", "rgba(40,60,140,.12)"], star: [190, 255, 235], stars: true,
    sun: ["rgba(235,255,240,1)", "rgba(150,255,190,.8)", "rgba(60,200,170,.25)", "rgba(40,160,160,0)"], label: [215, 255, 240], shadow: "rgba(0,0,0,.85)", additive: true,
    tier: { core: [190, 255, 170], planet: [120, 200, 255], moon: [130, 230, 255], asteroid: [120, 160, 150] }, planetHue: [0.3, 0.4], planetSL: [0.8, 0.62], edgeK: 1 },
  paper: { name: "paper", bg: "#f3efe6", nebula: ["rgba(220,180,120,.22)", "rgba(200,190,170,.10)"], star: [120, 105, 80], stars: false,
    sun: ["rgba(255,236,190,1)", "rgba(240,170,80,.85)", "rgba(230,140,60,.22)", "rgba(230,140,60,0)"], label: [42, 38, 32], shadow: "rgba(243,239,230,.9)", additive: false,
    tier: { core: [200, 110, 30], planet: [60, 90, 160], moon: [30, 130, 120], asteroid: [130, 122, 110] }, planetHue: [0.5, 0.6], planetSL: [0.55, 0.38], edgeK: 1.6 },
  solar: { name: "solar", bg: "#0b0603", nebula: ["rgba(200,110,30,.22)", "rgba(120,40,20,.12)"], star: [255, 225, 190], stars: true,
    sun: ["rgba(255,250,225,1)", "rgba(255,190,80,.9)", "rgba(255,110,30,.3)", "rgba(255,90,20,0)"], label: [255, 236, 210], shadow: "rgba(0,0,0,.85)", additive: true,
    tier: { core: [255, 196, 90], planet: [255, 150, 90], moon: [255, 210, 150], asteroid: [170, 140, 120] }, planetHue: [0.02, 0.12], planetSL: [0.85, 0.6], edgeK: 1 },
  ink: { name: "midnight ink", bg: "#000000", nebula: ["rgba(60,90,255,.16)", "rgba(10,20,80,.10)"], star: [255, 255, 255], stars: true,
    sun: ["rgba(255,255,255,1)", "rgba(200,220,255,.85)", "rgba(80,120,255,.25)", "rgba(60,90,255,0)"], label: [255, 255, 255], shadow: "rgba(0,0,0,1)", additive: true,
    tier: { core: [255, 255, 255], planet: [110, 160, 255], moon: [200, 220, 255], asteroid: [150, 160, 190] }, planetHue: [0.58, 0.12], planetSL: [0.95, 0.7], edgeK: 1.3 },
};
const THEME_ORDER = ["space", "aurora", "solar", "ink", "paper"];
const store = { get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
let themeKey = THEMES[store.get("orrery.theme") || ""] ? store.get("orrery.theme")! : "space";
let th = THEMES[themeKey];
const sysReduce = matchMedia("(prefers-reduced-motion: reduce)");
let reduced = store.get("orrery.motion") ? store.get("orrery.motion") === "reduced" : sysReduce.matches;

// ---------- layout: concentric tilted orbits; planets clustered by folder ----------
const TIER = {
  core:     { r0: 78,  r1: 104, speed: 0.10,  size: 15 },
  planet:   { r0: 190, r1: 300, speed: 0.045, size: 8 },
  moon:     { r0: 350, r1: 450, speed: 0.028, size: 4.6 },
  asteroid: { r0: 500, r1: 600, speed: 0.016, size: 2.3 },
} as const;
const TIERS = Object.keys(TIER) as Tier[];
const BASE_TILT = 0.78;

interface Body extends GNode { r: number; a0: number; drift: number; x: number; y: number; px: number; py: number; ps: number; depth: number;
  size: number; col: RGB; born: number; visible: boolean; tw?: number; dot?: string; cx: number; cy: number; tx: number; ty: number; wx: number; wy: number }
interface Pulse { e: number; t: number; v: number }
interface Cluster { folder: string; a: number; n: number }

let bodies: Body[] = []; let byId = new Map<string, Body>();
let edges: { s: Body; t: Body }[] = []; let pulses: Pulse[] = [];
let adj = new Map<string, Set<string>>(); let clusters: Cluster[] = []; let glowSet = new Set<string>();
const phase: Record<Tier, number> = { core: 0, planet: 0, moon: 0, asteroid: 0 };
let hover: Body | null = null; let selected: string | null = null; let matches: Set<string> | null = null;
let zoom = 1, panX = 0, panY = 0, W = 0, H = 0, dpr = 1, speedMul = 1, tiltOff = 0;
let tMin = 0, tMax = 0, lapse: number | null = null, playing = false;

const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const hsl = (h: number, s: number, l: number) => { const k = (n: number) => (n + h * 12) % 12, a = s * Math.min(l, 1 - l); const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round); };
const colorFor = (n: GNode): RGB => n.orbit === "planet" ? hsl((th.planetHue[0] + hash(n.folder || "x") * th.planetHue[1]) % 1, th.planetSL[0], th.planetSL[1]) : [...th.tier[n.orbit]];

function layout(data: GraphData, first: boolean) {
  const old = byId; const now = performance.now();
  const tiers: Record<Tier, GNode[]> = { core: [], planet: [], moon: [], asteroid: [] };
  for (const n of data.nodes) tiers[n.orbit].push(n);
  const next: Body[] = [];
  clusters = [];
  for (const k of TIERS) {
    const list = tiers[k].sort((a, b) => a.folder.localeCompare(b.folder) || a.id.localeCompare(b.id));
    const T = TIER[k];
    // planets: each folder gets an angular sector proportional to its size, so related planets travel together
    const groups = new Map<string, GNode[]>();
    if (k === "planet") { for (const n of list) (groups.get(n.folder) ?? groups.set(n.folder, []).get(n.folder)!).push(n); }
    let cursor = 0; const sectorOf = new Map<string, { start: number; span: number; count: number }>();
    for (const [f, g] of groups) { const span = (g.length / list.length) * Math.PI * 2; sectorOf.set(f, { start: cursor, span, count: g.length }); clusters.push({ folder: f || "(root)", a: cursor + span / 2, n: g.length }); cursor += span; }
    const idxInFolder = new Map<string, number>();
    list.forEach((n, i) => {
      const prev = old.get(n.id);
      const rr = T.r0 + (T.r1 - T.r0) * ((i * 0.618033 + hash(n.id) * 0.5) % 1);
      let a0: number;
      if (k === "planet") { const s = sectorOf.get(n.folder)!; const j = idxInFolder.get(n.folder) ?? 0; idxInFolder.set(n.folder, j + 1); a0 = s.start + s.span * ((j + 0.5) / s.count) + (hash(n.id) - 0.5) * Math.min(0.25, s.span / s.count * 0.4); }
      else a0 = (list.length > 1 ? i / list.length : 0) * Math.PI * 2 + hash(n.id) * 0.6;
      const size = k === "planet" ? T.size + Math.min(n.deg, 8) * 0.9 : k === "moon" ? T.size + Math.min(n.deg, 5) * 0.4 : T.size;
      next.push({ ...n, r: rr, a0: prev?.orbit === k ? prev.a0 : a0, drift: k === "planet" || k === "core" ? 0 : (hash(n.id + "w") - 0.5) * 0.02,
        x: prev?.x ?? 0, y: prev?.y ?? 0, px: prev?.px ?? -1e4, py: prev?.py ?? -1e4, ps: 1, depth: 0, size, col: colorFor(n),
        born: prev?.born ?? (first ? now - 5000 : now), visible: true, cx: 0, cy: 0, tx: 0, ty: 0, wx: prev?.wx ?? 0, wy: prev?.wy ?? 0 });
    });
  }
  bodies = next; byId = new Map(bodies.map(b => [b.id, b]));
  edges = data.edges.map(e => ({ s: byId.get(e.source)!, t: byId.get(e.target)! })).filter(e => e.s && e.t);
  adj = new Map(); for (const e of edges) { (adj.get(e.s.id) ?? adj.set(e.s.id, new Set()).get(e.s.id)!).add(e.t.id); (adj.get(e.t.id) ?? adj.set(e.t.id, new Set()).get(e.t.id)!).add(e.s.id); }
  glowSet = new Set(bodies.filter(b => b.orbit === "planet").sort((a, b) => b.deg - a.deg).slice(0, 60).map(b => b.id));
  hubs = new Set(bodies.filter(b => b.orbit === "planet" && b.deg >= 3).sort((a, b) => b.deg - a.deg).slice(0, 4).map(b => b.id));
  // dense vaults: shrink everything but the best-connected planets so the picture stays legible
  if (bodies.length > 400) for (const b of bodies) if (b.orbit !== "core" && !glowSet.has(b.id)) b.size = Math.max(1.6, b.size * 0.5);
  pulses = edges.map((_, i) => ({ e: i, t: Math.random(), v: 0.12 + Math.random() * 0.18 }));
  const cpos = constellation(bodies, edges.map(e => ({ s: e.s.id, t: e.t.id }))); tl = timeline(bodies);
  for (const b of bodies) { [b.cx, b.cy] = cpos.get(b.id)!; [b.tx, b.ty] = tl.pos.get(b.id)!; }
  const ts = bodies.map(b => b.mtime).filter(Boolean); tMin = Math.min(...ts); tMax = Math.max(...ts, Date.now());
  $("stats").textContent = `${bodies.length} notes · ${edges.length} links`;
}

// ---------- glow sprites (one pre-rendered gradient per colour: far cheaper than a gradient per body per frame) ----------
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(c: RGB): HTMLCanvasElement {
  const key = c.join(","); let s = sprites.get(key); if (s) return s;
  s = document.createElement("canvas"); s.width = s.height = 64; const g = s.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, `rgba(${key},1)`); rg.addColorStop(0.35, `rgba(${key},.35)`); rg.addColorStop(1, `rgba(${key},0)`);
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); sprites.set(key, s); return s;
}

// ---------- textures (fx.ts): planet surfaces, rings, nebula ----------
let fxOn = store.get("orrery.fx") !== "off", texOK = true; let curTilt = BASE_TILT; let hubs = new Set<string>();
const solids: { b: Body; r: number; al: number }[] = [];
const nebCache = new Map<string, HTMLCanvasElement>();
const nebula = () => nebCache.get(themeKey) ?? nebCache.set(themeKey, nebulaTexture(th.nebula[0], th.nebula[1], 0.2 + THEME_ORDER.indexOf(themeKey) * 0.13)).get(themeKey)!;
function ringArc(b: Body, r: number, al: number, a0: number, a1: number) {
  ctx.strokeStyle = rgba(lighten(b.col, 60), 0.55 * al); ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.beginPath(); ctx.ellipse(b.px, b.py, r * 2, r * 2 * curTilt * 0.42, -0.35, a0, a1); ctx.stroke();
}
let fade: { img: HTMLCanvasElement; t: number } | null = null; // theme cross-fade

// ---------- views (views.ts): orbit / constellation / timeline morph on the canvas; list is an HTML overlay ----------
let view: View = VIEWS.some(v => v.v === store.get("orrery.view")) ? store.get("orrery.view") as View : "orbit";
let flat: View = view === "list" ? "orbit" : view; // what the canvas shows
let vmix = flat === "orbit" ? 0 : 1, vInit = true;
let tl: ReturnType<typeof timeline> = { pos: new Map(), lanes: [], t0: 0, t1: 1 };
const viewPos = (b: Body): [number, number] => flat === "constellation" ? [b.cx, b.cy] : flat === "timeline" ? [b.tx, b.ty] : [b.x, b.y];

// ---------- background: three parallax star layers ----------
const stars = Array.from({ length: 320 }, (_, i) => ({ x: hash("sx" + i), y: hash("sy" + i), z: 0.25 + hash("sz" + i) * 0.75, p: hash("sp" + i) * 6.28 }));
function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
addEventListener("resize", resize); resize();

const rgba = (c: RGB, a: number | string) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const sx = (x: number) => W / 2 + panX + x * zoom, sy = (y: number) => H / 2 + panY + y * zoom;
const focusId = () => hover?.id ?? selected;
const lighten = (c: RGB, d: number) => c.map(v => Math.max(0, Math.min(255, v + d)));

function nodeAlpha(b: Body): number {
  if (recentOnly && Date.now() - b.mtime > 7 * 864e5) return 0.12;
  if (matches) return matches.has(b.id) ? 1 : 0.12;
  if (hover) return b === hover || adj.get(hover.id)?.has(b.id) ? 1 : 0.22;
  if (selected) return b.id === selected || adj.get(selected)?.has(b.id) ? 1 : 0.35;
  return 1;
}

/** World → screen with tilt, depth scaling and parallax: far side of each orbit is smaller, dimmer and moves less when panning. */
function project(b: Body, ang: number, tilt: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  b.x = c * b.r; b.y = s * b.r * tilt; b.depth = s; // +1 = nearest (bottom of ellipse), -1 = farthest
  const dScale = 1 + (dof ? 0.38 : 0.16) * s * (1 - tilt);
  b.ps = dScale; b.px = W / 2 + panX * (1 + 0.06 * s) + b.x * zoom * dScale; b.py = H / 2 + panY * (1 + 0.06 * s) + b.y * zoom * dScale;
}

let last = performance.now(), fps = 60, frameN = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05; frameN++;
  const motion = reduced ? 0 : 1;
  speedMul += ((hover ? 0.12 : 1) - speedMul) * 0.08;
  if (!drag) tiltOff *= reduced ? 0 : 0.9;
  const tilt = curTilt = Math.max(0.22, Math.min(0.98, BASE_TILT + tiltUser + tiltOff));
  if (cam) { cam.t = Math.min(1, cam.t + dt / 0.6); const k = 1 - Math.pow(1 - cam.t, 3);
    zoom = cam.z0 + (cam.z1 - cam.z0) * k; panX = cam.x0 + (cam.x1 - cam.x0) * k; panY = cam.y0 + (cam.y1 - cam.y0) * k; if (cam.t >= 1) cam = null; }
  else if (follow && selected && !drag) { const b = byId.get(selected); if (b) { const [x, y] = viewPos(b); panX += (-x * zoom - panX) * 0.08; panY += (-y * zoom - panY) * 0.08; } }
  vmix += ((flat === "orbit" ? 0 : 1) - vmix) * (reduced ? 1 : Math.min(1, dt * 4)); if (Math.abs(vmix - Math.round(vmix)) < 0.002) vmix = Math.round(vmix);
  const vk = Math.min(1, dt * 5), orb = 1 - vmix;
  if (fps < 35) texOK = false; else if (fps > 50) texOK = true; // textures switch off on slow machines, with hysteresis
  if (playing && lapse !== null) { lapse += (tMax - tMin) / 10 * dt; if (lapse >= tMax) { lapse = null; playing = false; } syncLapseUI(); }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  const cx = W / 2 + panX * 0.6, cy = H / 2 + panY * 0.6; // nebula sits behind the system: slower parallax
  const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, 760 * zoom);
  ng.addColorStop(0, th.nebula[0]); ng.addColorStop(.5, th.nebula[1]); ng.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
  if (fxOn) { const neb = nebula(), ns = 1700 * (0.75 + zoom * 0.25), nx = W / 2 + panX * 0.4, ny = H / 2 + panY * 0.4;
    ctx.globalAlpha = th.additive ? 0.85 : 0.5; ctx.drawImage(neb, nx - ns / 2 + 160, ny - ns / 2 - 60, ns, ns * 0.75); ctx.globalAlpha = 1; }
  if (th.stars) for (const s of stars) {
    const tw = motion ? 0.5 + 0.5 * Math.sin(now / 1000 * s.z * 2 + s.p) : 0.7;
    ctx.fillStyle = rgba(th.star, 0.12 + 0.5 * s.z * tw);
    const k = s.z * s.z * 0.35; // nearer stars drift more
    ctx.fillRect(((s.x * W + panX * k) % W + W) % W, ((s.y * H + panY * k) % H + H) % H, s.z * 1.6, s.z * 1.6);
  }
  // orbit rings + faint tier labels
  ctx.lineWidth = 1; ctx.textAlign = "center"; ctx.font = "600 9.5px system-ui,sans-serif";
  if (orb > 0.02) for (const k of TIERS) {
    if (!bodies.some(b => b.orbit === k)) continue;
    const r = (TIER[k].r0 + TIER[k].r1) / 2 * zoom;
    ctx.strokeStyle = rgba(th.tier[k], (th.additive ? 0.08 : 0.18) * orb);
    ctx.setLineDash([2, 7]); ctx.beginPath(); ctx.ellipse(sx(0), sy(0), r, r * tilt, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(th.tier[k], (th.additive ? 0.3 : 0.5) * orb);
    if (k !== "core") ctx.fillText((k.toUpperCase() + "S").split("").join(" "), sx(0), sy(0) - r * tilt - 6); // core ring is too small to label without collisions
  }
  // advance + project
  for (const k of TIERS) phase[k] += TIER[k].speed * 0.35 * dt * speedMul * motion;
  for (const b of bodies) {
    b.a0 += b.drift * dt * speedMul * motion;
    project(b, b.a0 + phase[b.orbit], tilt);
    b.visible = (lapse === null || b.mtime <= lapse) && !hiddenTiers.has(b.orbit) && (!folderOnly || (b.folder || "(root)") === folderOnly);
    if (vmix > 0.001) { // morph from the orbit projection toward the flat layout
      const [tx, ty] = viewPos(b);
      if (vInit) { b.wx = tx; b.wy = ty; } else { b.wx += (tx - b.wx) * vk; b.wy += (ty - b.wy) * vk; }
      const e = vmix * vmix * (3 - 2 * vmix);
      b.px += (sx(b.wx) - b.px) * e; b.py += (sy(b.wy) - b.py) * e; b.ps += (1 - b.ps) * e; b.depth *= 1 - e;
    }
  }
  vInit = vmix < 0.001;
  // folder cluster labels around the planet band
  if (clusters.length > 1 && zoom > 0.55 && orb > 0.02) {
    ctx.font = "600 10px system-ui,sans-serif";
    for (const c of clusters) {
      const ang = c.a + phase.planet, r = (TIER.planet.r1 + 34);
      const s = Math.sin(ang), d = 1 + 0.16 * s * (1 - tilt);
      ctx.fillStyle = rgba(th.label, (th.additive ? 0.32 : 0.5) * (0.7 + 0.3 * s) * orb);
      ctx.fillText(c.folder.toUpperCase(), W / 2 + panX + Math.cos(ang) * r * zoom * d, H / 2 + panY + s * r * tilt * zoom * d);
    }
  }
  // timeline axis: date ticks along the bottom, folder names at the start of each lane
  if (flat === "timeline" && vmix > 0.02) {
    ctx.globalAlpha = vmix; ctx.strokeStyle = rgba(th.label, 0.25); ctx.fillStyle = rgba(th.label, 0.6); ctx.font = "500 10px system-ui,sans-serif";
    const yb = sy(laneY(tl.lanes.length, tl.lanes.length) + 10);
    ctx.beginPath(); ctx.moveTo(sx(-640), yb); ctx.lineTo(sx(640), yb); ctx.stroke();
    for (let i = 0; i <= 6; i++) { const x = sx(-620 + 1240 * i / 6); ctx.fillRect(x, yb - 3, 1, 6); ctx.fillText(fmtDate(tl.t0 + (tl.t1 - tl.t0) * i / 6), x, yb + 16); }
    ctx.textAlign = "right";
    tl.lanes.forEach((l, i) => { const y = sy(laneY(i, tl.lanes.length)); ctx.fillText(l.toUpperCase(), sx(-650), y + 3); ctx.strokeStyle = rgba(th.label, 0.06); ctx.beginPath(); ctx.moveTo(sx(-640), y); ctx.lineTo(sx(640), y); ctx.stroke(); });
    ctx.textAlign = "center"; ctx.globalAlpha = 1;
  }
  // sun
  const pulse = 1 + 0.06 * Math.sin(now / 900) * motion;
  const sg = ctx.createRadialGradient(sx(0), sy(0), 0, sx(0), sy(0), 70 * zoom * pulse);
  th.sun.forEach((c, i) => sg.addColorStop([0, .18, .5, 1][i], c));
  if (th.additive) ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = orb; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx(0), sy(0), 70 * zoom * pulse, 0, 7); ctx.fill(); ctx.globalAlpha = 1;

  // edges: alpha scales down with edge count so dense vaults stay readable; dense mode batches into one path
  const fid = focusId(); const heavy = edges.length > 400;
  const major = (b: Body) => b.orbit === "core" || glowSet.has(b.id);
  const baseA = Math.min(0.14, 2.2 / Math.sqrt(edges.length + 1)) * th.edgeK;
  const bend = 0.35 * orb;
  const ctrl = (x1: number, y1: number, x2: number, y2: number) => [(x1 + x2) / 2 + (sx(0) - (x1 + x2) / 2) * bend, (y1 + y2) / 2 + (sy(0) - (y1 + y2) / 2) * bend];
  if (heavy) { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = rgba(th.tier.planet, matches || fid ? baseA * 0.3 : baseA); ctx.lineWidth = 1; ctx.beginPath(); }
  for (const e of edges) {
    if (!e.s.visible || !e.t.visible) continue;
    const hot = !!fid && (e.s.id === fid || e.t.id === fid);
    const hit = matches && matches.has(e.s.id) && matches.has(e.t.id);
    const [mx, my] = ctrl(e.s.px, e.s.py, e.t.px, e.t.py);
    if (heavy && !hot && !hit) {
      // level of detail: links between minor notes only appear once you zoom in
      if (zoom < 1.4 && !major(e.s) && !major(e.t)) continue;
      ctx.moveTo(e.s.px, e.s.py); ctx.lineTo(e.t.px, e.t.py); continue; }
    if (heavy) continue; // hot ones drawn after the batch
    const a = matches ? (hit ? 0.5 : 0.015) : fid ? (hot ? 0.75 : 0.035) : baseA;
    const g = ctx.createLinearGradient(e.s.px, e.s.py, e.t.px, e.t.py); g.addColorStop(0, rgba(e.s.col, a)); g.addColorStop(1, rgba(e.t.col, a));
    ctx.strokeStyle = g; ctx.lineWidth = hot ? 1.8 : 1; ctx.beginPath(); ctx.moveTo(e.s.px, e.s.py); ctx.quadraticCurveTo(mx, my, e.t.px, e.t.py); ctx.stroke();
  }
  if (heavy) {
    ctx.stroke();
    for (const e of edges) {
      if (!e.s.visible || !e.t.visible) continue;
      const hot = !!fid && (e.s.id === fid || e.t.id === fid), hit = matches && matches.has(e.s.id) && matches.has(e.t.id);
      if (!hot && !hit) continue;
      const [mx, my] = ctrl(e.s.px, e.s.py, e.t.px, e.t.py);
      ctx.strokeStyle = rgba(lighten(e.s.col, 30), hot ? 0.8 : 0.5); ctx.lineWidth = hot ? 1.8 : 1.2;
      ctx.beginPath(); ctx.moveTo(e.s.px, e.s.py); ctx.quadraticCurveTo(mx, my, e.t.px, e.t.py); ctx.stroke();
    }
    if (th.additive) ctx.globalCompositeOperation = "lighter";
  }
  // pulses travelling along links
  if (motion) for (const p of pulses) {
    p.t += p.v * dt * (0.4 + speedMul * 0.6); if (p.t > 1) p.t -= 1;
    const e = edges[p.e]; if (!e || !e.s.visible || !e.t.visible) continue;
    const hot = !!fid && (e.s.id === fid || e.t.id === fid);
    if ((fid || matches || heavy) && !hot) continue;
    const [mx, my] = ctrl(e.s.px, e.s.py, e.t.px, e.t.py);
    const t = p.t, u = 1 - t; const px = u * u * e.s.px + 2 * u * t * mx + t * t * e.t.px, py = u * u * e.s.py + 2 * u * t * my + t * t * e.t.py;
    const rad = hot ? 9 : 6; ctx.globalAlpha = hot ? 1 : 0.8;
    ctx.drawImage(sprite(lighten(e.s.col, 40)), px - rad, py - rad, rad * 2, rad * 2); ctx.globalAlpha = 1;
  }
  // comet trails: notes edited in the last 3 days leave a tail along their orbit
  const wall = Date.now();
  for (const b of bodies) {
    if (orb < 0.98 || !b.visible || wall - b.mtime > 3 * 864e5 || b.orbit === "core") continue;
    const fresh = 1 - (wall - b.mtime) / (3 * 864e5); const ang = b.a0 + phase[b.orbit];
    const al = nodeAlpha(b) * (0.25 + 0.5 * fresh); const spr = sprite(b.col);
    for (let i = 1; i <= 14; i++) {
      const aa = ang - i * 0.012 * (240 / b.r) * 3, s = Math.sin(aa), d = 1 + 0.16 * s * (1 - tilt);
      const x = W / 2 + panX * (1 + 0.06 * s) + Math.cos(aa) * b.r * zoom * d, y = H / 2 + panY * (1 + 0.06 * s) + s * b.r * tilt * zoom * d;
      const rad = b.size * zoom * 1.6 * (1 - i / 16); ctx.globalAlpha = al * (1 - i / 15);
      ctx.drawImage(spr, x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  ctx.globalAlpha = 1;
  // bodies: far side first so near bodies overlap them
  const dense = bodies.length > 400;
  const order = dense ? bodies.filter(b => b.visible) : bodies.filter(b => b.visible).sort((a, b) => a.depth - b.depth); const batch = new Map<string, Path2D>(); const rings: Body[] = [];
  for (const b of order) {
    const al = nodeAlpha(b) * (dof ? 0.4 + 0.6 * (b.depth + 1) / 2 : 0.75 + 0.25 * (b.depth + 1) / 2); const age = (now - b.born) / 1000;
    const flare = motion && age < 4 ? 1 + (4 - age) * 1.4 : 1; // newly-born notes ignite
    const r = b.size * zoom * b.ps * (b === hover ? 1.35 : 1);
    const gr = r * (b.orbit === "asteroid" || dense ? 3 : 4.2) * flare;
    // dense vaults: glow only where it carries meaning (core, best-connected planets, focus, new notes); the rest are crisp dots
    if ((!dense || b.orbit === "core" || glowSet.has(b.id) || b === hover || b.id === selected || flare > 1 || al === 1 && (hover || selected || matches))) {
      const halo = gr * (1 + Math.min(b.deg, 12) * 0.05); // atmosphere grows with how connected a note is
      ctx.globalAlpha = (th.additive ? 0.55 : 0.35) * al; ctx.drawImage(sprite(b.col), b.px - halo, b.py - halo, halo * 2, halo * 2); ctx.globalAlpha = 1;
    }
    if (fxOn && !dense && r >= 3.2 && texOK && orb > 0.5) { solids.push({ b, r, al }); }
    else if (dense) { // batch dots by colour + quantised alpha: a handful of fills instead of thousands
      const key = (b.dot ??= th.additive ? rgba(lighten(b.col, 70), "").slice(0, -1) : rgba(b.col, "").slice(0, -1)) + Math.round(al * 8) / 8 + ")";
      let path = batch.get(key); if (!path) batch.set(key, path = new Path2D());
      if (r < 2.6) path.rect(b.px - r, b.py - r, r * 2, r * 2); else { path.moveTo(b.px + r, b.py); path.arc(b.px, b.py, r, 0, 7); }
    } else {
      ctx.fillStyle = rgba(th.additive ? lighten(b.col, 70) : b.col, al);
      ctx.beginPath(); ctx.arc(b.px, b.py, Math.max(1, r), 0, 7); ctx.fill();
    }
    if (b.id === selected) rings.push(b);
  }
  if (dense) { ctx.globalCompositeOperation = "source-over"; for (const [c, path] of batch) { ctx.fillStyle = c; ctx.fill(path); } if (th.additive) ctx.globalCompositeOperation = "lighter"; }
  // textured, sun-lit spheres (normal blending so the night side really darkens)
  if (solids.length) {
    ctx.globalCompositeOperation = "source-over";
    for (const { b, r, al } of solids) {
      const sunA = Math.atan2(b.py - sy(0), b.px - sx(0)); // local -x faces the sun
      const ringed = b.orbit === "planet" && hubs.has(b.id);
      if (ringed) ringArc(b, r, al, Math.PI, Math.PI * 2);
      ctx.save(); ctx.globalAlpha = al; ctx.translate(b.px, b.py); ctx.rotate(sunA);
      ctx.drawImage(planetTexture(b.col, hash(b.id), b.orbit === "moon" || b.orbit === "asteroid" ? "rock" : "gas", th.additive), -r, -r, r * 2, r * 2);
      ctx.restore();
      if (ringed) ringArc(b, r, al, 0, Math.PI);
    }
    solids.length = 0;
    if (th.additive) ctx.globalCompositeOperation = "lighter";
  }
  for (const b of rings) {
    const r = b.size * zoom * b.ps + 6 + (reduced ? 0 : Math.sin(now / 280) * 2);
    ctx.strokeStyle = th.additive ? "rgba(255,255,255,.9)" : "rgba(40,30,20,.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.px, b.py, r, 0, 7); ctx.stroke();
  }
  // labels: level of detail + simple collision avoidance (focused labels always win)
  ctx.globalCompositeOperation = "source-over"; ctx.textAlign = "center";
  const placed: number[][] = [];
  const nPlanets = bodies.filter(b => b.orbit === "planet").length;
  const want = (b: Body, focus: boolean) => focus || b.orbit === "core" || (b.orbit === "planet" && (nPlanets < 30 || zoom > 0.9 && (nPlanets < 150 || glowSet.has(b.id)) || zoom > 1.6)) || (b.orbit === "moon" && zoom > 1.8) || (b.orbit === "asteroid" && zoom > 2.6);
  const cands = order.filter(b => want(b, isFocus(b, fid))).sort((a, b) => Number(isFocus(b, fid)) - Number(isFocus(a, fid)) || TIERS.indexOf(a.orbit) - TIERS.indexOf(b.orbit));
  ctx.strokeStyle = th.shadow; ctx.lineWidth = 3; ctx.lineJoin = "round";
  for (const b of cands) {
    const focus = isFocus(b, fid);
    const fs = b.orbit === "core" ? 13 : 11.5; ctx.font = `${b.orbit === "core" ? 600 : 500} ${fs}px system-ui,sans-serif`;
    const w = (b.tw ??= ctx.measureText(b.title).width), x = b.px, y = b.py + b.size * zoom * b.ps + 16;
    const box = [x - w / 2 - 3, y - fs, x + w / 2 + 3, y + 4];
    if (!focus && placed.some(p => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
    placed.push(box);
    ctx.fillStyle = rgba(th.label, Math.min(1, nodeAlpha(b) + (focus ? 0.3 : 0)) * 0.9);
    ctx.globalAlpha = 0.55; ctx.strokeText(b.title, x, y); ctx.globalAlpha = 1; ctx.fillText(b.title, x, y);
  }
  if (fade) { // previous theme dissolves over 300 ms
    fade.t -= dt / 0.3; if (fade.t <= 0) fade = null;
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = fade.t; ctx.drawImage(fade.img, 0, 0); ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  }
  if (frameN % (bodies.length > 400 ? 12 : 3) === 0) drawMinimap();
  requestAnimationFrame(frame);
}
const isFocus = (b: Body, fid: string | null) => b === hover || b.id === selected || !!adj.get(fid || "")?.has(b.id) || !!matches?.has(b.id);

// ---------- minimap ----------
const MM_R = 640;
function drawMinimap() {
  const w = mm.width, h = mm.height, k = Math.min(w, h / BASE_TILT) / (MM_R * 2);
  mctx.clearRect(0, 0, w, h);
  for (const b of bodies) { if (!b.visible) continue; mctx.fillStyle = rgba(b.col, b.orbit === "asteroid" ? 0.5 : 0.95); const s = b.orbit === "core" ? 3 : b.orbit === "planet" ? 2 : 1;
    const [x, y] = vmix > 0.5 ? [b.wx, b.wy] : [b.x, b.y]; mctx.fillRect(w / 2 + x * k - s / 2, h / 2 + y * k - s / 2, s, s); }
  // viewport rectangle in world coordinates
  const x0 = (-W / 2 - panX) / zoom, y0 = (-H / 2 - panY) / zoom;
  mctx.strokeStyle = rgba(th.label, 0.7); mctx.lineWidth = 1;
  mctx.strokeRect(w / 2 + x0 * k, h / 2 + y0 * k, (W / zoom) * k, (H / zoom) * k);
}
function minimapTo(e: PointerEvent) {
  const r = mm.getBoundingClientRect(), k = Math.min(mm.width, mm.height / BASE_TILT) / (MM_R * 2);
  const wx = ((e.clientX - r.left) * (mm.width / r.width) - mm.width / 2) / k, wy = ((e.clientY - r.top) * (mm.height / r.height) - mm.height / 2) / k;
  panX = -wx * zoom; panY = -wy * zoom;
}
mm.addEventListener("pointerdown", e => { mm.setPointerCapture(e.pointerId); minimapTo(e); });
mm.addEventListener("pointermove", e => { if (e.buttons) minimapTo(e); });

// ---------- interaction ----------
function pick(mx: number, my: number): Body | null {
  let best: Body | null = null, bd = 1e9;
  for (const b of bodies) { if (!b.visible) continue; const d = Math.hypot(b.px - mx, b.py - my); const r = Math.max(10, b.size * zoom * b.ps + 6); if (d < r && d < bd) { best = b; bd = d; } }
  return best;
}
let drag: { x: number; y: number; moved: boolean; rot: boolean } | null = null;
cv.addEventListener("contextmenu", e => e.preventDefault());
cv.addEventListener("pointerdown", e => { cam = null; drag = { x: e.clientX, y: e.clientY, moved: false, rot: e.button === 2 || e.shiftKey }; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
cv.addEventListener("dblclick", e => { if (!pick(e.clientX, e.clientY)) resetView(); });
cv.addEventListener("pointermove", e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.rot && view === "orbit") { for (const k of TIERS) phase[k] += dx * 0.006; tiltUser = Math.max(-0.56, Math.min(0.2, tiltUser - dy * 0.003)); }
    else { panX += dx; panY += dy; if (!reduced && view === "orbit") tiltOff = Math.max(-0.2, Math.min(0.2, tiltOff + dy * 0.0012)); }
    drag.x = e.clientX; drag.y = e.clientY; hover = null; return;
  }
  hover = pick(e.clientX, e.clientY); cv.classList.toggle("hover", !!hover);
  if (hover) tip(hover, e.clientX, e.clientY); else tipEl.style.display = "none";
});
cv.addEventListener("pointerup", e => { cv.style.cursor = ""; if (drag && !drag.moved) { const b = pick(e.clientX, e.clientY); if (b) openNote(b.id); else closePanel(); } drag = null; });
cv.addEventListener("pointerleave", () => { hover = null; tipEl.style.display = "none"; });
function zoomAt(f: number, x = W / 2, y = H / 2) { const nz = Math.max(0.3, Math.min(4, zoom * f)); const k = nz / zoom; panX = (x - W / 2) - (x - W / 2 - panX) * k; panY = (y - H / 2) - (y - H / 2 - panY) * k; zoom = nz; }
cv.addEventListener("wheel", e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0012), e.clientX, e.clientY); }, { passive: false });

const tipEl = Object.assign(document.createElement("div"), { id: "tip" });
tipEl.style.cssText = "position:fixed;pointer-events:none;display:none;max-width:280px;padding:8px 12px;border-radius:10px;background:var(--glass);color:var(--fg);border:1px solid var(--line);backdrop-filter:blur(10px);font-size:12px;z-index:5";
document.body.appendChild(tipEl);
function tip(b: Body, x: number, y: number) {
  tipEl.style.display = "block"; tipEl.style.left = Math.min(x + 16, W - 300) + "px"; tipEl.style.top = y + 16 + "px";
  tipEl.innerHTML = `<b>${esc(b.title)}</b> <span style="color:var(--dim)">· ${b.orbit}</span><br><span style="color:var(--dim)">${esc(b.summary || "")}</span>`;
}

// ---------- camera: fly-to, follow, reset ----------
let cam: { t: number; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null = null;
let tiltUser = 0, dof = store.get("orrery.dof") === "on", follow = false;
function flyTo(x: number, y: number, z: number) {
  const z1 = Math.max(0.3, Math.min(4, z));
  if (reduced) { zoom = z1; panX = x; panY = y; cam = null; return; }
  cam = { t: 0, x0: panX, y0: panY, z0: zoom, x1: x, y1: y, z1 };
}
function centerOn(b: Body, z = Math.max(zoom, 1.3)) { const p = viewPos(b); flyTo(-p[0] * z, -p[1] * z, z); }
function resetView() { tiltUser = 0; flyTo(0, 0, 1); }

// ---------- keyboard navigation ----------
function jump(dx: number, dy: number) {
  const cur = selected ? byId.get(selected) : null;
  if (!cur) { panX -= dx * 60; panY -= dy * 60; return; }
  const score = (b: Body) => { const vx = b.px - cur.px, vy = b.py - cur.py, d = Math.hypot(vx, vy); if (d < 1) return 1e9; const cos = (vx * dx + vy * dy) / d; return cos < 0.5 ? 1e9 : d / cos; };
  const pool = [...(adj.get(cur.id) ?? [])].map(i => byId.get(i)!).filter(b => b?.visible);
  let best = pool.sort((a, b) => score(a) - score(b))[0];
  if (!best || score(best) >= 1e9) best = bodies.filter(b => b.visible).sort((a, b) => score(a) - score(b))[0];
  if (best && score(best) < 1e9) openNote(best.id);
}
const tabOrder = () => bodies.filter(b => b.visible).sort((a, b) => TIERS.indexOf(a.orbit) - TIERS.indexOf(b.orbit) || a.title.localeCompare(b.title));
addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName);
  if (e.key === "Escape") { $<HTMLInputElement>("q").value = ""; matches = null; $("results").innerHTML = ""; $("keys").hidden = true; if (!editing) closePanel(); (document.activeElement as HTMLElement)?.blur(); return; }
  if (typing) return;
  const k = e.key;
  if (k === "/") { e.preventDefault(); $("q").focus(); }
  else if (k === "ArrowLeft") { e.preventDefault(); jump(-1, 0); } else if (k === "ArrowRight") { e.preventDefault(); jump(1, 0); }
  else if (k === "ArrowUp") { e.preventDefault(); jump(0, -1); } else if (k === "ArrowDown") { e.preventDefault(); jump(0, 1); }
  else if (k === "+" || k === "=") zoomAt(1.2); else if (k === "-" || k === "_") zoomAt(1 / 1.2);
  else if (k === "0") resetView();
  else if (k === "Enter" && hover) openNote(hover.id);
  else if (k === "Tab" && document.activeElement === cv || k === "Tab" && document.activeElement === document.body) {
    e.preventDefault(); const list = tabOrder(); if (!list.length) return;
    const i = list.findIndex(b => b.id === selected); const n = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
    openNote(n.id); centerOn(n);
  }
  else if (k === "t" || k === "T") cycleTheme(); else if (k === "m" || k === "M") setReduced(!reduced);
  else if (k === "l" || k === "L") togglePlay(); else if (k === "?") $("keys").hidden = !$("keys").hidden;
});

// ---------- themes & motion ----------
function applyTheme() {
  th = THEMES[themeKey]; document.documentElement.dataset.theme = themeKey; $("themeName").textContent = th.name;
  for (const b of bodies) { b.col = colorFor(b); b.dot = undefined; }
  document.querySelectorAll<HTMLElement>("#legend i").forEach(i => i.style.setProperty("--c", rgba(th.tier[i.dataset.tier as Tier], 1)));
}
function setTheme(k: string) { if (!THEMES[k] || k === themeKey) return; if (!reduced && W) fade = { img: snapshot(cv), t: 1 }; themeKey = k; store.set("orrery.theme", k); clearTextures(); applyTheme(); }
function cycleTheme() { setTheme(THEME_ORDER[(THEME_ORDER.indexOf(themeKey) + 1) % THEME_ORDER.length]); }
function setReduced(v: boolean, save = true) { reduced = v; if (save) store.set("orrery.motion", v ? "reduced" : "full"); $("motion").textContent = v ? "motion: off" : "motion: on"; $("motion").setAttribute("aria-pressed", String(v)); }
$("theme").onclick = cycleTheme; $("motion").onclick = () => setReduced(!reduced); $("help").onclick = () => { $("keys").hidden = !$("keys").hidden; };
sysReduce.addEventListener("change", () => { if (!store.get("orrery.motion")) setReduced(sysReduce.matches, false); });
applyTheme(); setReduced(reduced, false);

// ---------- time-lapse ----------
const slider = $<HTMLInputElement>("slider");
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
function syncLapseUI() {
  slider.value = String(lapse === null ? 1000 : Math.round((lapse - tMin) / Math.max(1, tMax - tMin) * 1000));
  $("when").textContent = lapse === null ? "now" : fmtDate(lapse); $("play").textContent = playing ? "❚❚" : "▶";
}
let prevVisible = new Set<string>();
slider.addEventListener("input", () => { playing = false; const v = +slider.value; lapse = v >= 1000 ? null : tMin + (tMax - tMin) * v / 1000; syncLapseUI(); });
function togglePlay() { if (playing) { playing = false; } else { playing = true; if (lapse === null) lapse = tMin; } syncLapseUI(); }
$("play").onclick = togglePlay;
// notes that appear during a replay flare as they are "born"
setInterval(() => { const now = performance.now(); const vis = new Set(bodies.filter(b => b.visible).map(b => b.id)); if (lapse !== null || playing) for (const b of bodies) if (b.visible && !prevVisible.has(b.id)) b.born = now; prevVisible = vis; }, 100);

// ---------- note panel ----------
function resolveLink(raw: string): string | null {
  const low = raw.toLowerCase(); const hit = bodies.find(b => b.id.toLowerCase() === low) || bodies.find(b => b.id.split("/").pop()!.toLowerCase() === low || b.title.toLowerCase() === low);
  return hit ? hit.id : null;
}
let current: NoteData | null = null; let editing = false;
let history: string[] = [], hi = -1;
async function openNote(id: string, fly = true) {
  if (editing && !confirm("Discard unsaved edits?")) return;
  setEditing(false);
  const n: NoteData = await backend.note(id); selected = id; current = n;
  if (selected !== history[hi]) { history.splice(hi + 1); history.push(id); hi = history.length - 1; }
  $("panel").hidden = false; $("ptitle").textContent = n.title;
  $("pmeta").textContent = `${n.orbit} · ${n.id}${n.tags.length ? " · " + n.tags.map(t => "#" + t).join(" ") : ""} · ${readingStats(n.body)}`;
  const html = md(n.body); $("ptoc").innerHTML = toc(html); $("pbody").innerHTML = html;
  syncPin(); $("panel").scrollTop = 0;
  const b = byId.get(id); if (b && fly) centerOn(b);
  const chips = (ids: string[]) => ids.map(i => `<span class="wl" data-id="${esc(i)}">${esc(byId.get(i)?.title ?? i)}</span>`).join(" · ");
  $("plinks").innerHTML = (n.links.length ? `<h4>Links</h4>${chips(n.links)}` : "") + (n.backlinks.length ? `<h4>Linked from</h4>${chips(n.backlinks)}` : "");
}
function closePanel() { if (editing && !confirm("Discard unsaved edits?")) return; setEditing(false); $("panel").hidden = true; selected = null; current = null; }
$("close").onclick = closePanel;
$("panel").addEventListener("click", e => { const t = (e.target as HTMLElement).closest(".wl") as HTMLElement | null; if (t) { const id = resolveLink(t.dataset.id!); if (id) openNote(id); } });

// ---------- editor with [[ autocomplete ----------
const src = $<HTMLTextAreaElement>("src"), ac = $("ac");
function setEditing(v: boolean) {
  editing = v; $("editor").hidden = !v; $("pbody").hidden = v; $("pactions").hidden = v; ac.hidden = true; $("estatus").textContent = "";
  if (v && current) { src.value = current.body; src.focus(); }
}
$("edit").onclick = () => setEditing(true);
$("cancel").onclick = () => setEditing(false);
async function save() {
  if (!current) return; $("estatus").textContent = "saving…";
  try { await backend.write(current.id, src.value); const id = current.id; setEditing(false); await refresh(); await openNote(id); }
  catch (err) { $("estatus").textContent = "save failed: " + (err as Error).message; }
}
$("save").onclick = save;
let acItems: Body[] = [], acSel = 0;
function acQuery(): string | null { const m = /\[\[([^\]\n]*)$/.exec(src.value.slice(0, src.selectionStart)); return m ? m[1] : null; }
function acUpdate() {
  const q = acQuery(); if (q === null) { ac.hidden = true; return; }
  const ql = q.toLowerCase();
  acItems = bodies.filter(b => b.title.toLowerCase().includes(ql) || b.id.toLowerCase().includes(ql))
    .sort((a, b) => Number(!a.title.toLowerCase().startsWith(ql)) - Number(!b.title.toLowerCase().startsWith(ql)) || TIERS.indexOf(a.orbit) - TIERS.indexOf(b.orbit)).slice(0, 7);
  if (!acItems.length) { ac.hidden = true; return; }
  acSel = Math.min(acSel, acItems.length - 1);
  ac.innerHTML = acItems.map((b, i) => `<div data-i="${i}" class="${i === acSel ? "on" : ""}">${esc(b.title)}<small>${esc(b.folder || "")}</small></div>`).join(""); ac.hidden = false;
}
function acPick(i: number) {
  const b = acItems[i]; if (!b) return; const q = acQuery() ?? ""; const pos = src.selectionStart;
  // titles are unique enough to resolve; fall back to the full id when two notes share a title
  const name = bodies.filter(x => x.title === b.title).length > 1 ? b.id : b.title;
  const after = src.value.slice(pos).startsWith("]]") ? src.value.slice(pos + 2) : src.value.slice(pos);
  src.value = src.value.slice(0, pos - q.length) + name + "]]" + after; const caret = pos - q.length + name.length + 2;
  src.setSelectionRange(caret, caret); ac.hidden = true; src.focus();
}
src.addEventListener("input", () => { acSel = 0; acUpdate(); });
src.addEventListener("click", acUpdate);
src.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); return; }
  if (ac.hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); acSel = (acSel + 1) % acItems.length; acUpdate(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); acSel = (acSel - 1 + acItems.length) % acItems.length; acUpdate(); }
  else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); acPick(acSel); }
  else if (e.key === "Escape") { e.stopPropagation(); ac.hidden = true; }
});
ac.addEventListener("mousedown", e => { e.preventDefault(); const t = (e.target as HTMLElement).closest("[data-i]") as HTMLElement | null; if (t) acPick(+t.dataset.i!); });

// ---------- search ----------
let st: number | undefined;
$<HTMLInputElement>("q").addEventListener("input", e => {
  const q = (e.target as HTMLInputElement).value.trim(); clearTimeout(st); hover = null; tipEl.style.display = "none";
  if (!q) { matches = null; $("results").innerHTML = ""; return; }
  st = window.setTimeout(async () => {
    const hits = await backend.search(q); matches = new Set(hits.map(h => h.id));
    $("results").innerHTML = hits.map(h => `<div class="hit" data-id="${esc(h.id)}"><b>${esc(h.title)}</b><small>${esc(h.snippet)}</small></div>`).join("");
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
// desktop app: the main process watches the vault and pushes changes; polling stays as a slow safety net
if (backend.onChange) { backend.onChange(() => refresh()); setInterval(() => refresh(), 15000); } else setInterval(() => refresh(), 4000);
backend.onFocusCapture?.(() => $("cap").focus());

// ---------- settings ----------
const desktop = !!backend.setupClaude; document.documentElement.classList.toggle("desktop", desktop);
async function openSettings() {
  const s = await backend.settings(); $("settings").hidden = false; renderHealth();
  $("svault").textContent = s.vault; $("ssnippet").textContent = s.snippet; $("scfg").textContent = $("scfg2").textContent = s.claudeConfig;
  $("shot").textContent = s.hotkey ? `Quick capture from anywhere: ${s.hotkey.replace("CommandOrControl", navigator.platform.startsWith("Mac") ? "Cmd" : "Ctrl")}` : "";
}
$("gear").onclick = () => $("settings").hidden ? openSettings() : ($("settings").hidden = true);
$("sclose").onclick = () => { $("settings").hidden = true; };
$("scopy").onclick = async () => { try { await navigator.clipboard.writeText($("ssnippet").textContent || ""); $("scopy").textContent = "Copied"; } catch { $("scopy").textContent = "Select and copy manually"; } };
$("sclaude").onclick = async () => {
  try { const r = await backend.setupClaude!(); $("sclaudest").textContent = r.changed ? "Done. Restart Claude Desktop." + (r.backup ? " (old config backed up)" : "") : "Already connected."; }
  catch (e) { $("sclaudest").textContent = "Failed: " + (e as Error).message; }
};
$("schange").onclick = async () => { const v = await backend.changeVault!(); if (v) { sig = ""; await refresh(true); openSettings(); } };
$("sopen").onclick = () => backend.openVault!();
(window as any).__orrery = { get bodies() { return bodies; }, get fps() { return fps; }, get reduced() { return reduced; }, get theme() { return themeKey; }, get view() { return view; } };

// ---------- toast ----------
const toastEl = Object.assign(document.createElement("div"), { id: "toast" }); document.body.appendChild(toastEl);
let toastT: number | undefined;
function toast(msg: string) { toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toastT); toastT = window.setTimeout(() => toastEl.classList.remove("on"), 2200); }

// ---------- view switcher + list view ----------
$("views").innerHTML = VIEWS.map(v => `<button data-v="${v.v}" title="${v.name} view (V)">${v.icon}<span>${v.name}</span></button>`).join("");
$("views").onclick = e => { const t = (e.target as HTMLElement).closest("[data-v]") as HTMLElement | null; if (t) setView(t.dataset.v as View); };
function setView(v: View) {
  view = v; store.set("orrery.view", v); $("listview").hidden = v !== "list"; document.documentElement.dataset.view = v;
  document.querySelectorAll<HTMLElement>("#views [data-v]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  if (v === "list") { renderList(); $<HTMLInputElement>("lvq").focus(); return; }
  if (v !== flat) { flat = v; tiltUser = 0;
    const fit = v === "orbit" ? 1 : Math.min(1.2, (W - 200) / 1400, (H - 140) / (v === "timeline" ? tl.lanes.length * 56 + 120 : 1000));
    flyTo(0, v === "timeline" ? -10 : 0, Math.max(0.35, fit)); }
}
const cycleView = () => setView(VIEWS[(VIEWS.findIndex(x => x.v === view) + 1) % VIEWS.length].v);
let lvFolder = "";
function renderList() {
  if (view !== "list") return;
  const r = listHTML(bodies, $<HTMLInputElement>("lvq").value, $<HTMLSelectElement>("lvsort").value, lvFolder, b => rgba((b as Body).col, 1), pinned);
  $("lvchips").innerHTML = r.chips; $("lvitems").innerHTML = r.items;
}
$("lvq").addEventListener("input", renderList); $("lvsort").addEventListener("change", renderList);
$("lvchips").addEventListener("click", e => { const t = (e.target as HTMLElement).closest("[data-f]") as HTMLElement | null; if (t) { lvFolder = t.dataset.f!; renderList(); } });
$("lvitems").addEventListener("click", e => { const t = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null; if (t) openNote(t.dataset.id!, false); });
$("lvclose").onclick = () => setView(flat);

// ---------- filters: tiers, folder, last 7 days ----------
var hiddenTiers = new Set<string>(), folderOnly = "", recentOnly = false;
$("legend").addEventListener("click", e => {
  const t = (e.target as HTMLElement).closest("button") as HTMLElement | null; if (!t) return;
  if (t.id === "recent") { recentOnly = !recentOnly; t.setAttribute("aria-pressed", String(recentOnly)); return; }
  const k = t.dataset.tier!; hiddenTiers.has(k) ? hiddenTiers.delete(k) : hiddenTiers.add(k); t.classList.toggle("off", hiddenTiers.has(k));
});
function setFolder(f: string) { folderOnly = f; $("folderchip").hidden = !f; $("folderchip").textContent = f ? `only ${f} ×` : ""; }
$("folderchip").onclick = () => setFolder("");

// ---------- pins ----------
var pinned = new Set<string>((() => { try { return JSON.parse(store.get("orrery.pins") || "[]"); } catch { return []; } })());
function syncPin() { const on = !!selected && pinned.has(selected); $("pin").textContent = on ? "★ Pinned" : "☆ Pin"; $("pin").setAttribute("aria-pressed", String(on)); }
$("pin").onclick = () => { if (!selected) return; pinned.has(selected) ? pinned.delete(selected) : pinned.add(selected); store.set("orrery.pins", JSON.stringify([...pinned])); const b = byId.get(selected); if (b) b.tw = undefined; syncPin(); renderList(); };

// ---------- reader controls, TOC, link previews ----------
let prefs = loadPrefs(k => store.get(k)); applyPrefs(prefs);
function setPrefs(p: Partial<typeof prefs>) { prefs = { ...prefs, ...p }; store.set("orrery.reader", JSON.stringify(prefs)); applyPrefs(prefs); syncReader(); }
function syncReader() { $("rfont").textContent = prefs.serif ? "Sans" : "Serif"; $("rwide").textContent = ["Wide", "Full", "Narrow"][prefs.wide]; $("rfocus").setAttribute("aria-pressed", String(prefs.focus)); }
$("rsm").onclick = () => setPrefs({ size: Math.max(12, prefs.size - 1) }); $("rlg").onclick = () => setPrefs({ size: Math.min(24, prefs.size + 1) });
$("rfont").onclick = () => setPrefs({ serif: !prefs.serif }); $("rwide").onclick = () => setPrefs({ wide: (prefs.wide + 1) % 3 }); $("rfocus").onclick = () => setPrefs({ focus: !prefs.focus });
syncReader();
$("ptoc").addEventListener("click", e => { const a = (e.target as HTMLElement).closest("[data-h]") as HTMLElement | null; if (a) document.getElementById(a.dataset.h!)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); });
const previewCache = new Map<string, NoteData>();
$("panel").addEventListener("mouseover", async e => {
  const t = (e.target as HTMLElement).closest(".wl") as HTMLElement | null; if (!t) return;
  const id = resolveLink(t.dataset.id!); if (!id) return;
  const n = previewCache.get(id) ?? await backend.note(id).then(n => (previewCache.set(id, n), n)).catch(() => null); if (!n || !t.matches(":hover")) return;
  const lines = n.body.split("\n").map(l => l.replace(/^[#>\-*\s]+|\[\[|\]\]|\*\*/g, "").trim()).filter(Boolean).slice(0, 3);
  const r = t.getBoundingClientRect(); tipEl.style.display = "block"; tipEl.style.left = Math.max(8, Math.min(r.left, W - 300)) + "px"; tipEl.style.top = r.bottom + 6 + "px";
  tipEl.innerHTML = `<b>${esc(n.title)}</b><br><span style="color:var(--dim)">${lines.map(esc).join("<br>")}</span>`;
});
$("panel").addEventListener("mouseout", e => { if ((e.target as HTMLElement).closest(".wl")) tipEl.style.display = "none"; });
setInterval(() => previewCache.clear(), 60000);

// ---------- new note ----------
function newNote() { $("newnote").hidden = false; const i = $<HTMLInputElement>("nnq"); i.value = folderOnly ? folderOnly + "/" : ""; i.focus(); }
$("newnote").addEventListener("submit", async e => {
  e.preventDefault(); const i = $<HTMLInputElement>("nnq"); const name = i.value.trim(); if (!name) return;
  try { const r = await backend.create(name); $("newnote").hidden = true; sig = ""; await refresh(); await openNote(r.id); setEditing(true); src.setSelectionRange(src.value.length, src.value.length); toast("Note created"); }
  catch (err) { toast((err as Error).message); }
});
$("nnq").addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); $("newnote").hidden = true; } });

// ---------- random note, tour, zen, picture ----------
function randomNote() { const v = bodies.filter(b => b.visible && b.id !== selected); if (v.length) openNote(v[Math.floor(Math.random() * v.length)].id); }
let tourT: number | undefined;
function toggleTour() {
  if (tourT) { clearInterval(tourT); tourT = undefined; toast("Tour stopped"); return; }
  // weighted toward well-connected notes, never the same twice in a row
  const step = () => { const v = bodies.filter(b => b.visible && b.id !== selected); const w = v.map(b => 1 + b.deg); let r = Math.random() * w.reduce((a, x) => a + x, 0);
    const pickB = v.find((_, i) => (r -= w[i]) <= 0) ?? v[0]; if (pickB) openNote(pickB.id); };
  step(); tourT = window.setInterval(step, 5000); toast("Tour: a new note every 5 s · P to stop");
}
function toggleZen() { const z = document.documentElement.classList.toggle("zen"); toast(z ? "Zen mode · Z to leave" : "Zen mode off"); }
function exportPng() { const a = document.createElement("a"); a.download = `orrery-${new Date().toISOString().slice(0, 10)}.png`; a.href = cv.toDataURL("image/png"); a.click(); toast("Picture saved"); }
function go(d: number) { const j = hi + d; if (j < 0 || j >= history.length) return; hi = j; openNote(history[j]); }
function setFx(v: boolean) { fxOn = v; store.set("orrery.fx", v ? "on" : "off"); toast(v ? "Textures on" : "Textures off"); }
function setDof(v: boolean) { dof = v; store.set("orrery.dof", v ? "on" : "off"); toast(v ? "Depth of field on" : "Depth of field off"); }

// ---------- command palette (Ctrl+K) ----------
const pal = createPalette(() => {
  const c: Cmd[] = [
    ...VIEWS.map(v => ({ group: "View", label: `${v.name} view`, hint: v.icon, run: () => setView(v.v) })),
    ...THEME_ORDER.map(k => ({ group: "Theme", label: THEMES[k].name, run: () => setTheme(k) })),
    { group: "Action", label: "New note…", hint: "N", run: newNote },
    { group: "Action", label: "Random note", hint: "R", run: randomNote },
    { group: "Action", label: tourT ? "Stop the tour" : "Take a tour", hint: "P", run: toggleTour },
    { group: "Action", label: "Replay the vault growing", hint: "L", run: togglePlay },
    { group: "Action", label: "Save a picture of the sky (PNG)", run: exportPng },
    { group: "Action", label: "Back", hint: "[", run: () => go(-1) }, { group: "Action", label: "Forward", hint: "]", run: () => go(1) },
    { group: "Camera", label: "Reset view", hint: "0", run: resetView },
    { group: "Camera", label: follow ? "Stop following the open note" : "Follow the open note", hint: "F", run: () => { follow = !follow; } },
    { group: "Display", label: `${fxOn ? "Turn off" : "Turn on"} planet textures`, hint: "X", run: () => setFx(!fxOn) },
    { group: "Display", label: `${dof ? "Turn off" : "Turn on"} depth of field`, hint: "D", run: () => setDof(!dof) },
    { group: "Display", label: `${reduced ? "Turn on" : "Turn off"} motion`, hint: "M", run: () => setReduced(!reduced) },
    { group: "Display", label: "Zen mode (hide the interface)", hint: "Z", run: toggleZen },
    { group: "Display", label: recentOnly ? "Show all notes" : "Highlight the last 7 days", run: () => $("recent").click() },
    { group: "Reader", label: "Bigger text", run: () => setPrefs({ size: Math.min(24, prefs.size + 1) }) },
    { group: "Reader", label: "Smaller text", run: () => setPrefs({ size: Math.max(12, prefs.size - 1) }) },
    { group: "Reader", label: prefs.serif ? "Sans-serif font" : "Serif font", run: () => setPrefs({ serif: !prefs.serif }) },
    { group: "Reader", label: "Change panel width", hint: "W", run: () => setPrefs({ wide: (prefs.wide + 1) % 3 }) },
    { group: "Reader", label: prefs.focus ? "Leave focus reading" : "Focus reading (dim the sky)", run: () => setPrefs({ focus: !prefs.focus }) },
    { group: "App", label: "Settings & memory health", run: openSettings },
    { group: "App", label: "Keyboard shortcuts", hint: "?", run: () => { $("keys").hidden = false; } },
    ...(folderOnly ? [{ group: "Filter", label: "Show all folders", run: () => setFolder("") }] : []),
    ...[...new Set(bodies.map(b => b.folder).filter(Boolean))].sort().map(f => ({ group: "Filter", label: `Only folder: ${f}`, run: () => setFolder(f) })),
  ];
  const notes = [...bodies].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || b.mtime - a.mtime)
    .map(b => ({ group: "Note", label: (pinned.has(b.id) ? "★ " : "") + b.title, hint: b.folder, run: () => openNote(b.id) }));
  return [...c, ...notes];
});
$("palbtn").onclick = () => pal.open();

// ---------- extra keys ----------
addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.isOpen ? pal.close() : pal.open(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); newNote(); return; }
  if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); go(-1); return; } if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); go(1); return; }
  if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "v") cycleView(); else if (k === "r") randomNote(); else if (k === "p") toggleTour(); else if (k === "z") toggleZen();
  else if (k === "w") setPrefs({ wide: (prefs.wide + 1) % 3 }); else if (k === "f") { follow = !follow; toast(follow ? "Following the open note" : "Camera free"); }
  else if (k === "x") setFx(!fxOn); else if (k === "d") setDof(!dof); else if (k === "n") newNote();
  else if (k === "[") go(-1); else if (k === "]") go(1);
  else if (e.key === "Escape" && tourT) toggleTour();
});
setView(view);

// ---------- memory health (settings) ----------
async function renderHealth() {
  try {
    const h = await backend.health(); const chip = (id: string) => `<span class="wl" data-id="${esc(id)}">${esc(byId.get(id)?.title ?? id)}</span>`;
    $("shealth").innerHTML = `<div class="stats"><div><b>${h.notes}</b>notes</div><div><b>${h.links}</b>links</div><div><b>${h.words.toLocaleString()}</b>words</div><div><b>${h.thisWeek}</b>edited this week</div></div>`
      + (h.hubs.length ? `<p class="dim">Most connected: ${h.hubs.map(x => `${chip(x.id)} (${x.n})`).join(" · ")}</p>` : "")
      + `<p class="dim">${h.orphans.length ? `Orphans, not linked to anything (${h.orphans.length}): ${h.orphans.slice(0, 12).map(chip).join(" · ")}` : "No orphan notes. Everything is connected."}</p>`
      + (h.unresolved.length ? `<p class="dim">Broken links (${h.unresolved.length}): ${h.unresolved.slice(0, 8).map(u => `${esc(u.to)} <small>in ${chip(u.from)}</small>`).join(" · ")}</p>` : "")
      + (h.contradictions.length ? `<p class="dim">Possible contradictions: ${h.contradictions.map(c => `<b>${esc(c.key)}</b>: ${c.values.map(esc).join(" vs ")}`).join(" · ")}</p>` : `<p class="dim">No contradictions found.</p>`);
  } catch (e) { $("shealth").textContent = "Couldn't compute health: " + (e as Error).message; }
}
$("shealth").addEventListener("click", e => { const t = (e.target as HTMLElement).closest(".wl") as HTMLElement | null; if (t) { $("settings").hidden = true; openNote(t.dataset.id!); } });
