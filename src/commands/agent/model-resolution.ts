import type { AnimaConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { resolveAgentModelPrimary } from "../../agents/agent-scope.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { loadModelCatalog } from "../../agents/model-catalog.js";
import {
  buildModelAliasIndex,
  isCliProvider,
  modelKey,
  normalizeModelRef,
  resolveAllowedModelRef,
  resolveConfiguredModelRef,
  resolveModelRefFromString,
} from "../../agents/model-selection.js";

export type AgentModelSelection = {
  provider: string;
  model: string;
  defaultProvider: string;
  defaultModel: string;
  source: "default" | "session" | "explicit";
  storedOverrideValid: boolean;
};

function buildConfigForAgentPrimary(
  cfg: AnimaConfig,
  agentId?: string,
): {
  cfgForModelSelection: AnimaConfig;
  agentModelPrimary?: string;
} {
  const agentModelPrimary = agentId ? resolveAgentModelPrimary(cfg, agentId) : undefined;
  if (!agentModelPrimary) {
    return {
      cfgForModelSelection: cfg,
      agentModelPrimary,
    };
  }
  return {
    agentModelPrimary,
    cfgForModelSelection: {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          model: {
            ...(typeof cfg.agents?.defaults?.model === "object"
              ? cfg.agents.defaults.model
              : undefined),
            primary: agentModelPrimary,
          },
        },
      },
    },
  };
}

export async function resolveAgentModelSelection(params: {
  cfg: AnimaConfig;
  agentId?: string;
  sessionEntry?: SessionEntry;
  explicitModel?: string;
}): Promise<AgentModelSelection> {
  const { cfgForModelSelection } = buildConfigForAgentPrimary(params.cfg, params.agentId);
  const configuredDefaultRef = resolveConfiguredModelRef({
    cfg: cfgForModelSelection,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const { provider: defaultProvider, model: defaultModel } = normalizeModelRef(
    configuredDefaultRef.provider,
    configuredDefaultRef.model,
  );

  const explicitModel = params.explicitModel?.trim();
  const hasStoredOverride = Boolean(
    params.sessionEntry?.modelOverride || params.sessionEntry?.providerOverride,
  );
  const hasAllowlist =
    Boolean(params.cfg.agents?.defaults?.models) &&
    Object.keys(params.cfg.agents?.defaults?.models ?? {}).length > 0;
  const needsCatalog = Boolean(explicitModel) || hasStoredOverride || hasAllowlist;
  const catalog = needsCatalog ? await loadModelCatalog({ config: params.cfg }) : [];

  if (explicitModel) {
    const resolved = resolveAllowedModelRef({
      cfg: params.cfg,
      catalog,
      raw: explicitModel,
      defaultProvider,
      defaultModel,
    });
    if ("error" in resolved) {
      const aliasIndex = buildModelAliasIndex({
        cfg: params.cfg,
        defaultProvider,
      });
      const cliResolved = resolveModelRefFromString({
        raw: explicitModel,
        defaultProvider,
        aliasIndex,
      });
      if (!cliResolved || !isCliProvider(cliResolved.ref.provider, params.cfg)) {
        throw new Error(resolved.error);
      }
      return {
        provider: cliResolved.ref.provider,
        model: cliResolved.ref.model,
        defaultProvider,
        defaultModel,
        source: "explicit",
        storedOverrideValid: true,
      };
    }
    return {
      provider: resolved.ref.provider,
      model: resolved.ref.model,
      defaultProvider,
      defaultModel,
      source: "explicit",
      storedOverrideValid: true,
    };
  }

  const storedProviderOverride = params.sessionEntry?.providerOverride?.trim();
  const storedModelOverride = params.sessionEntry?.modelOverride?.trim();
  if (storedModelOverride) {
    const normalizedStored = normalizeModelRef(
      storedProviderOverride || defaultProvider,
      storedModelOverride,
    );
    const key = modelKey(normalizedStored.provider, normalizedStored.model);
    const allowStored =
      isCliProvider(normalizedStored.provider, params.cfg) ||
      !hasAllowlist ||
      catalog.some((entry) => modelKey(entry.provider, entry.id) === key) ||
      Object.prototype.hasOwnProperty.call(
        params.cfg.models?.providers ?? {},
        normalizedStored.provider,
      );
    if (allowStored) {
      return {
        provider: normalizedStored.provider,
        model: normalizedStored.model,
        defaultProvider,
        defaultModel,
        source: "session",
        storedOverrideValid: true,
      };
    }
    return {
      provider: defaultProvider,
      model: defaultModel,
      defaultProvider,
      defaultModel,
      source: "default",
      storedOverrideValid: false,
    };
  }

  return {
    provider: defaultProvider,
    model: defaultModel,
    defaultProvider,
    defaultModel,
    source: "default",
    storedOverrideValid: true,
  };
}
