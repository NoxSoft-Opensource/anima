import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export type MemoryBrowserKind = "episodic" | "semantic" | "procedural";

export type MemoryBrowserEntry = {
  id: string;
  name: string;
  path: string;
  updatedAt: number | null;
  excerpt: string;
  content: string;
};

function resolveKindDirectories(kind: MemoryBrowserKind, stateDir: string): string[] {
  if (kind === "episodic") {
    return [path.join(stateDir, "memory", "episodic"), path.join(stateDir, "memory", "episodes")];
  }
  return [path.join(stateDir, "memory", kind)];
}

function extractExcerpt(content: string, query?: string): string {
  const normalized = content.replace(/\r/g, "");
  const trimmed = normalized.trim();
  if (!trimmed) {
    return "";
  }
  if (query) {
    const lower = normalized.toLowerCase();
    const matchIndex = lower.indexOf(query.toLowerCase());
    if (matchIndex >= 0) {
      const start = Math.max(0, matchIndex - 120);
      const end = Math.min(normalized.length, matchIndex + query.length + 180);
      return normalized.slice(start, end).replace(/\s+/g, " ").trim();
    }
  }
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const first = lines[0] ?? trimmed.slice(0, 220);
  return first.replace(/\s+/g, " ").slice(0, 220);
}

async function walkFiles(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const stack = entries.map((entry) => ({ parent: root, entry }));
  const files: string[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const absolutePath = path.join(current.parent, current.entry.name);
    if (current.entry.isDirectory()) {
      const children = await fs.readdir(absolutePath, { withFileTypes: true }).catch(() => []);
      for (const child of children) {
        stack.push({ parent: absolutePath, entry: child });
      }
      continue;
    }
    if (!current.entry.isFile()) {
      continue;
    }
    if (!/\.(md|txt|json)$/i.test(current.entry.name)) {
      continue;
    }
    files.push(absolutePath);
  }
  return files;
}

export async function listMemoryEntries(params: {
  kind: MemoryBrowserKind;
  query?: string;
  limit?: number;
  stateDir?: string;
}): Promise<MemoryBrowserEntry[]> {
  const stateDir = params.stateDir ?? resolveStateDir();
  const query = params.query?.trim();
  const files = (
    await Promise.all(resolveKindDirectories(params.kind, stateDir).map((dir) => walkFiles(dir)))
  ).flat();

  const rows = await Promise.all(
    files.map(async (filePath) => {
      const content = await fs.readFile(filePath, "utf8").catch(() => "");
      if (!content.trim()) {
        return null;
      }
      if (query && !content.toLowerCase().includes(query.toLowerCase())) {
        return null;
      }
      const stat = await fs.stat(filePath).catch(() => null);
      return {
        id: filePath,
        name: path.basename(filePath),
        path: filePath,
        updatedAt: stat?.mtimeMs ?? null,
        excerpt: extractExcerpt(content, query),
        content,
      } satisfies MemoryBrowserEntry;
    }),
  );

  return rows
    .filter((row): row is MemoryBrowserEntry => Boolean(row))
    .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, Math.max(1, Math.min(params.limit ?? 120, 200)));
}
