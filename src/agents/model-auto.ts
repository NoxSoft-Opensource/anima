import type { AnimaConfig } from "../config/config.js";
import type { AgentModelAutoConfig } from "../config/types.agent-defaults.js";
import type { ModelCandidate } from "./model-preference.js";
import {
  loadProviderUsageSummary,
  resolveUsageProviderId,
  type ProviderUsageSnapshot,
  type UsageProviderId,
  type UsageSummary,
} from "../infra/provider-usage.js";
import { DEFAULT_PROVIDER } from "./defaults.js";
import {
  buildModelAliasIndex,
  modelKey,
  normalizeProviderId,
  resolveModelRefFromString,
} from "./model-selection.js";

const DEFAULT_USAGE_THRESHOLD_PERCENT = 5;
const USAGE_CACHE_TTL_MS = 60_000;
const USAGE_TIMEOUT_MS = 1_500;

const usageSummaryCache = new Map<string, { expiresAt: number; summary: UsageSummary }>();

export type NormalizedModelAutoConfig = {
  enabled: boolean;
  providerOrder: string[];
  byProvider: Record<string, { models: string[] }>;
  byWorkingMode: { read: string[]; write: string[] };
  usageCheck: "off" | "prefer-available";
  usageThresholdPercent: number;
};

export type ModelAutoProviderAvailability = {
  provider: string;
  usageProvider?: UsageProviderId;
  state: "available" | "exhausted" | "unknown";
  remainingPercent?: number;
};

export type AutoModelRoutingResult = {
  candidates: ModelCandidate[];
  autoConfigured: boolean;
  preserveProviderOrder: boolean;
  config?: NormalizedModelAutoConfig;
  availabilityByProvider: Map<string, ModelAutoProviderAvailability>;
};

export type WorkingMode = "read" | "write";

function resolveRawAutoConfig(cfg?: AnimaConfig): AgentModelAutoConfig | undefined {
  const modelConfig = cfg?.agents?.defaults?.model as
    | { auto?: AgentModelAutoConfig }
    | string
    | undefined;
  if (typeof modelConfig !== "object" || !modelConfig) {
    return undefined;
  }
  return modelConfig.auto;
}

function dedupeProviders(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const input of values) {
    if (!input) {
      continue;
    }
    const normalized = normalizeProviderId(input);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function resolveModelAutoConfig(cfg?: AnimaConfig): NormalizedModelAutoConfig | null {
  const raw = resolveRawAutoConfig(cfg);
  if (!raw?.enabled) {
    return null;
  }

  const byProvider: Record<string, { models: string[] }> = {};
  for (const [providerRaw, entry] of Object.entries(raw.byProvider ?? {})) {
    const provider = normalizeProviderId(providerRaw);
    if (!provider) {
      continue;
    }
    const models = Array.isArray(entry?.models)
      ? entry.models.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    if (models.length > 0) {
      byProvider[provider] = { models };
    }
  }

  const usageThresholdPercent =
    typeof raw.usageThresholdPercent === "number" && Number.isFinite(raw.usageThresholdPercent)
      ? Math.max(0, Math.min(100, raw.usageThresholdPercent))
      : DEFAULT_USAGE_THRESHOLD_PERCENT;

  return {
    enabled: true,
    providerOrder: dedupeProviders(raw.providerOrder ?? []),
    byProvider,
    byWorkingMode: {
      read: Array.isArray(raw.byWorkingMode?.read)
        ? raw.byWorkingMode.read.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      write: Array.isArray(raw.byWorkingMode?.write)
        ? raw.byWorkingMode.write.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
    },
    usageCheck: raw.usageCheck === "prefer-available" ? "prefer-available" : "off",
    usageThresholdPercent,
  };
}

function buildCandidatesFromRawModels(params: {
  rawModels: string[];
  cfg?: AnimaConfig;
  defaultProvider?: string;
}): ModelCandidate[] {
  const defaultProvider = params.defaultProvider ?? DEFAULT_PROVIDER;
  const index = buildModelAliasIndex({
    cfg: params.cfg ?? ({} as AnimaConfig),
    defaultProvider,
  });
  const seen = new Set<string>();
  const out: ModelCandidate[] = [];
  for (const raw of params.rawModels) {
    const resolved = resolveModelRefFromString({
      raw,
      defaultProvider,
      aliasIndex: index,
    });
    if (!resolved) {
      continue;
    }
    const key = modelKey(resolved.ref.provider, resolved.ref.model);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(resolved.ref);
  }
  return out;
}

export function resolveWorkingModeModelSelection(params: {
  cfg?: AnimaConfig;
  workingMode?: WorkingMode;
  defaultProvider?: string;
}): ModelCandidate | null {
  if (!params.workingMode) {
    return null;
  }
  const autoConfig = resolveModelAutoConfig(params.cfg);
  if (!autoConfig) {
    return null;
  }
  const modeModels = autoConfig.byWorkingMode[params.workingMode];
  if (!modeModels || modeModels.length === 0) {
    return null;
  }
  const candidates = buildCandidatesFromRawModels({
    rawModels: modeModels,
    cfg: params.cfg,
    defaultProvider: params.defaultProvider,
  });
  return candidates[0] ?? null;
}

async function loadUsageSummary(
  agentDir: string | undefined,
  providers: UsageProviderId[],
): Promise<UsageSummary> {
  const key = `${agentDir ?? "main"}::${providers.slice().toSorted().join(",")}`;
  const now = Date.now();
  const cached = usageSummaryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.summary;
  }
  const summary = await loadProviderUsageSummary({
    agentDir,
    providers,
    timeoutMs: USAGE_TIMEOUT_MS,
  });
  usageSummaryCache.set(key, { expiresAt: now + USAGE_CACHE_TTL_MS, summary });
  return summary;
}

