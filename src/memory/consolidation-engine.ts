/**
 * Consolidation Engine — periodic memory maintenance
 *
 * Runs three consolidation phases:
 * 1. Session -> Semantic: Extract facts/decisions/learnings from old sessions
 * 2. Semantic Self-Review: Cluster, merge duplicates, boost frequently-accessed, flag contradictions
 * 3. Soul Reflection: Flag potential soul updates for explicit approval
 */

import type { SemanticMemoryTier } from "./tiers/semantic.js";
import type { SessionMemory } from "./tiers/session.js";
import type { SoulMemory } from "./tiers/soul.js";
import type { ConsolidationResult } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { extractTopics, classifyDomain } from "./topic-extractor.js";

const log = createSubsystemLogger("consolidation-engine");

export interface ConsolidationOptions {
  /** Days after which sessions are eligible for consolidation. Default: 30 */
  sessionRetentionDays?: number;
  /** Whether to prune sessions after consolidating. Default: false */
  pruneSessions?: boolean;
  /** Whether to run soul reflection. Default: true */
  reflectOnSoul?: boolean;
  /** Maximum entries to consolidate per run. Default: 50 */
  batchSize?: number;
}

export interface ConsolidationDeps {
  session: SessionMemory;
  semantic: SemanticMemoryTier;
  soul?: SoulMemory;
}

/**
 * Run the full consolidation pipeline.
 */
