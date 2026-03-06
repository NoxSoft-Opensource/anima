import type { GatewayRequestHandlers } from "./types.js";
import {
  loadProviderStore,
  saveProviderStore,
  maskApiKey,
  type ProviderEntry,
  type ProviderStore,
} from "../../providers/provider-store.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

function isValidProviderArray(value: unknown): value is ProviderEntry[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.apiKey === "string" &&
      typeof item.enabled === "boolean" &&
      typeof item.priority === "number",
  );
}

export const providersHandlers: GatewayRequestHandlers = {
  "anima.providers.get": ({ respond }) => {
    try {
      const store = loadProviderStore();
      const maskedProviders = store.providers.map((p) => ({
        ...p,
        apiKey: maskApiKey(p.apiKey),
      }));
      respond(
        true,
        {
          providers: maskedProviders,
          activeProvider: store.activeProvider,
          autoRotation: store.autoRotation,
          rotationStrategy: store.rotationStrategy,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.providers.set": ({ params, respond }) => {
    try {
      const providers = (params as { providers?: unknown }).providers;
      if (!isValidProviderArray(providers)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "providers must be an array of { id, name, apiKey, enabled, priority }",
          ),
        );
        return;
      }

      const existing = loadProviderStore();

      // Merge: for providers where apiKey is masked (contains "..."), keep the old key
      const merged = providers.map((p) => {
        if (p.apiKey.includes("...")) {
          const old = existing.providers.find((o) => o.id === p.id);
          if (old) {
            return { ...p, apiKey: old.apiKey };
          }
        }
        return p;
      });

      const updated: ProviderStore = {
        ...existing,
        providers: merged,
        activeProvider:
          existing.activeProvider && merged.some((p) => p.id === existing.activeProvider)
            ? existing.activeProvider
            : (merged.find((p) => p.enabled)?.id ?? null),
      };

      saveProviderStore(updated);

      const maskedProviders = updated.providers.map((p) => ({
        ...p,
        apiKey: maskApiKey(p.apiKey),
      }));
      respond(
        true,
        {
          ok: true,
          providers: maskedProviders,
          activeProvider: updated.activeProvider,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  "anima.providers.rotate": ({ params, respond }) => {
    try {
      const store = loadProviderStore();
      const autoRotation =
        typeof (params as { autoRotation?: unknown }).autoRotation === "boolean"
          ? (params as { autoRotation: boolean }).autoRotation
          : !store.autoRotation;

      store.autoRotation = autoRotation;
      saveProviderStore(store);

      respond(
        true,
        {
          ok: true,
          autoRotation: store.autoRotation,
          rotationStrategy: store.rotationStrategy,
        },
        undefined,
      );
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
