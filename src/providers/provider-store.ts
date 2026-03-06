import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export type ProviderEntry = {
  id: string;
  name: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
};

export type ProviderStore = {
  providers: ProviderEntry[];
  activeProvider: string | null;
  autoRotation: boolean;
  rotationStrategy: "on-rate-limit" | "round-robin";
};

const STORE_FILENAME = "providers.json";

function resolveStorePath(): string {
  return path.join(resolveStateDir(), STORE_FILENAME);
}

function defaultStore(): ProviderStore {
  return {
    providers: [],
    activeProvider: null,
    autoRotation: true,
    rotationStrategy: "on-rate-limit",
  };
}

export function loadProviderStore(): ProviderStore {
  const storePath = resolveStorePath();
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProviderStore>;
    return {
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      activeProvider: typeof parsed.activeProvider === "string" ? parsed.activeProvider : null,
      autoRotation: typeof parsed.autoRotation === "boolean" ? parsed.autoRotation : true,
      rotationStrategy: parsed.rotationStrategy === "round-robin" ? "round-robin" : "on-rate-limit",
    };
  } catch {
    return defaultStore();
  }
}

export function saveProviderStore(store: ProviderStore): void {
  const storePath = resolveStorePath();
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

export function getActiveProvider(): ProviderEntry | null {
  const store = loadProviderStore();
  if (!store.activeProvider) {
    const first = store.providers.find((p) => p.enabled);
    return first ?? null;
  }
  const active = store.providers.find((p) => p.id === store.activeProvider && p.enabled);
  if (active) {
    return active;
  }
  // Active provider not found or disabled, fall back to first enabled
  return store.providers.find((p) => p.enabled) ?? null;
}

export function rotateToNextProvider(): ProviderEntry | null {
  const store = loadProviderStore();
  const enabled = store.providers
    .filter((p) => p.enabled)
    .toSorted((a, b) => a.priority - b.priority);

  if (enabled.length === 0) {
    return null;
  }

  const currentIdx = enabled.findIndex((p) => p.id === store.activeProvider);
  const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % enabled.length;
  const next = enabled[nextIdx];

  store.activeProvider = next.id;
  saveProviderStore(store);

  return next;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 12) {
    return "***";
  }
  const prefix = key.slice(0, 7);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}
