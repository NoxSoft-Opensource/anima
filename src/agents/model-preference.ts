import type { AnimaConfig } from "../config/config.js";
import { resolveModelCostConfig } from "../utils/usage-format.js";

export type ModelCandidate = {
  provider: string;
  model: string;
};

export type ModelPreferenceMode = "preserve" | "prefer-cheap" | "prefer-strong";

export type ModelRoutingSessionSnapshot = {
  execSecurity?: string;
  providerOverride?: string;
  modelOverride?: string;
  sessionEstimatedCostUsdTotal?: number;
  sessionInputTokensTotal?: number;
  sessionOutputTokensTotal?: number;
  sessionTurnCount?: number;
  compactionCount?: number;
};

const HIGH_THINK_LEVELS = new Set(["high", "xhigh"]);
const SESSION_COST_THRESHOLD_USD = 0.5;
const SESSION_TOKEN_THRESHOLD = 300_000;
const SESSION_TURN_THRESHOLD = 12;
const SESSION_COMPACTION_THRESHOLD = 2;

function toPositiveFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function shouldPreferCheap(entry?: ModelRoutingSessionSnapshot | null): boolean {
  if (!entry) {
    return false;
  }

  const sessionCostUsd = toPositiveFiniteNumber(entry.sessionEstimatedCostUsdTotal) ?? 0;
  const sessionInputTokens = toPositiveFiniteNumber(entry.sessionInputTokensTotal) ?? 0;
  const sessionOutputTokens = toPositiveFiniteNumber(entry.sessionOutputTokensTotal) ?? 0;
  const sessionTurnCount = toPositiveFiniteNumber(entry.sessionTurnCount) ?? 0;
  const compactionCount = toPositiveFiniteNumber(entry.compactionCount) ?? 0;

  return (
    sessionCostUsd >= SESSION_COST_THRESHOLD_USD ||
    sessionInputTokens + sessionOutputTokens >= SESSION_TOKEN_THRESHOLD ||
    sessionTurnCount >= SESSION_TURN_THRESHOLD ||
    compactionCount >= SESSION_COMPACTION_THRESHOLD
  );
}

function resolveCandidateCostScore(
  candidate: ModelCandidate,
  cfg?: AnimaConfig,
): number | undefined {
  const cost = resolveModelCostConfig({
    provider: candidate.provider,
    model: candidate.model,
    config: cfg,
  });
  if (!cost) {
    return undefined;
  }

  const values = [cost.input, cost.output, cost.cacheRead, cost.cacheWrite].filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

export function resolveUsageAwareModelPreference(params: {
  thinkLevel?: string | null;
  sessionEntry?: ModelRoutingSessionSnapshot | null;
}): ModelPreferenceMode {
  if (params.sessionEntry?.providerOverride || params.sessionEntry?.modelOverride) {
    return "preserve";
  }
  if (params.thinkLevel && HIGH_THINK_LEVELS.has(params.thinkLevel)) {
    return "prefer-strong";
  }
  if (shouldPreferCheap(params.sessionEntry)) {
    return "prefer-cheap";
  }
  return "preserve";
}

export function orderCandidatesByPreference(params: {
  candidates: ModelCandidate[];
  cfg?: AnimaConfig;
  preferenceMode?: ModelPreferenceMode;
}): ModelCandidate[] {
  const preferenceMode = params.preferenceMode ?? "preserve";
  if (preferenceMode === "preserve" || params.candidates.length <= 1) {
    return [...params.candidates];
  }

  const scoredCandidates = params.candidates.map((candidate) => ({
    candidate,
    score: resolveCandidateCostScore(candidate, params.cfg),
  }));
  const sortable = scoredCandidates.filter(
    (entry): entry is { candidate: ModelCandidate; score: number } => entry.score !== undefined,
  );
  if (sortable.length < 2) {
    return [...params.candidates];
  }

  sortable.sort((left, right) =>
    preferenceMode === "prefer-cheap" ? left.score - right.score : right.score - left.score,
  );

  const reordered = sortable.map((entry) => entry.candidate);
  let reorderedIndex = 0;

  return scoredCandidates.map((entry) => {
    if (entry.score === undefined) {
      return entry.candidate;
    }
    const next = reordered[reorderedIndex];
    reorderedIndex += 1;
    return next;
  });
}