function remainingPercent(snapshot: ProviderUsageSnapshot): number | undefined {
  if (snapshot.error || snapshot.windows.length === 0) {
    return undefined;
  }
  const values = snapshot.windows
    .map((window) => 100 - window.usedPercent)
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return undefined;
  }
  return Math.max(0, Math.min(...values));
}

async function resolveAvailability(params: {
  providerOrder: string[];
  agentDir?: string;
  autoConfig: NormalizedModelAutoConfig;
}): Promise<Map<string, ModelAutoProviderAvailability>> {
  const availability = new Map<string, ModelAutoProviderAvailability>();
  const usageProviders = Array.from(
    new Set(
      params.providerOrder
        .map((provider) => resolveUsageProviderId(provider))
        .filter((provider): provider is UsageProviderId => Boolean(provider)),
    ),
  );
  let summary: UsageSummary | undefined;
  if (usageProviders.length > 0) {
    try {
      summary = await loadUsageSummary(params.agentDir, usageProviders);
    } catch {
      summary = undefined;
    }
  }
  const snapshots = new Map<UsageProviderId, ProviderUsageSnapshot>();
  for (const entry of summary?.providers ?? []) {
    snapshots.set(entry.provider, entry);
  }

  for (const provider of params.providerOrder) {
    const usageProvider = resolveUsageProviderId(provider);
    if (!usageProvider) {
      availability.set(provider, { provider, state: "unknown" });
      continue;
    }
    const snapshot = snapshots.get(usageProvider);
    const percent = snapshot ? remainingPercent(snapshot) : undefined;
    availability.set(provider, {
      provider,
      usageProvider,
      remainingPercent: percent,
      state:
        percent === undefined
          ? "unknown"
          : percent <= params.autoConfig.usageThresholdPercent
            ? "exhausted"
            : "available",
    });
  }
  return availability;
}

function reorderByAvailability(params: {
  candidates: ModelCandidate[];
  availability: Map<string, ModelAutoProviderAvailability>;
  preservePrimary?: boolean;
}): ModelCandidate[] {
  const lockedPrimary = params.preservePrimary ? params.candidates[0] : undefined;
  const rest = params.preservePrimary ? params.candidates.slice(1) : params.candidates;
  const grouped = new Map<string, ModelCandidate[]>();
  for (const candidate of rest) {
    const normalized = normalizeProviderId(candidate.provider);
    const group = grouped.get(normalized) ?? [];
    group.push({ provider: normalized, model: candidate.model });
    grouped.set(normalized, group);
  }
  const order: string[] = [];
  for (const [provider, availability] of params.availability) {
    if (availability.state === "available") {
      order.push(provider);
    }
  }
  for (const [provider, availability] of params.availability) {
    if (availability.state === "unknown") {
      order.push(provider);
    }
  }
  for (const [provider, availability] of params.availability) {
    if (availability.state === "exhausted") {
      order.push(provider);
    }
  }
  for (const provider of grouped.keys()) {
    if (!order.includes(provider)) {
      order.push(provider);
    }
  }
  const ordered: ModelCandidate[] = [];
  for (const provider of order) {
    const group = grouped.get(provider) ?? [];
    ordered.push(...group);
  }
  return lockedPrimary ? [lockedPrimary, ...ordered] : ordered;
}

export async function applyAutoModelRouting(params: {
  candidates: ModelCandidate[];
  cfg?: AnimaConfig;
  agentDir?: string;
  preservePrimary?: boolean;
  workingMode?: WorkingMode;
}): Promise<AutoModelRoutingResult> {
  const autoConfig = resolveModelAutoConfig(params.cfg);
  if (!autoConfig) {
    return {
      candidates: [...params.candidates],
      autoConfigured: false,
      preserveProviderOrder: false,
      availabilityByProvider: new Map(),
    };
  }

  const providerOrder = dedupeProviders([
    ...autoConfig.providerOrder,
    ...params.candidates.map((candidate) => candidate.provider),
  ]);

  let candidates = [...params.candidates];
  const modePreferred = params.workingMode
    ? buildCandidatesFromRawModels({
        rawModels: autoConfig.byWorkingMode[params.workingMode] ?? [],
        cfg: params.cfg,
        defaultProvider: params.candidates[0]?.provider ?? DEFAULT_PROVIDER,
      })
    : [];
  if (modePreferred.length > 0) {
    const lockedPrimary = params.preservePrimary && candidates.length > 0 ? [candidates[0]] : [];
    const remainingCandidates = params.preservePrimary ? candidates.slice(1) : candidates;
    const seen = new Set<string>();
    candidates = [...lockedPrimary, ...modePreferred, ...remainingCandidates].filter(
      (candidate) => {
        const key = modelKey(candidate.provider, candidate.model);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      },
    );
  }
  const availability = await resolveAvailability({
    providerOrder,
    agentDir: params.agentDir,
    autoConfig,
  });

  if (autoConfig.usageCheck === "prefer-available") {
    candidates = reorderByAvailability({
      candidates,
      availability,
      preservePrimary: params.preservePrimary,
    });
  }

  return {
    candidates,
    autoConfigured: true,
    preserveProviderOrder: true,
    config: autoConfig,
    availabilityByProvider: availability,
  };
}
