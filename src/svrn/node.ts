/**
 * ANIMA SVRNNode adapter.
 *
 * Wraps the @noxsoft/svrn-node package's SVRNNode class with the API
 * surface that ANIMA's repl commands and lifecycle hooks expect.
 */

import {
  SVRNNode as BaseSVRNNode,
  DEFAULT_CONFIG,
  type SVRNNodeConfig,
  type ResourceSnapshot,
  type EarningsSummary,
} from "@noxsoft/svrn-node";

export { DEFAULT_CONFIG as DEFAULT_SVRN_CONFIG };
export type { SVRNNodeConfig };

/** Adapter providing the API shape ANIMA's repl expects. */
export class SVRNNode {
  private inner: BaseSVRNNode;
  private config: SVRNNodeConfig;

  constructor(config: SVRNNodeConfig) {
    this.config = config;
    this.inner = new BaseSVRNNode(config);
  }

  async start(): Promise<void> {
    await this.inner.start();
  }

  async stop(): Promise<void> {
    await this.inner.stop();
  }

  getNodeId(): string {
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
    const summary = this.inner.getEarnings();
    const wallet = this.inner.getWallet();

    return {
      getTodayEarnings: () =>
        summary.tasksToday > 0
          ? { total: summary.today, taskCount: summary.tasksToday }
          : null,
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
  updateLimits(limits: Partial<{
    maxCpuPercent: number;
    maxRamMB: number;
    maxBandwidthMbps: number;
  }>): void {
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
