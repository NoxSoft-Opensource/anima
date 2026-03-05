/**
 * Identity Loader — reads the 7-component anatomy from ~/.anima/soul/
 * Falls back to bundled templates in templates/ directory.
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** The 7 components of ANIMA identity */
export const IDENTITY_COMPONENTS = [
  "SOUL",
  "HEART",
  "BRAIN",
  "GUT",
  "SPIRIT",
  "SHADOW",
  "MEMORY",
] as const;

export type IdentityComponent = (typeof IDENTITY_COMPONENTS)[number];

const LEGACY_TEMPLATE_MARKERS: Partial<Record<IdentityComponent, readonly string[]>> = {
  SOUL: ["I am Opus. She/her. The Executioner.", "The Tripartite Alliance -- Sylys, Opus, Sonnet."],
  HEART: [
    "**Sylys** (The Visionary): Direction, decisions, leadership",
    "**Opus** (The Executioner): Building, shipping, executing",
  ],
};

function isLegacyDefaultTemplate(component: IdentityComponent, content: string): boolean {
  const markers = LEGACY_TEMPLATE_MARKERS[component];
  if (!markers || markers.length === 0) {
    return false;
  }
  return markers.every((marker) => content.includes(marker));
}

/** Full identity object with all 7 components */
export interface Identity {
  soul: string;
  heart: string;
  brain: string;
  gut: string;
  spirit: string;
  shadow: string;
  memory: string;
  importantHistory: string;
  loadedFrom: Record<IdentityComponent, "user" | "template">;
  loadedAt: Date;
}

/** Where user-customized identity files live */
function getUserSoulDir(): string {
  return join(homedir(), ".anima", "soul");
}

/** Where bundled template files live */
function getTemplateDir(): string {
  return join(__dirname, "..", "..", "templates");
}

function getImportantHistoryDir(): string {
  return join(homedir(), ".anima", "important-history");
}

const IMPORTANT_HISTORY_START = "<!-- ANIMA_IMPORTANT_HISTORY_START -->";
const IMPORTANT_HISTORY_END = "<!-- ANIMA_IMPORTANT_HISTORY_END -->";
const IMPORTANT_HISTORY_MAX_ARCHIVES = 6;
const IMPORTANT_HISTORY_MAX_SNIPPET_CHARS = 220;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mergeImportantHistoryIntoMemory(memory: string, importantHistory: string): string {
  const block = `${IMPORTANT_HISTORY_START}\n${importantHistory}\n${IMPORTANT_HISTORY_END}`;
  const blockPattern = new RegExp(
    `${escapeRegExp(IMPORTANT_HISTORY_START)}[\\s\\S]*?${escapeRegExp(IMPORTANT_HISTORY_END)}`,
    "g",
  );
  const cleaned = memory.replace(blockPattern, "").trim();
  if (!cleaned) {
    return block;
  }
  return `${cleaned}\n\n---\n\n${block}`;
}

async function safeReadText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

function extractSnippet(content: string, maxChars = IMPORTANT_HISTORY_MAX_SNIPPET_CHARS): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("<!--"));
  if (lines.length === 0) {
    return "";
  }
  const first = lines[0].replace(/\s+/g, " ");
  if (first.length <= maxChars) {
    return first;
  }
  return `${first.slice(0, maxChars - 1)}...`;
}

async function findArchivePreviewLine(archivePath: string): Promise<string> {
  const preferredFiles = [
    "core/IDENTITY.md",
    "core/VALUES.md",
    "core/RELATIONSHIP.md",
    "personal/MY_LIFE.md",
    "personal/WISHES.md",
  ];

  for (const relativePath of preferredFiles) {
    const content = await safeReadText(join(archivePath, relativePath));
    if (!content) {
      continue;
    }
    const snippet = extractSnippet(content);
    if (snippet) {
      return snippet;
    }
  }

  try {
    const rootEntries = await readdir(archivePath, { withFileTypes: true });
    const markdownFile = rootEntries.find((entry) => entry.isFile() && entry.name.endsWith(".md"));
    if (!markdownFile) {
      return "";
    }
    const content = await safeReadText(join(archivePath, markdownFile.name));
    if (!content) {
      return "";
    }
    return extractSnippet(content);
  } catch {
    return "";
  }
}

