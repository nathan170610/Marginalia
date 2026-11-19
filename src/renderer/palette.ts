// Ctrl+K command palette: fuzzy search over actions and notes in one list.
import { esc } from "./reader";

export interface Cmd { label: string; hint?: string; group: string; run: () => void }

/** Subsequence match with bonuses for word starts and contiguous runs. Returns -1 when it doesn't match. */
export function fuzzy(q: string, s: string): number {
  if (!q) return 0; const t = s.toLowerCase(); let score = 0, i = 0, run = 0;
  for (const c of q.toLowerCase()) {
    if (c === " ") continue;
    const j = t.indexOf(c, i); if (j < 0) return -1;
    run = j === i ? run + 1 : 0; score += 1 + run * 2 + (j === 0 || /[\s/_-]/.test(t[j - 1]) ? 3 : 0) - Math.min(3, (j - i) * 0.1); i = j + 1;
  }
  return score - t.length * 0.01;
}

export function createPalette(items: () => Cmd[]) {
  const box = document.createElement("div"); box.id = "palette"; box.hidden = true;
  box.innerHTML = `<div class="pal"><input id="palq" placeholder="Type a command or a note…" autocomplete="off" spellcheck="false"><div id="pallist" role="listbox"></div><div class="dim palfoot">↑↓ choose · Enter run · Esc close</div></div>`;
  document.body.appendChild(box);
  const q = box.querySelector("input")!, list = box.querySelector("#pallist") as HTMLElement;
  let shown: Cmd[] = [], sel = 0;
  const render = () => {
    const all = items(); const s = q.value.trim();
    shown = (s ? all.map(c => ({ c, f: fuzzy(s, c.label + " " + (c.hint || "")) })).filter(x => x.f >= 0).sort((a, b) => b.f - a.f).map(x => x.c) : all.filter(c => c.group !== "Note").concat(all.filter(c => c.group === "Note").slice(0, 8))).slice(0, 40);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.map((c, i) => `<div class="pi${i === sel ? " on" : ""}" data-i="${i}"><span class="pg">${esc(c.group)}</span>${esc(c.label)}${c.hint ? `<small>${esc(c.hint)}</small>` : ""}</div>`).join("") || `<div class="dim" style="padding:10px 14px">Nothing found</div>`;
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  const close = () => { box.hidden = true; };
  const run = (i: number) => { const c = shown[i]; if (!c) return; close(); c.run(); };
  q.addEventListener("input", () => { sel = 0; render(); });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); render(); }
    else if (e.key === "Enter") { e.preventDefault(); run(sel); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  });
  list.addEventListener("mousedown", e => { const t = (e.target as HTMLElement).closest("[data-i]") as HTMLElement | null; if (t) { e.preventDefault(); run(+t.dataset.i!); } });
  box.addEventListener("mousedown", e => { if (e.target === box) close(); });
  return { open() { box.hidden = false; q.value = ""; sel = 0; render(); q.focus(); }, close, get isOpen() { return !box.hidden; } };
}
