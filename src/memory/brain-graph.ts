import {
  isAnimaNodeKind,
  isAnimaRelation,
  type AnimaNodeKind,
  type AnimaRelation,
} from "../anima6/ontology.js";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type BrainSensitivity = "public" | "internal" | "private" | "secret";
export type BrainRecordState = "active" | "candidate" | "archived";

export interface BrainEvidence {
  source: string;
  sourceId?: string;
  excerpt?: string;
  recordedAt?: number;
}

export interface BrainNodeMeta {
  provenance: string[];
  confidence: number;
  salience: number;
  recency: number;
  sensitivity: BrainSensitivity;
  lastReviewedAt?: number;
  state: BrainRecordState;
}

export interface BrainEdgeMeta extends BrainNodeMeta {
  strength: number;
  direction: "forward" | "bidirectional";
}

export interface BrainNode {
  id: string;
  type: AnimaNodeKind;
  label: string;
  aliases: string[];
  properties: Record<string, JsonValue>;
  evidence: BrainEvidence[];
  meta: BrainNodeMeta;
}

export interface BrainEdge {
  id: string;
  source: string;
  target: string;
  relation: AnimaRelation;
  evidence: BrainEvidence[];
  meta: BrainEdgeMeta;
}

export interface BrainGraphSnapshot {
  nodes: BrainNode[];
  edges: BrainEdge[];
}

type BrainNodeInput = Omit<BrainNode, "aliases" | "evidence" | "meta" | "properties"> & {
  aliases?: string[];
  evidence?: BrainEvidence[];
  meta?: Partial<BrainNodeMeta>;
  properties?: Record<string, JsonValue>;
};

type BrainEdgeInput = Omit<BrainEdge, "evidence" | "meta"> & {
  evidence?: BrainEvidence[];
  meta?: Partial<BrainEdgeMeta>;
};

const DEFAULT_NODE_META: BrainNodeMeta = {
  provenance: [],
  confidence: 0.5,
  salience: 0.5,
  recency: 0.5,
  sensitivity: "internal",
  state: "active",
};

const DEFAULT_EDGE_META: BrainEdgeMeta = {
  ...DEFAULT_NODE_META,
  strength: 0.5,
  direction: "forward",
};

function clampUnit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeAliases(label: string, aliases?: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of [label, ...(aliases ?? [])]) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeNodeKind(value: string): AnimaNodeKind {
  const normalized = value.trim().toLowerCase();
  if (!isAnimaNodeKind(normalized)) {
    throw new Error(`invalid brain node kind: ${value}`);
  }
  return normalized;
}

function normalizeRelation(value: string): AnimaRelation {
  const normalized = value.trim().toLowerCase();
  if (!isAnimaRelation(normalized)) {
    throw new Error(`invalid brain edge relation: ${value}`);
  }
  return normalized;
}

