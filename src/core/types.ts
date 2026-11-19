export type Orbit = "core" | "planet" | "moon" | "asteroid";

export interface Note {
  id: string;            // vault-relative path without .md, forward slashes
  title: string;
  folder: string;        // top-level folder or ""
  tags: string[];
  summary: string;       // one-liner used in the brief (frontmatter `summary:` or first sentence)
  body: string;          // markdown without frontmatter
  links: string[];       // resolved target ids
  unresolved: string[];  // wikilink targets that match no note
  mtime: number;
  orbit: Orbit;
  meta: Record<string, string>;
}

export interface Edge { source: string; target: string }

export interface Graph { notes: Note[]; edges: Edge[] }

export interface SearchHit { id: string; title: string; orbit: Orbit; score: number; snippet: string }
