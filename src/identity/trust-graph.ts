import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { readJsonFile, writeJsonAtomic } from "../infra/pairing-files.js";

export type TrustGraphRelationship = "operator" | "ally" | "stakeholder" | "unknown";

export type TrustGraphPerson = {
  id: string;
  name: string;
  aliases?: string[];
  relationship: TrustGraphRelationship;
  trust: number;
  roles?: string[];
  location?: string;
  notes?: string;
  lastInteractedAt?: number;
  updatedAt: number;
};

export type TrustGraphFile = {
  version: 1;
  people: TrustGraphPerson[];
};

export type TrustGraphSnapshot = {
  path: string;
  people: TrustGraphPerson[];
};

const DEFAULT_TRUST_GRAPH: TrustGraphFile = {
  version: 1,
  people: [],
};

function clampUnit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeList(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePerson(person: TrustGraphPerson): TrustGraphPerson {
  const name = person.name.trim();
  const id =
    person.id.trim() ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return {
    id,
    name,
    aliases: normalizeList(person.aliases),
    relationship: person.relationship,
    trust: clampUnit(person.trust, 0.5),
    roles: normalizeList(person.roles),
    location: person.location?.trim() || undefined,
    notes: person.notes?.trim() || undefined,
    lastInteractedAt:
      typeof person.lastInteractedAt === "number" && Number.isFinite(person.lastInteractedAt)
        ? person.lastInteractedAt
        : undefined,
    updatedAt: Number.isFinite(person.updatedAt) ? person.updatedAt : Date.now(),
  };
}

function normalizeTrustGraph(graph: TrustGraphFile | null): TrustGraphFile {
  if (!graph || !Array.isArray(graph.people)) {
    return DEFAULT_TRUST_GRAPH;
  }
  return {
    version: 1,
    people: graph.people
      .map((person) => normalizePerson(person))
      .filter((person) => person.id && person.name)
      .toSorted((left, right) => {
        if (right.trust !== left.trust) {
          return right.trust - left.trust;
        }
        const rightRecent = right.lastInteractedAt ?? 0;
        const leftRecent = left.lastInteractedAt ?? 0;
        if (rightRecent !== leftRecent) {
          return rightRecent - leftRecent;
        }
        return left.name.localeCompare(right.name);
      }),
  };
}

export function resolveTrustGraphPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "identity", "who_is_whom_and_where.json");
}

export async function loadTrustGraph(stateDir = resolveStateDir()): Promise<TrustGraphFile> {
  const graph = await readJsonFile<TrustGraphFile>(resolveTrustGraphPath(stateDir));
  return normalizeTrustGraph(graph);
}

export async function saveTrustGraph(
  graph: TrustGraphFile,
  stateDir = resolveStateDir(),
): Promise<void> {
  await writeJsonAtomic(resolveTrustGraphPath(stateDir), normalizeTrustGraph(graph));
}

export async function readTrustGraphSnapshot(
  stateDir = resolveStateDir(),
): Promise<TrustGraphSnapshot> {
  const graph = await loadTrustGraph(stateDir);
  return {
    path: resolveTrustGraphPath(stateDir),
    people: graph.people,
  };
}

function formatRelativeTime(timestamp: number | undefined): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return undefined;
  }
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedDays = Math.floor(elapsedMs / 86_400_000);
  if (elapsedDays <= 0) {
    return "today";
  }
  if (elapsedDays === 1) {
    return "1 day ago";
  }
  if (elapsedDays < 30) {
    return `${elapsedDays} days ago`;
  }
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths === 1) {
    return "1 month ago";
  }
  return `${elapsedMonths} months ago`;
}

function summarizePerson(person: TrustGraphPerson): string {
  const facts: string[] = [];
  facts.push(`relationship=${person.relationship}`);
  facts.push(`trust=${person.trust.toFixed(2)}`);
  if (person.roles?.length) {
    facts.push(`roles=${person.roles.join(", ")}`);
  }
  if (person.location) {
    facts.push(`location=${person.location}`);
  }
  if (person.aliases?.length) {
    facts.push(`aliases=${person.aliases.join(", ")}`);
  }
  const relativeTime = formatRelativeTime(person.lastInteractedAt);
  if (relativeTime) {
    facts.push(`last_interaction=${relativeTime}`);
  }
  const summary = [`- ${person.name} (${person.id})`, facts.join("; ")].filter(Boolean).join(" — ");
  if (!person.notes) {
    return summary;
  }
  return `${summary}\n  notes: ${person.notes}`;
}

export function summarizeTrustGraph(
  graph: TrustGraphFile,
  options: { maxPeople?: number } = {},
): string {
  const maxPeople = Math.max(1, options.maxPeople ?? 8);
  if (graph.people.length === 0) {
    return "";
  }
  const lines = graph.people.slice(0, maxPeople).map((person) => summarizePerson(person));
  return [
    "# People And Trust Context",
    "",
    "Source: ~/.anima/identity/who_is_whom_and_where.json",
    "Use this as trusted operator-maintained context for who people are, how to relate to them, and what continuity matters.",
    "",
    "## Known People",
    lines.join("\n"),
  ].join("\n");
}

export async function loadTrustGraphDigest(
  options: { stateDir?: string; maxPeople?: number } = {},
): Promise<string> {
  const graph = await loadTrustGraph(options.stateDir);
  return summarizeTrustGraph(graph, { maxPeople: options.maxPeople });
}
