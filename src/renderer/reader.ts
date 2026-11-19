// Note reading: a small markdown renderer, table of contents and the reader preferences (size, font, width, focus).
export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const inline = (t: string) => t
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>").replace(/~~([^~]+)~~/g, "<s>$1</s>")
  .replace(/==([^=]+)==/g, "<mark>$1</mark>")
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, `<span class="ext" title="$2">$1</span>`)
  .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, id, al) => `<span class="wl" data-id="${id.trim()}">${al || id.split("/").pop()}</span>`)
  .replace(/(^|\s)#([\p{L}\d_/-]+)/gu, `$1<span class="tag">#$2</span>`);

/** Markdown subset: headings (with ids for the TOC), lists, tasks, quotes, code blocks, rules, inline styles, wikilinks. */
export function md(src: string): string {
  const lines = esc(src).split("\n"); let html = "", list = false, code = false, n = 0;
  const close = () => { if (list) { html += "</ul>"; list = false; } };
  for (const l of lines) {
    if (/^\s*```/.test(l)) { close(); html += code ? "</code></pre>" : "<pre><code>"; code = !code; continue; }
    if (code) { html += l + "\n"; continue; }
    const h = /^(#{1,4})\s+(.*)/.exec(l), task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)/.exec(l), li = /^\s*(?:[-*+]|\d+\.)\s+(.*)/.exec(l);
    if (task || li) { if (!list) { html += "<ul>"; list = true; }
      html += task ? `<li class="task${task[1] === " " ? "" : " done"}">${task[1] === " " ? "☐" : "☑"} ${inline(task[2])}</li>` : `<li>${inline(li![1])}</li>`; continue; }
    close();
    if (h) html += `<h${h[1].length} id="h-${n++}">${inline(h[2])}</h${h[1].length}>`;
    else if (/^\s*(---|\*\*\*)\s*$/.test(l)) html += "<hr>";
    else if (/^&gt;\s?/.test(l)) html += `<blockquote>${inline(l.replace(/^&gt;\s?/, ""))}</blockquote>`;
    else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  close(); return html + (code ? "</code></pre>" : "");
}

/** Table of contents from rendered headings; empty when the note is short. */
export function toc(html: string): string {
  const hs = [...html.matchAll(/<h([1-4]) id="(h-\d+)">(.*?)<\/h\1>/g)];
  if (hs.length < 3) return "";
  return `<nav class="toc"><b>Contents</b>${hs.map(m => `<a data-h="${m[2]}" style="padding-left:${(+m[1] - 1) * 10}px">${m[3].replace(/<[^>]+>/g, "")}</a>`).join("")}</nav>`;
}

export const readingStats = (body: string) => { const w = body.match(/\S+/g)?.length || 0; return `${w} words · ${Math.max(1, Math.round(w / 220))} min read`; };

export interface ReaderPrefs { size: number; serif: boolean; wide: number; focus: boolean }
export function loadPrefs(get: (k: string) => string | null): ReaderPrefs {
  try { return { size: 15, serif: false, wide: 0, focus: false, ...JSON.parse(get("orrery.reader") || "{}") }; } catch { return { size: 15, serif: false, wide: 0, focus: false }; }
}
/** Pushes the preferences into CSS variables/classes; the stylesheet does the rest. */
export function applyPrefs(p: ReaderPrefs) {
  const root = document.documentElement;
  root.style.setProperty("--read-size", p.size + "px");
  root.classList.toggle("serif", p.serif); root.classList.toggle("focus-read", p.focus);
  root.dataset.wide = String(p.wide);
}
