export type MemorySource = "memory" | "sessions";

export type MemoryTier = "immediate" | "session" | "semantic" | "soul";

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: MemorySource;
  citation?: string;
};

export interface TieredMemoryEntry {
  id: string;
  tier: MemoryTier;
  content: string;
  topics: string[];
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  relevanceScore: number;
  metadata?: Record<string, unknown>;
}

export interface TopicCluster {
  topic: string;
  entryCount: number;
  avgRelevance: number;
  lastUpdated: Date;
}

export interface ConsolidationResult {
  sessionsConsolidated: number;
  entriesCreated: number;
  duplicatesMerged: number;
  contradictionsFlagged: number;
  soulSuggestionsGenerated: number;
  duration: number;
}

export interface SearchOptions {
  tiers?: MemoryTier[];
  topics?: string[];
  limit?: number;
  minRelevance?: number;
  timeRange?: { from: Date; to: Date };
}

export interface TieredSearchResult {
  entry: TieredMemoryEntry;
  tier: MemoryTier;
  score: number;
}

export type MemoryEmbeddingProbeResult = {
  ok: boolean;
  error?: string;
};

export type MemorySyncProgressUpdate = {
  completed: number;
  total: number;
  label?: string;
};

export type MemoryProviderStatus = {
  backend: "builtin" | "qmd";
  provider: string;
  model?: string;
  requestedProvider?: string;
  files?: number;
  chunks?: number;
  dirty?: boolean;
  workspaceDir?: string;
  dbPath?: string;
  extraPaths?: string[];
  sources?: MemorySource[];
  sourceCounts?: Array<{ source: MemorySource; files: number; chunks: number }>;
  cache?: { enabled: boolean; entries?: number; maxEntries?: number };
  fts?: { enabled: boolean; available: boolean; error?: string };
  fallback?: { from: string; reason?: string };
  vector?: {
    enabled: boolean;
    available?: boolean;
    extensionPath?: string;
    loadError?: string;
    dims?: number;
  };
  batch?: {
    enabled: boolean;
    failures: number;
    limit: number;
    wait: boolean;
    concurrency: number;
    pollIntervalMs: number;
    timeoutMs: number;
    lastError?: string;
    lastProvider?: string;
  };
  custom?: Record<string, unknown>;
};

export interface MemorySearchManager {
  search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]>;
  readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }>;
  status(): MemoryProviderStatus;
  sync?(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void>;
  probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult>;
  probeVectorAvailability(): Promise<boolean>;
  close?(): Promise<void>;
}
