/**
 * Cross-Tier Search — unified search across all memory tiers
 *
 * Searches all tiers with configurable weighting:
 * - Soul entries get the highest relevance boost (identity queries)
 * - Semantic entries next (knowledge queries)
 * - Session entries after (recent context)
 * - Immediate entries last (current session context)
 */

import type { ImmediateMemory } from "./tiers/immediate.js";
import type { SemanticMemoryTier } from "./tiers/semantic.js";
import type { SessionMemory } from "./tiers/session.js";
import type { SoulMemory } from "./tiers/soul.js";
import type { MemoryTier, SearchOptions, TieredSearchResult } from "./types.js";

// Tier weight multipliers for score blending
const DEFAULT_TIER_WEIGHTS: Record<MemoryTier, number> = {
  soul: 2.0,
  semantic: 1.5,
  session: 1.0,
  immediate: 0.8,
};

export interface CrossTierDeps {
  immediate?: ImmediateMemory;
  session?: SessionMemory;
  semantic?: SemanticMemoryTier;
  soul?: SoulMemory;
}

/**
 * Search across all available memory tiers with tier-weighted scoring.
 */
export async function searchAllTiers(
  query: string,
  deps: CrossTierDeps,
  options?: SearchOptions,
): Promise<TieredSearchResult[]> {
  const tiers = options?.tiers ?? (["immediate", "session", "semantic", "soul"] as MemoryTier[]);
  const limit = options?.limit ?? 20;
  const minRelevance = options?.minRelevance ?? 0;
  const topics = options?.topics;

  const results: TieredSearchResult[] = [];

  // Search each tier in parallel where possible
  const searches: Array<Promise<void>> = [];

  if (tiers.includes("soul") && deps.soul) {
    searches.push(
      deps.soul
        .search(query)
        .then((entries) => {
          for (const entry of entries) {
            if (topics && topics.length > 0) {
              const hasMatch = entry.topics.some((t) =>
                topics.some((f) => t.toLowerCase() === f.toLowerCase()),
              );
              if (!hasMatch) {
                continue;
              }
            }
            const baseScore = entry.relevanceScore;
            results.push({
              entry,
              tier: "soul",
              score: baseScore * DEFAULT_TIER_WEIGHTS.soul,
            });
          }
        })
        .catch(() => {}),
    );
  }

  if (tiers.includes("semantic") && deps.semantic) {
    searches.push(
      Promise.resolve()
        .then(() => {
          const entries = deps.semantic!.search(query, {
            topics,
            limit: limit * 2,
            minRelevance,
          });
          for (const entry of entries) {
            if (options?.timeRange) {
              if (
                entry.createdAt < options.timeRange.from ||
                entry.createdAt > options.timeRange.to
              ) {
                continue;
              }
            }
            const baseScore = entry.relevanceScore;
            results.push({
              entry,
              tier: "semantic",
              score: baseScore * DEFAULT_TIER_WEIGHTS.semantic,
            });
          }
        })
        .catch(() => {}),
    );
  }

  if (tiers.includes("session") && deps.session) {
    searches.push(
      Promise.resolve()
        .then(() => {
          const entries = deps.session!.searchSessions(query, {
            topics,
            limit: limit * 2,
          });
          for (const entry of entries) {
            if (options?.timeRange) {
              if (
                entry.createdAt < options.timeRange.from ||
                entry.createdAt > options.timeRange.to
              ) {
                continue;
              }
            }
            // Session relevance is based on recency
            const ageMs = Date.now() - entry.createdAt.getTime();
            const ageDays = ageMs / 86_400_000;
            const recencyBoost = Math.max(0, 1 - ageDays / 30); // Decays over 30 days
            const baseScore = 0.5 + recencyBoost * 0.5;

            results.push({
              entry,
              tier: "session",
              score: baseScore * DEFAULT_TIER_WEIGHTS.session,
            });
          }
        })
        .catch(() => {}),
    );
  }

  if (tiers.includes("immediate") && deps.immediate) {
    searches.push(
      Promise.resolve()
        .then(() => {
          const entries = deps.immediate!.search(query, { topics, limit: limit * 2 });
          for (const entry of entries) {
            const baseScore = entry.relevanceScore;
            results.push({
              entry,
              tier: "immediate",
              score: baseScore * DEFAULT_TIER_WEIGHTS.immediate,
            });
          }
        })
        .catch(() => {}),
    );
  }

  await Promise.all(searches);

  // Filter by minimum relevance
  const filtered = minRelevance > 0 ? results.filter((r) => r.score >= minRelevance) : results;

  // Sort by combined score descending
  filtered.sort((a, b) => b.score - a.score);

  return filtered.slice(0, limit);
}
