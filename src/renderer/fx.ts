// Procedural textures, all drawn once into small offscreen canvases and cached: no image files, no per-frame gradients.
export type RGB = number[];

const rand = (seed: number) => { let s = (seed * 4294967295) >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507); s = Math.imul(s ^ (s >>> 13), 3266489909); return ((s ^= s >>> 16) >>> 0) / 4294967296; }; };
const mk = (w: number, h = w) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")!] as const; };
const css = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const texCache = new Map<string, HTMLCanvasElement>();
/** A lit sphere: gas bands (planets/core) or craters (moons/asteroids). Light comes from local -x; rotate it toward the sun when drawing. */
export function planetTexture(col: RGB, seed: number, kind: "gas" | "rock", light: boolean): HTMLCanvasElement {
  const v = Math.floor(seed * 6), key = `${col.join(",")}|${v}|${kind}|${light}`;
  let c = texCache.get(key); if (c) return c;
  const S = 64, R = 31; const [cv, g] = mk(S); const rnd = rand(v / 6 + 0.01);
  g.save(); g.beginPath(); g.arc(32, 32, R, 0, 7); g.clip();
  g.fillStyle = css(col, 1); g.fillRect(0, 0, S, S);
  if (kind === "gas") {
    const f1 = 0.18 + rnd() * 0.2, f2 = 0.5 + rnd() * 0.4, p1 = rnd() * 6, p2 = rnd() * 6, tilt = (rnd() - 0.5) * 0.5;
    g.translate(32, 32); g.rotate(tilt); g.translate(-32, -32);
    for (let y = -8; y < S + 8; y++) {
      const b = Math.sin(y * f1 + p1) * 0.6 + Math.sin(y * f2 + p2) * 0.35;
      g.fillStyle = b > 0 ? `rgba(255,255,255,${b * 0.22})` : `rgba(0,0,0,${-b * 0.28})`; g.fillRect(-8, y, S + 16, 1);
    }
    if (rnd() > 0.4) { g.fillStyle = `rgba(255,255,255,.22)`; g.beginPath(); g.ellipse(20 + rnd() * 24, 22 + rnd() * 20, 6, 3, 0, 0, 7); g.fill(); }
  } else {
    for (let i = 0; i < 9; i++) {
      const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 7;
      g.fillStyle = "rgba(0,0,0,.22)"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1; g.beginPath(); g.arc(x - 0.6, y - 0.6, r, 3.4, 5.6); g.stroke();
    }
  }
  g.restore();
  // terminator: bright limb toward the light, night side fading into shadow
  const sh = g.createRadialGradient(18, 32, 2, 26, 32, R * 1.55);
  sh.addColorStop(0, `rgba(255,255,255,${light ? 0.32 : 0.22})`); sh.addColorStop(0.42, "rgba(0,0,0,0)"); sh.addColorStop(1, `rgba(0,0,0,${light ? 0.82 : 0.45})`);
  g.fillStyle = sh; g.beginPath(); g.arc(32, 32, R, 0, 7); g.fill();
  g.strokeStyle = css(col.map(x => Math.min(255, x + 90)), 0.55); g.lineWidth = 1.5; g.beginPath(); g.arc(32, 32, R - 0.5, 2.2, 4.1); g.stroke();
  texCache.set(key, cv); return cv;
}
export const clearTextures = () => texCache.clear();

/** Soft fractal-noise nebula tinted with the theme's two nebula colours (256px, drawn scaled up). */
export function nebulaTexture(a: string, b: string, seed = 0.37): HTMLCanvasElement {
  const N = 128, [cv, g] = mk(N); const img = g.createImageData(N, N); const rnd = rand(seed);
  const grid = (n: number) => Array.from({ length: (n + 1) * (n + 1) }, rnd);
  const octs = [4, 8, 16, 32].map(n => ({ n, v: grid(n) }));
  const parse = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
  const ca = parse(a), cb = parse(b);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, amp = 0.55;
    for (const o of octs) {
      const fx = x / N * o.n, fy = y / N * o.n, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, w = o.n + 1;
      const s = (tx * tx * (3 - 2 * tx)), t = (ty * ty * (3 - 2 * ty));
      const q = o.v[iy * w + ix] * (1 - s) + o.v[iy * w + ix + 1] * s, r = o.v[(iy + 1) * w + ix] * (1 - s) + o.v[(iy + 1) * w + ix + 1] * s;
      v += (q * (1 - t) + r * t) * amp; amp *= 0.5;
    }
    const dx = x / N - 0.5, dy = y / N - 0.5, fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.1);
    const m = Math.max(0, v - 0.42) * 2.4 * fall, k = Math.min(1, Math.max(0, (v - 0.3) * 1.6));
    const i = (y * N + x) * 4;
    img.data[i] = ca[0] * k + cb[0] * (1 - k); img.data[i + 1] = ca[1] * k + cb[1] * (1 - k); img.data[i + 2] = ca[2] * k + cb[2] * (1 - k);
    img.data[i + 3] = Math.min(255, m * 255 * ((ca[3] ?? 0.2) + 0.25));
  }
  g.putImageData(img, 0, 0); return cv;
}

/** Copy of the current canvas, used to cross-fade between themes. */
export function snapshot(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, g] = mk(src.width, src.height); g.drawImage(src, 0, 0); return c;
}
