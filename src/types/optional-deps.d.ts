declare module "@homebridge/ciao" {
  export interface CiaoService {
    advertise(): Promise<void>;
    destroy(): Promise<void>;
    getFQDN(): string;
    getHostname(): string;
    getPort(): number;
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    serviceState: string;
  }

  export const Protocol: {
    TCP: string;
    UDP?: string;
  };

  export function getResponder(): {
    createService(options: Record<string, unknown>): CiaoService;
    shutdown?: () => Promise<void>;
  };
}

declare module "long" {
  const Long: unknown;
  export default Long;
}

declare module "@noxsoft/svrn-node" {
  export type SVRNNodeConfig = {
    enabled: boolean;
    nodeId?: string;
    dataDir?: string;
    coordinatorUrl?: string;
    resources: {
      maxCpuPercent: number;
      maxRamMB: number;
      maxBandwidthMbps: number;
      maxDiskGB?: number;
    };
    taskTypes?: Array<"ping" | "relay" | "compute" | "store" | "validate">;
    autoUpdate?: {
      enabled?: boolean;
      checkIntervalHours?: number;
      autoRestart?: boolean;
      channel?: "stable" | "beta";
    };
    heartbeatIntervalSec?: number;
    showEarnings?: boolean;
    activeHours?: { start?: number; end?: number };
    [key: string]: unknown;
  };

  export const DEFAULT_CONFIG: SVRNNodeConfig;
  export function resolveConfig(partial: Partial<SVRNNodeConfig>): SVRNNodeConfig;
  export class SVRNNode {
    constructor(config: SVRNNodeConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    getNodeId(): string;
    getStatus(): { nodeId: string; state: string; uptime: number };
    getEarnings(): {
      tasksThisSession: number;
      tasksToday: number;
      today: number;
      allTime: number;
      session: number;
      estimatedMonthlySavingsUSD?: number;
    };
    getWallet(): {
      balance?: number;
      getAddress?: () => string;
      getBalance?: () => number;
      getTotalEarned?: () => number;
      getTotalSpent?: () => number;
      getCreatedAt?: () => string | null;
      getRecentTransactions?: (limit: number) => Array<{
        type: "earn" | "spend";
        amount: number;
        description?: string;
        timestamp: number;
      }>;
    };
    getResources(): { cpuPercent: number; ramMB: number; bandwidthMbps?: number };
  }
}
