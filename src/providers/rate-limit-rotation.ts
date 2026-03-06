import { EventEmitter } from "node:events";
import { loadProviderStore, rotateToNextProvider } from "./provider-store.js";

export const providerEvents = new EventEmitter();

type RateLimitError = {
  status?: number;
  statusCode?: number;
  code?: string;
  error?: { type?: string; code?: string };
  headers?: Record<string, string | undefined>;
  message?: string;
};

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const e = err as RateLimitError;

  // HTTP 429
  if (e.status === 429 || e.statusCode === 429) {
    return true;
  }

  // x-ratelimit-remaining: 0 header
  if (e.headers && e.headers["x-ratelimit-remaining"] === "0") {
    return true;
  }

  // Anthropic overloaded_error
  if (e.error?.type === "overloaded_error") {
    return true;
  }

  // OpenAI rate_limit_exceeded
  if (e.error?.code === "rate_limit_exceeded" || e.code === "rate_limit_exceeded") {
    return true;
  }

  // Message-based detection as fallback
  if (typeof e.message === "string") {
    const msg = e.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      return true;
    }
  }

  return false;
}

export function withAutoRotation<T>(fn: () => Promise<T>): Promise<T> {
  const store = loadProviderStore();
  if (!store.autoRotation) {
    return fn();
  }

  return fn().catch((err: unknown) => {
    if (!isRateLimitError(err)) {
      throw err;
    }

    const next = rotateToNextProvider();
    if (!next) {
      throw err;
    }

    providerEvents.emit("rotation", {
      reason: "rate-limit",
      provider: next.id,
      providerName: next.name,
      timestamp: Date.now(),
    });

    // Retry with new provider
    return fn();
  });
}