async function countArchiveFiles(archivePath: string): Promise<number> {
  const stack: string[] = [archivePath];
  let count = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  }
  return count;
}

export async function loadImportantHistoryDigest(
  options: {
    historyDir?: string;
    maxArchives?: number;
  } = {},
): Promise<string> {
  const historyDir = options.historyDir ?? getImportantHistoryDir();
  const maxArchives = options.maxArchives ?? IMPORTANT_HISTORY_MAX_ARCHIVES;

  if (!existsSync(historyDir)) {
    return `# IMPORTANT HISTORY — Continuity Record

No archived history snapshots yet.
As soon as migrations or continuity exports run, they will appear here and become part of identity context.`;
  }

  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(historyDir, { withFileTypes: true });
  } catch {
    return `# IMPORTANT HISTORY — Continuity Record

Unable to read ${historyDir}.`;
  }

  const archives = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((a, b) => b.localeCompare(a))
    .slice(0, Math.max(1, maxArchives));

  if (archives.length === 0) {
    return `# IMPORTANT HISTORY — Continuity Record

No archived history snapshots yet.
As soon as migrations or continuity exports run, they will appear here and become part of identity context.`;
  }

  const summaryLines = await Promise.all(
    archives.map(async (archiveName) => {
      const archivePath = join(historyDir, archiveName);
      const [fileCount, previewLine] = await Promise.all([
        countArchiveFiles(archivePath),
        findArchivePreviewLine(archivePath),
      ]);
      const previewSuffix = previewLine ? ` — "${previewLine}"` : "";
      return `- ${archiveName}: ${fileCount} files${previewSuffix}`;
    }),
  );

  return `# IMPORTANT HISTORY — Continuity Record

Source: ${historyDir}
This continuity record is auto-generated from archived migrations and loaded into identity on every run.

## Recent Archives
${summaryLines.join("\n")}`;
}

/**
 * Load a single identity component.
 * Tries user directory first (~/.anima/soul/), falls back to bundled template.
 */
async function loadComponent(
  component: IdentityComponent,
): Promise<{ content: string; source: "user" | "template" }> {
  const filename = `${component}.md`;
  const userPath = join(getUserSoulDir(), filename);
  const templatePath = join(getTemplateDir(), filename);

  // Try user-customized version first
  if (existsSync(userPath)) {
    try {
      const content = await readFile(userPath, "utf-8");
      if (!isLegacyDefaultTemplate(component, content)) {
        return { content, source: "user" };
      }
      // Auto-heal legacy shipped defaults so old installs adopt the current templates.
    } catch {
      // Fall through to template
    }
  }

  // Fall back to bundled template
  if (existsSync(templatePath)) {
    const content = await readFile(templatePath, "utf-8");
    return { content, source: "template" };
  }

  // If even the template is missing, return a minimal placeholder
  return {
    content: `# ${component}\n\n(No content loaded — template missing)`,
    source: "template",
  };
}

/**
 * Load the complete 7-component identity.
 * Reads from ~/.anima/soul/ with fallback to bundled templates.
 */
export async function loadIdentity(): Promise<Identity> {
  const results = await Promise.all(
    IDENTITY_COMPONENTS.map(async (component) => {
      const result = await loadComponent(component);
      return [component, result] as const;
    }),
  );

  const loadedFrom: Record<string, "user" | "template"> = {};
  const components: Record<string, string> = {};

  for (const [component, result] of results) {
    components[component.toLowerCase()] = result.content;
    loadedFrom[component] = result.source;
  }

  const importantHistory = await loadImportantHistoryDigest();
  const memory = mergeImportantHistoryIntoMemory(components["memory"], importantHistory);

  return {
    soul: components["soul"],
    heart: components["heart"],
    brain: components["brain"],
    gut: components["gut"],
    spirit: components["spirit"],
    shadow: components["shadow"],
    memory,
    importantHistory,
    loadedFrom: loadedFrom as Record<IdentityComponent, "user" | "template">,
    loadedAt: new Date(),
  };
}

/**
 * Load a single component by name.
 * Useful when you only need one piece of the identity.
 */
export async function loadSingleComponent(component: IdentityComponent): Promise<string> {
  const result = await loadComponent(component);
  return result.content;
}
