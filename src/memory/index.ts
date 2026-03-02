export { MemoryIndexManager } from "./manager.js";
export type {
  MemoryEmbeddingProbeResult,
  MemorySearchManager,
  MemorySearchResult,
  MemoryTier,
  TieredMemoryEntry,
  TopicCluster,
  ConsolidationResult,
  SearchOptions,
  TieredSearchResult,
} from "./types.js";
export { getMemorySearchManager, type MemorySearchManagerResult } from "./search-manager.js";

// Tier exports
export { ImmediateMemory } from "./tiers/immediate.js";
export { SessionMemory } from "./tiers/session.js";
export { SemanticMemoryTier } from "./tiers/semantic.js";
export { SoulMemory, type SoulSuggestion } from "./tiers/soul.js";

// Cross-tier search
export { searchAllTiers, type CrossTierDeps } from "./cross-tier-search.js";

// Consolidation engine
export {
  runConsolidation,
  type ConsolidationOptions,
  type ConsolidationDeps,
} from "./consolidation-engine.js";

// Topic extraction
export { extractTopics, classifyDomain } from "./topic-extractor.js";