function normalizeEvidence(evidence?: BrainEvidence[]): BrainEvidence[] {
  const seen = new Set<string>();
  const normalized: BrainEvidence[] = [];
  for (const item of evidence ?? []) {
    const source = item.source.trim();
    if (!source) {
      continue;
    }
    const key = `${source}:${item.sourceId ?? ""}:${item.excerpt ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      source,
      sourceId: item.sourceId?.trim() || undefined,
      excerpt: item.excerpt?.trim() || undefined,
      recordedAt: item.recordedAt,
    });
  }
  return normalized;
}

function normalizeNodeMeta(meta?: Partial<BrainNodeMeta>): BrainNodeMeta {
  return {
    provenance: Array.from(
      new Set((meta?.provenance ?? []).map((value) => value.trim()).filter(Boolean)),
    ),
    confidence: clampUnit(meta?.confidence, DEFAULT_NODE_META.confidence),
    salience: clampUnit(meta?.salience, DEFAULT_NODE_META.salience),
    recency: clampUnit(meta?.recency, DEFAULT_NODE_META.recency),
    sensitivity: meta?.sensitivity ?? DEFAULT_NODE_META.sensitivity,
    lastReviewedAt: meta?.lastReviewedAt,
    state: meta?.state ?? DEFAULT_NODE_META.state,
  };
}

function normalizeEdgeMeta(meta?: Partial<BrainEdgeMeta>): BrainEdgeMeta {
  const base = normalizeNodeMeta(meta);
  return {
    ...base,
    strength: clampUnit(meta?.strength, DEFAULT_EDGE_META.strength),
    direction: meta?.direction ?? DEFAULT_EDGE_META.direction,
  };
}

function mergeUnique<T>(left: T[], right: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...left, ...right]) {
    const identity = key(item);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    merged.push(item);
  }
  return merged;
}

export class BrainGraph {
  private nodes = new Map<string, BrainNode>();
  private edges = new Map<string, BrainEdge>();
  private aliases = new Map<string, string>();

  public addNode(node: BrainNodeInput): BrainNode {
    const existing = this.nodes.get(node.id);
    const next: BrainNode = {
      id: node.id,
      type: normalizeNodeKind(node.type),
      label: node.label.trim(),
      aliases: normalizeAliases(node.label, [
        ...(existing?.aliases ?? []),
        ...(node.aliases ?? []),
      ]).filter((alias) => alias.toLowerCase() !== node.label.trim().toLowerCase()),
      properties: {
        ...existing?.properties,
        ...node.properties,
      },
      evidence: mergeUnique(
        existing?.evidence ?? [],
        normalizeEvidence(node.evidence),
        (item) => `${item.source}:${item.sourceId ?? ""}:${item.excerpt ?? ""}`,
      ),
      meta: normalizeNodeMeta({
        ...existing?.meta,
        ...node.meta,
        provenance: [...(existing?.meta.provenance ?? []), ...(node.meta?.provenance ?? [])],
      }),
    };
    this.nodes.set(next.id, next);
    this.rebuildAliasesForNode(next);
    return next;
  }

  public addEdge(edge: BrainEdgeInput): BrainEdge {
    const existing = this.edges.get(edge.id);
    const next: BrainEdge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: normalizeRelation(edge.relation),
      evidence: mergeUnique(
        existing?.evidence ?? [],
        normalizeEvidence(edge.evidence),
        (item) => `${item.source}:${item.sourceId ?? ""}:${item.excerpt ?? ""}`,
      ),
      meta: normalizeEdgeMeta({
        ...existing?.meta,
        ...edge.meta,
        provenance: [...(existing?.meta.provenance ?? []), ...(edge.meta?.provenance ?? [])],
      }),
    };
    this.edges.set(next.id, next);
    return next;
  }

  public getNode(idOrAlias: string): BrainNode | undefined {
    const trimmed = idOrAlias.trim();
    if (!trimmed) {
      return undefined;
    }
    const id = this.aliases.get(trimmed.toLowerCase()) ?? trimmed;
    return this.nodes.get(id);
  }

  public getEdge(id: string): BrainEdge | undefined {
    return this.edges.get(id);
  }

  public getEdges(nodeId: string): BrainEdge[] {
    return [...this.edges.values()].filter(
      (edge) => edge.source === nodeId || edge.target === nodeId,
    );
  }

  public listNodes(): BrainNode[] {
    return [...this.nodes.values()];
  }

  public listEdges(): BrainEdge[] {
    return [...this.edges.values()];
  }

  public listNodesByType(type: AnimaNodeKind): BrainNode[] {
    return this.listNodes().filter((node) => node.type === type);
  }

  public getNeighbors(nodeId: string, relation?: AnimaRelation): BrainNode[] {
    const ids = new Set<string>();
    for (const edge of this.getEdges(nodeId)) {
      if (relation && edge.relation !== relation) {
        continue;
      }
      ids.add(edge.source === nodeId ? edge.target : edge.source);
    }
    return [...ids]
      .map((id) => this.nodes.get(id))
      .filter((node): node is BrainNode => Boolean(node));
  }

  public addEvidenceToNode(id: string, evidence: BrainEvidence): void {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }
    node.evidence = mergeUnique(node.evidence, normalizeEvidence([evidence]), (item) => {
      return `${item.source}:${item.sourceId ?? ""}:${item.excerpt ?? ""}`;
    });
  }

  public addEvidenceToEdge(id: string, evidence: BrainEvidence): void {
    const edge = this.edges.get(id);
    if (!edge) {
      return;
    }
    edge.evidence = mergeUnique(edge.evidence, normalizeEvidence([evidence]), (item) => {
      return `${item.source}:${item.sourceId ?? ""}:${item.excerpt ?? ""}`;
    });
  }

  public touchNodeReview(id: string, reviewedAt = Date.now()): void {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }
    node.meta.lastReviewedAt = reviewedAt;
  }

  public toJSON(): BrainGraphSnapshot {
    return {
      nodes: this.listNodes(),
      edges: this.listEdges(),
    };
  }

  public fromJSON(data: BrainGraphSnapshot): void {
    this.nodes.clear();
    this.edges.clear();
    this.aliases.clear();
    for (const node of data.nodes) {
      this.addNode(node);
    }
    for (const edge of data.edges) {
      this.addEdge(edge);
    }
  }

  private rebuildAliasesForNode(node: BrainNode): void {
    for (const [alias, id] of this.aliases.entries()) {
      if (id === node.id) {
        this.aliases.delete(alias);
      }
    }
    for (const alias of normalizeAliases(node.label, node.aliases)) {
      this.aliases.set(alias.toLowerCase(), node.id);
    }
  }
}
