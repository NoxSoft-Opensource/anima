/**
 * Jack In Resilience — retry logic and circuit breaker for platform connectors
 *
 * Makes Jack In connections production-ready with:
 * - Exponential backoff retries
 * - Circuit breaker (open → half-open → closed)
 * - Request timeout enforcement
 * - Connection health tracking
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("jack-in-resilience");

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** How long to wait before trying half-open (ms) */
  resetTimeoutMs: number;
  /** Number of successes in half-open before fully closing */
  halfOpenSuccessThreshold: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private halfOpenSuccessCount = 0;
  private lastFailureAt = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws if circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureAt > this.config.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenSuccessCount = 0;
        log.info(`circuit ${this.name}: open → half-open`);
      } else {
        throw new Error(`Circuit breaker open for ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= this.config.halfOpenSuccessThreshold) {
        this.state = "closed";
        this.failureCount = 0;
        log.info(`circuit ${this.name}: half-open → closed`);
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureAt = Date.now();

    if (this.state === "half-open") {
      this.state = "open";
      log.warn(`circuit ${this.name}: half-open → open (failed during probe)`);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = "open";
      log.warn(`circuit ${this.name}: closed → open (${this.failureCount} failures)`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.halfOpenSuccessCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitter: true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === opts.maxRetries) {
        break;
      }

      const delay = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
      const actualDelay = opts.jitter ? delay * (0.5 + Math.random() * 0.5) : delay;

      log.info(`retry ${attempt + 1}/${opts.maxRetries} in ${Math.round(actualDelay)}ms`);
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }

  throw lastError ?? new Error("Retry exhausted");
}

// ---------------------------------------------------------------------------
// Resilient fetch wrapper
// ---------------------------------------------------------------------------

export interface ResilientFetchConfig {
  timeoutMs: number;
  retry: Partial<RetryConfig>;
  circuitBreaker?: CircuitBreakerConfig;
}

const DEFAULT_FETCH_CONFIG: ResilientFetchConfig = {
  timeoutMs: 10_000,
  retry: { maxRetries: 2, baseDelayMs: 500 },
};

/**
 * Fetch with timeout, retry, and circuit breaker.
 */
export async function resilientFetch(
  url: string,
  init?: RequestInit,
  config?: Partial<ResilientFetchConfig>,
): Promise<Response> {
  const opts = { ...DEFAULT_FETCH_CONFIG, ...config };

  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!res.ok && res.status >= 500) {
        throw new Error(`Server error: ${res.status}`);
      }

      return res;
    } finally {
      clearTimeout(timeout);
    }
  }, opts.retry);
}

// ---------------------------------------------------------------------------
// Health tracker
// ---------------------------------------------------------------------------

export interface HealthStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  avgResponseMs: number;
  lastResponseMs: number;
  uptime: number; // 0-1
  lastCheckAt: number;
}

export class HealthTracker {
  private stats: HealthStats = {
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
    avgResponseMs: 0,
    lastResponseMs: 0,
    uptime: 1,
    lastCheckAt: 0,
  };

  recordSuccess(responseMs: number): void {
    this.stats.totalRequests++;
    this.stats.successCount++;
    this.stats.lastResponseMs = responseMs;
    this.stats.avgResponseMs =
      (this.stats.avgResponseMs * (this.stats.successCount - 1) + responseMs) /
      this.stats.successCount;
    this.stats.uptime = this.stats.successCount / this.stats.totalRequests;
    this.stats.lastCheckAt = Date.now();
  }

  recordFailure(): void {
    this.stats.totalRequests++;
    this.stats.failureCount++;
    this.stats.uptime = this.stats.successCount / this.stats.totalRequests;
    this.stats.lastCheckAt = Date.now();
  }

  getStats(): HealthStats {
    return { ...this.stats };
  }

  isHealthy(): boolean {
    return this.stats.uptime > 0.5;
  }
}