export async function runConsolidation(
  deps: ConsolidationDeps,
  options?: ConsolidationOptions,
): Promise<ConsolidationResult> {
  const startTime = Date.now();
  const retentionDays = options?.sessionRetentionDays ?? 30;
  const pruneSessions = options?.pruneSessions ?? false;
  const reflectOnSoul = options?.reflectOnSoul ?? true;
  const batchSize = options?.batchSize ?? 50;

  const result: ConsolidationResult = {
    sessionsConsolidated: 0,
    entriesCreated: 0,
    duplicatesMerged: 0,
    contradictionsFlagged: 0,
    soulSuggestionsGenerated: 0,
    duration: 0,
  };

  log.info("starting consolidation");

  // Phase 1: Session -> Semantic
  try {
    const consolidated = consolidateSessionsToSemantic(deps.session, deps.semantic, {
      retentionDays,
      batchSize,
      pruneSessions,
    });
    result.sessionsConsolidated = consolidated.sessionsConsolidated;
    result.entriesCreated = consolidated.entriesCreated;
  } catch (err) {
    log.warn(`session consolidation failed: ${String(err)}`);
  }

  // Phase 2: Semantic Self-Review
  try {
    const review = semanticSelfReview(deps.semantic);
    result.duplicatesMerged = review.duplicatesMerged;
    result.contradictionsFlagged = review.contradictionsFlagged;
  } catch (err) {
    log.warn(`semantic self-review failed: ${String(err)}`);
  }

  // Phase 3: Soul Reflection
  if (reflectOnSoul && deps.soul) {
    try {
      const suggestions = await soulReflection(deps.semantic, deps.soul);
      result.soulSuggestionsGenerated = suggestions;
    } catch (err) {
      log.warn(`soul reflection failed: ${String(err)}`);
    }
  }

  result.duration = Date.now() - startTime;

  log.info(
    `consolidation complete in ${result.duration}ms: ` +
      `${result.sessionsConsolidated} sessions -> ${result.entriesCreated} entries, ` +
      `${result.duplicatesMerged} merges, ${result.contradictionsFlagged} contradictions, ` +
      `${result.soulSuggestionsGenerated} soul suggestions`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Phase 1: Session -> Semantic consolidation
// ---------------------------------------------------------------------------

function consolidateSessionsToSemantic(
  session: SessionMemory,
  semantic: SemanticMemoryTier,
  options: {
    retentionDays: number;
    batchSize: number;
    pruneSessions: boolean;
  },
): { sessionsConsolidated: number; entriesCreated: number } {
  const oldSessions = session.getOlderThan(options.retentionDays);
  const batch = oldSessions.slice(0, options.batchSize);
  let entriesCreated = 0;

  for (const sessionEntry of batch) {
    // Extract knowledge from session content
    const facts = extractFacts(sessionEntry.content);
    const topics =
      sessionEntry.topics.length > 0 ? sessionEntry.topics : extractTopics(sessionEntry.content);

    for (const fact of facts) {
      semantic.store({
        content: fact,
        topics,
        relevanceScore: 0.5,
        metadata: {
          source: "session-consolidation",
          sourceSessionId: sessionEntry.id,
          consolidatedAt: new Date().toISOString(),
        },
      });
      entriesCreated += 1;
    }
  }

  // Optionally prune consolidated sessions
  if (options.pruneSessions && batch.length > 0) {
    for (const entry of batch) {
      session.remove(entry.id);
    }
  }

  return { sessionsConsolidated: batch.length, entriesCreated };
}

/**
 * Extract factual statements from session content.
 * Uses simple heuristics — looks for sentences that state facts,
 * decisions, or learnings rather than conversational fluff.
 */
function extractFacts(content: string): string[] {
  const sentences = content
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 500);

  const facts: string[] = [];
  const factPatterns = [
    /\b(decided|chose|selected|picked|went with)\b/i,
    /\b(learned|discovered|found out|realized|noticed)\b/i,
    /\b(works|doesn't work|breaks|fails|succeeds)\b/i,
    /\b(important|critical|key|essential|must|should)\b/i,
    /\b(because|reason|due to|caused by)\b/i,
    /\b(solution|fix|workaround|approach)\b/i,
    /\b(configured|set up|deployed|installed|created)\b/i,
    /\b(uses|requires|depends on|needs)\b/i,
  ];

  for (const sentence of sentences) {
    const isFactual = factPatterns.some((p) => p.test(sentence));
    if (isFactual) {
      facts.push(sentence);
    }
  }

  // If no factual sentences found, take the longest/most substantive ones
  if (facts.length === 0 && sentences.length > 0) {
    const sorted = sentences.filter((s) => s.length > 40).toSorted((a, b) => b.length - a.length);
    facts.push(...sorted.slice(0, 3));
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Phase 2: Semantic Self-Review
// ---------------------------------------------------------------------------

function semanticSelfReview(semantic: SemanticMemoryTier): {
  duplicatesMerged: number;
  contradictionsFlagged: number;
} {
  const duplicatesMerged = semantic.mergeDuplicates();
  const contradictionsFlagged = semantic.flagContradictions();
  return { duplicatesMerged, contradictionsFlagged };
}

// ---------------------------------------------------------------------------
// Phase 3: Soul Reflection
// ---------------------------------------------------------------------------

async function soulReflection(semantic: SemanticMemoryTier, soul: SoulMemory): Promise<number> {
  // Look for high-relevance semantic entries about identity that
  // might warrant a soul update suggestion
  const identityEntries = semantic.search("identity values soul", {
    topics: ["identity", "personal", "values"],
    limit: 10,
    minRelevance: 0.7,
  });

  let suggestions = 0;

  for (const entry of identityEntries) {
    const domain = classifyDomain(entry.content);
    if (domain !== "personal") {
      continue;
    }

    // Determine which soul component this relates to
    const component = inferSoulComponent(entry.content);
    if (component) {
      soul.suggestUpdate(
        component,
        entry.content,
        `High-relevance identity-related entry found during consolidation (score: ${entry.relevanceScore.toFixed(2)})`,
      );
      suggestions += 1;
    }
  }

  return suggestions;
}

function inferSoulComponent(
  content: string,
): import("../identity/loader.js").IdentityComponent | null {
  const lower = content.toLowerCase();

  if (/\b(purpose|meaning|mission|exist|being)\b/.test(lower)) {
    return "SOUL";
  }
  if (/\b(feel|emotion|love|care|empathy|compassion)\b/.test(lower)) {
    return "HEART";
  }
  if (/\b(think|reason|logic|analyze|understand|knowledge)\b/.test(lower)) {
    return "BRAIN";
  }
  if (/\b(instinct|intuition|sense|gut|hunch)\b/.test(lower)) {
    return "GUT";
  }
  if (/\b(drive|motivation|aspire|hope|dream|energy)\b/.test(lower)) {
    return "SPIRIT";
  }
  if (/\b(fear|doubt|dark|struggle|weakness|shadow)\b/.test(lower)) {
    return "SHADOW";
  }
  if (/\b(remember|memory|recall|past|history|experience)\b/.test(lower)) {
    return "MEMORY";
  }

  return null;
}
