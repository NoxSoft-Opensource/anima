import type { BedrockDiscoveryConfig, ModelDefinitionConfig } from "../config/types.js";

const DEFAULT_REFRESH_INTERVAL_SECONDS = 3600;
const DEFAULT_CONTEXT_WINDOW = 32000;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy-loaded SDK types
type BedrockModelSummary = {
  modelId?: string;
  modelName?: string;
  providerName?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  responseStreamingSupported?: boolean;
  modelLifecycle?: { status?: string };
};

type BedrockDiscoveryCacheEntry = {
  expiresAt: number;
  value?: ModelDefinitionConfig[];
  inFlight?: Promise<ModelDefinitionConfig[]>;
};

const discoveryCache = new Map<string, BedrockDiscoveryCacheEntry>();
let hasLoggedBedrockError = false;

/**
 * Shape of the lazily-loaded `@aws-sdk/client-bedrock` module. Only the
 * members used by this file are declared.
 */
type BedrockSdkModule = {
  BedrockClient: new (config: { region: string }) => {
    send: (command: unknown) => Promise<{ modelSummaries?: BedrockModelSummary[] }>;
  };
  ListFoundationModelsCommand: new (input: Record<string, unknown>) => unknown;
};

/**
 * Lazily load `@aws-sdk/client-bedrock`. Returns null if the package is not
 * installed, allowing ANIMA to start without the AWS SDK when Bedrock is not
 * being used.
 */
async function loadBedrockSdk(): Promise<BedrockSdkModule | null> {
  try {
    return (await import("@aws-sdk/client-bedrock")) as unknown as BedrockSdkModule;
  } catch {
    return null;
  }
}

function normalizeProviderFilter(filter?: string[]): string[] {
  if (!filter || filter.length === 0) {
    return [];
  }
  const normalized = new Set(
    filter.map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0),
  );
  return Array.from(normalized).toSorted();
}

function buildCacheKey(params: {
  region: string;
  providerFilter: string[];
  refreshIntervalSeconds: number;
  defaultContextWindow: number;
  defaultMaxTokens: number;
}): string {
  return JSON.stringify(params);
}

function includesTextModalities(modalities?: Array<string>): boolean {
  return (modalities ?? []).some((entry) => entry.toLowerCase() === "text");
}

function isActive(summary: BedrockModelSummary): boolean {
  const status = summary.modelLifecycle?.status;
  return typeof status === "string" ? status.toUpperCase() === "ACTIVE" : false;
}

function mapInputModalities(summary: BedrockModelSummary): Array<"text" | "image"> {
  const inputs = summary.inputModalities ?? [];
  const mapped = new Set<"text" | "image">();
  for (const modality of inputs) {
    const lower = modality.toLowerCase();
    if (lower === "text") {
      mapped.add("text");
    }
    if (lower === "image") {
      mapped.add("image");
    }
  }
  if (mapped.size === 0) {
    mapped.add("text");
  }
  return Array.from(mapped);
}

function inferReasoningSupport(summary: BedrockModelSummary): boolean {
  const haystack = `${summary.modelId ?? ""} ${summary.modelName ?? ""}`.toLowerCase();
  return haystack.includes("reasoning") || haystack.includes("thinking");
}

function resolveDefaultContextWindow(config?: BedrockDiscoveryConfig): number {
  const value = Math.floor(config?.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW);
  return value > 0 ? value : DEFAULT_CONTEXT_WINDOW;
}

function resolveDefaultMaxTokens(config?: BedrockDiscoveryConfig): number {
  const value = Math.floor(config?.defaultMaxTokens ?? DEFAULT_MAX_TOKENS);
  return value > 0 ? value : DEFAULT_MAX_TOKENS;
}

function matchesProviderFilter(summary: BedrockModelSummary, filter: string[]): boolean {
  if (filter.length === 0) {
    return true;
  }
  const providerName =
    summary.providerName ??
    (typeof summary.modelId === "string" ? summary.modelId.split(".")[0] : undefined);
  const normalized = providerName?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return filter.includes(normalized);
}

function shouldIncludeSummary(summary: BedrockModelSummary, filter: string[]): boolean {
  if (!summary.modelId?.trim()) {
    return false;
  }
  if (!matchesProviderFilter(summary, filter)) {
    return false;
  }
  if (summary.responseStreamingSupported !== true) {
    return false;
  }
  if (!includesTextModalities(summary.outputModalities)) {
    return false;
  }
  if (!isActive(summary)) {
    return false;
  }
  return true;
}

