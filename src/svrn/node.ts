/**
 * ANIMA SVRNNode adapter.
 *
 * Wraps the @noxsoft/svrn-node package's SVRNNode class with the API
 * surface that ANIMA's repl commands and lifecycle hooks expect.
 *
 * The @noxsoft/svrn-node dependency is optional — if not installed,
 * all methods become no-ops returning sensible defaults.
 */

// Types we re-export (defined inline so they work without the package)
export interface SVRNNodeConfig {
  enabled: boolean;
  dataDir?: string;
  resources: {
    maxCpuPercent: number;
    maxRamMB: number;
    maxBandwidthMbps: number;
  };
  [key: string]: unknown;
}

export const DEFAULT_SVRN_CONFIG: SVRNNodeConfig = {
  enabled: false,
  resources: {
    maxCpuPercent: 10,
    maxRamMB: 256,
    maxBandwidthMbps: 5,
  },
};

// Lazy loader for @noxsoft/svrn-node — caches the result
let _svrnModule:
  | {
      SVRNNode: new (config: SVRNNodeConfig) => any;
      DEFAULT_CONFIG: SVRNNodeConfig;
      resolveConfig: (partial: Partial<SVRNNodeConfig>) => SVRNNodeConfig;
    }
  | null
  | undefined; // undefined = not yet attempted, null = failed

async function loadSVRNModule(): Promise<typeof _svrnModule> {
  if (_svrnModule !== undefined) {
    return _svrnModule;
  }

  try {
    const mod = await import("@noxsoft/svrn-node");
    _svrnModule = mod;
    return _svrnModule;
  } catch {
    _svrnModule = null;
    return null;
  }
}

/** Check whether @noxsoft/svrn-node is available (loadable). */
export async function isSVRNAvailable(): Promise<boolean> {
  const mod = await loadSVRNModule();
  return mod != null;
}

/** Adapter providing the API shape ANIMA's repl expects. */
export class SVRNNode {
  private inner: any = null;
  private config: SVRNNodeConfig;
  private _available = false;

  constructor(config: SVRNNodeConfig) {
    this.config = config;
  }

  /** Must be called after construction to attempt loading the module. */
  async init(): Promise<boolean> {
    const mod = await loadSVRNModule();
    if (mod) {
      this.inner = new mod.SVRNNode(this.config);
      this._available = true;
      return true;
    }
    return false;
  }

  /** Whether the underlying svrn-node module was loaded. */
  isAvailable(): boolean {
    return this._available;
  }

  async start(): Promise<void> {
    if (!this.inner) {
      return;
    }
    await this.inner.start();
  }

  async stop(): Promise<void> {
    if (!this.inner) {
      return;
    }
    await this.inner.stop();
  }

  getNodeId(): string {
    if (!this.inner) {
      return "unavailable";
    }
    return this.inner.getNodeId();
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Stats shape expected by ANIMA repl commands. */
  getStats(): {
    nodeId: string;
    running: boolean;
    paused: boolean;
    uptimeMs: number;
    tasksCompleted: number;
    tasksFailed: number;
    balance: number;
    sessionEarnings: number;
  } {
    if (!this.inner) {
      return {
        nodeId: "unavailable",
        running: false,
        paused: false,
        uptimeMs: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        balance: 0,
        sessionEarnings: 0,
      };
    }

    const status = this.inner.getStatus();
    const earnings = this.inner.getEarnings();
    const wallet = this.inner.getWallet();

    return {
      nodeId: status.nodeId,
      running: status.state === "running",
      paused: false, // npm SVRNNode doesn't expose paused state separately
      uptimeMs: status.uptime * 1000,
      tasksCompleted: earnings.tasksThisSession,
      tasksFailed: 0,
      balance: wallet.balance,
      sessionEarnings: earnings.session,
    };
  }

  /** Earnings adapter with method-based API for repl commands. */
  getEarnings(): {
    getTodayEarnings: () => { total: number; taskCount: number } | null;
    getBalanceValueUSD: () => number;
    getAllTimeEarned: () => number;
    getBalance: () => number;
  } {
    if (!this.inner) {
      return {
        getTodayEarnings: () => null,
        getBalanceValueUSD: () => 0,
        getAllTimeEarned: () => 0,
        getBalance: () => 0,
      };
    }

    const summary = this.inner.getEarnings();
    const wallet = this.inner.getWallet();

    return {
      getTodayEarnings: () =>
        summary.tasksToday > 0 ? { total: summary.today, taskCount: summary.tasksToday } : null,
      getBalanceValueUSD: () => wallet.balance * 0.001,
      getAllTimeEarned: () => summary.allTime,
      getBalance: () => wallet.balance,
    };
  }

  /** Monitor adapter with method-based API for repl commands. */
  getMonitor(): {
    getLatest: () => { cpuPercent: number; ramUsedMB: number } | null;
    getLimits: () => { maxCpuPercent: number; maxRamMB: number; maxBandwidthMbps: number };
  } {
    if (!this.inner) {
      return {
        getLatest: () => null,
        getLimits: () => ({
          maxCpuPercent: this.config.resources.maxCpuPercent,
          maxRamMB: this.config.resources.maxRamMB,
          maxBandwidthMbps: this.config.resources.maxBandwidthMbps,
        }),
      };
    }

    const resources = this.inner.getResources();

    return {
      getLatest: () => ({
        cpuPercent: resources.cpuPercent,
        ramUsedMB: resources.ramMB,
      }),
      getLimits: () => ({
        maxCpuPercent: this.config.resources.maxCpuPercent,
        maxRamMB: this.config.resources.maxRamMB,
        maxBandwidthMbps: this.config.resources.maxBandwidthMbps,
      }),
    };
  }

  /** Update resource limits at runtime. */
  updateLimits(
    limits: Partial<{
      maxCpuPercent: number;
      maxRamMB: number;
      maxBandwidthMbps: number;
    }>,
  ): void {
    if (limits.maxCpuPercent !== undefined) {
      this.config.resources.maxCpuPercent = limits.maxCpuPercent;
    }
    if (limits.maxRamMB !== undefined) {
      this.config.resources.maxRamMB = limits.maxRamMB;
    }
    if (limits.maxBandwidthMbps !== undefined) {
      this.config.resources.maxBandwidthMbps = limits.maxBandwidthMbps;
    }
  }
}