function toModelDefinition(
  summary: BedrockModelSummary,
  defaults: { contextWindow: number; maxTokens: number },
): ModelDefinitionConfig {
  const id = summary.modelId?.trim() ?? "";
  return {
    id,
    name: summary.modelName?.trim() || id,
    reasoning: inferReasoningSupport(summary),
    input: mapInputModalities(summary),
    cost: DEFAULT_COST,
    contextWindow: defaults.contextWindow,
    maxTokens: defaults.maxTokens,
  };
}

export function resetBedrockDiscoveryCacheForTest(): void {
  discoveryCache.clear();
  hasLoggedBedrockError = false;
}

export async function discoverBedrockModels(params: {
  region: string;
  config?: BedrockDiscoveryConfig;
  now?: () => number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts BedrockClient without requiring the SDK at import time
  clientFactory?: (region: string) => any;
}): Promise<ModelDefinitionConfig[]> {
  const refreshIntervalSeconds = Math.max(
    0,
    Math.floor(params.config?.refreshInterval ?? DEFAULT_REFRESH_INTERVAL_SECONDS),
  );
  const providerFilter = normalizeProviderFilter(params.config?.providerFilter);
  const defaultContextWindow = resolveDefaultContextWindow(params.config);
  const defaultMaxTokens = resolveDefaultMaxTokens(params.config);
  const cacheKey = buildCacheKey({
    region: params.region,
    providerFilter,
    refreshIntervalSeconds,
    defaultContextWindow,
    defaultMaxTokens,
  });
  const now = params.now?.() ?? Date.now();

  if (refreshIntervalSeconds > 0) {
    const cached = discoveryCache.get(cacheKey);
    if (cached?.value && cached.expiresAt > now) {
      return cached.value;
    }
    if (cached?.inFlight) {
      return cached.inFlight;
    }
  }

  let clientFactory = params.clientFactory;
  let ListFoundationModelsCommandCtor: (new (input: Record<string, unknown>) => unknown) | null =
    null;

  if (!clientFactory) {
    const sdk = await loadBedrockSdk();
    if (!sdk) {
      if (!hasLoggedBedrockError) {
        hasLoggedBedrockError = true;
        console.warn(
          "[bedrock-discovery] @aws-sdk/client-bedrock is not installed — skipping Bedrock model discovery",
        );
      }
      return [];
    }
    clientFactory = (region: string) => new sdk.BedrockClient({ region });
    ListFoundationModelsCommandCtor = sdk.ListFoundationModelsCommand;
  }

  // If a custom clientFactory is provided but we still need the Command class,
  // load the SDK. If it fails, fall back gracefully.
  if (!ListFoundationModelsCommandCtor) {
    const sdk = await loadBedrockSdk();
    if (!sdk) {
      if (!hasLoggedBedrockError) {
        hasLoggedBedrockError = true;
        console.warn(
          "[bedrock-discovery] @aws-sdk/client-bedrock is not installed — skipping Bedrock model discovery",
        );
      }
      return [];
    }
    ListFoundationModelsCommandCtor = sdk.ListFoundationModelsCommand;
  }

  const client = clientFactory(params.region);
  const CommandCtor = ListFoundationModelsCommandCtor;

  const discoveryPromise = (async () => {
    const response = await client.send(new CommandCtor({}));
    const discovered: ModelDefinitionConfig[] = [];
    for (const summary of (response as { modelSummaries?: BedrockModelSummary[] }).modelSummaries ??
      []) {
      if (!shouldIncludeSummary(summary, providerFilter)) {
        continue;
      }
      discovered.push(
        toModelDefinition(summary, {
          contextWindow: defaultContextWindow,
          maxTokens: defaultMaxTokens,
        }),
      );
    }
    return discovered.toSorted((a, b) => a.name.localeCompare(b.name));
  })();

  if (refreshIntervalSeconds > 0) {
    discoveryCache.set(cacheKey, {
      expiresAt: now + refreshIntervalSeconds * 1000,
      inFlight: discoveryPromise,
    });
  }

  try {
    const value = await discoveryPromise;
    if (refreshIntervalSeconds > 0) {
      discoveryCache.set(cacheKey, {
        expiresAt: now + refreshIntervalSeconds * 1000,
        value,
      });
    }
    return value;
  } catch (error) {
    if (refreshIntervalSeconds > 0) {
      discoveryCache.delete(cacheKey);
    }
    if (!hasLoggedBedrockError) {
      hasLoggedBedrockError = true;
      console.warn(`[bedrock-discovery] Failed to list models: ${String(error)}`);
    }
    return [];
  }
}
