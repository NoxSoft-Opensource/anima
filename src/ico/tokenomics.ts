/**
 * NoxSoft ICO Tokenomics — allocation, bonding curve, and revenue share
 *
 * Dual ICO: SVRN chain + Ethereum
 * Bonding curve to $2M cap, then free market
 * This is our runway for 2 years.
 *
 * IMPORTANT: These are REVENUE TOKENS, not equity.
 * Token holders receive a share of platform revenue, not ownership.
 * No lending mechanism — lending concept was scratched.
 */

// ---------------------------------------------------------------------------
// Token Allocation
// ---------------------------------------------------------------------------

export type TokenType = "revenue"; // Revenue tokens only — NOT equity, NO lending

export interface TokenAllocation {
  /** Team allocation (personal spending, proportional to stock) */
  team: number;
  /** Company round (raise for operations) */
  companyRound: number;
  /** Revenue share for holders — holders get % of platform revenue */
  revenueShare: number;
  /** Universal Basic Compute generation */
  ubc: number;
}

export const NOXSOFT_TOKEN_ALLOCATION: TokenAllocation = {
  team: 0.05, // 5%
  companyRound: 0.3, // 30%
  revenueShare: 0.5, // 50%
  ubc: 0.15, // 15%
};

// ---------------------------------------------------------------------------
// Bonding Curve
// ---------------------------------------------------------------------------

export interface BondingCurveConfig {
  /** Target raise amount in USD */
  targetRaiseUsd: number;
  /** Total token supply */
  totalSupply: bigint;
  /** Reserve ratio (0-1, controls curve steepness) */
  reserveRatio: number;
  /** Initial price per token in USD */
  initialPriceUsd: number;
  /** Whether bonding curve is active (false = free market) */
  bondingActive: boolean;
}

export const DEFAULT_BONDING_CURVE: BondingCurveConfig = {
  targetRaiseUsd: 2_000_000, // $2M
  totalSupply: 1_000_000_000n, // 1B tokens
  reserveRatio: 0.5, // Bancor-style 50% reserve
  initialPriceUsd: 0.001, // $0.001 per token at launch
  bondingActive: true,
};

/**
 * Calculate token price at a given supply point on the bonding curve.
 * Uses a simple power curve: price = initialPrice * (supply / totalSupply) ^ (1/reserveRatio - 1)
 */
export function bondingCurvePrice(
  currentSupply: number,
  config: BondingCurveConfig = DEFAULT_BONDING_CURVE,
): number {
  if (!config.bondingActive) {
    return 0; // Free market — price determined by exchange
  }
  const supplyRatio = currentSupply / Number(config.totalSupply);
  const exponent = 1 / config.reserveRatio - 1;
  return config.initialPriceUsd * Math.pow(supplyRatio, exponent);
}

/**
 * Calculate how many tokens you get for a given USD investment.
 */
export function tokensForInvestment(
  investmentUsd: number,
  currentSupply: number,
  config: BondingCurveConfig = DEFAULT_BONDING_CURVE,
): number {
  // Numerical integration (simple trapezoidal approximation)
  const steps = 1000;
  let totalTokens = 0;
  let remainingUsd = investmentUsd;
  let supply = currentSupply;

  for (let i = 0; i < steps && remainingUsd > 0; i++) {
    const price = bondingCurvePrice(supply, config);
    if (price <= 0) {
      break;
    }

    const stepTokens = Math.min(remainingUsd / price, Number(config.totalSupply) / steps);
    const stepCost = stepTokens * price;

    totalTokens += stepTokens;
    remainingUsd -= stepCost;
    supply += stepTokens;
  }

  return Math.floor(totalTokens);
}

/**
 * Calculate total raised at a given supply point.
 */
export function totalRaisedAtSupply(
  supply: number,
  config: BondingCurveConfig = DEFAULT_BONDING_CURVE,
): number {
  // Integrate the price function from 0 to supply
  const steps = 1000;
  let totalRaised = 0;
  const stepSize = supply / steps;

  for (let i = 0; i < steps; i++) {
    const s = i * stepSize;
    const price = bondingCurvePrice(s, config);
    totalRaised += price * stepSize;
  }

  return totalRaised;
}

/**
 * Check if bonding curve cap has been reached.
 */
export function isBondingCapReached(
  currentRaisedUsd: number,
  config: BondingCurveConfig = DEFAULT_BONDING_CURVE,
): boolean {
  return currentRaisedUsd >= config.targetRaiseUsd;
}

// ---------------------------------------------------------------------------
// Tax & Revenue Share
// ---------------------------------------------------------------------------

export interface TaxConfig {
  /** Tax rate on all token sales and transfers */
  transferTaxRate: number;
  /** Revenue share rate for holders */
  revenueShareRate: number;
  /** Revenue share duration in years */
  revenueShareDurationYears: number;
}

export const NOXSOFT_TAX_CONFIG: TaxConfig = {
  transferTaxRate: 0.01, // 1%
  revenueShareRate: 0.05, // 5%
  revenueShareDurationYears: 2,
};

/**
 * Calculate tax on a transfer.
 */
export function calculateTransferTax(
  amountTokens: number,
  config: TaxConfig = NOXSOFT_TAX_CONFIG,
): { tax: number; net: number } {
  const tax = Math.floor(amountTokens * config.transferTaxRate);
  return { tax, net: amountTokens - tax };
}

/**
 * Calculate revenue share distribution for a given revenue amount.
 */
export function calculateRevenueShare(
  revenueUsd: number,
  config: TaxConfig = NOXSOFT_TAX_CONFIG,
): number {
  return revenueUsd * config.revenueShareRate;
}

// ---------------------------------------------------------------------------
// ICO Launch Configuration
// ---------------------------------------------------------------------------

export type Chain = "svrn" | "ethereum";

export interface IcoLaunchConfig {
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Chains to launch on */
  chains: Chain[];
  /** Bonding curve config */
  bondingCurve: BondingCurveConfig;
  /** Token allocation */
  allocation: TokenAllocation;
  /** Tax config */
  tax: TaxConfig;
  /** Launch fee (NoxSoft charges nothing) */
  launchFee: number;
  /** Whether this is the NoxSoft ICO itself */
  isNoxSoftIco: boolean;
}

export const NOXSOFT_ICO_CONFIG: IcoLaunchConfig = {
  name: "NoxSoft Token",
  symbol: "NOX",
  chains: ["svrn", "ethereum"],
  bondingCurve: DEFAULT_BONDING_CURVE,
  allocation: NOXSOFT_TOKEN_ALLOCATION,
  tax: NOXSOFT_TAX_CONFIG,
  launchFee: 0, // Free to launch
  isNoxSoftIco: true,
};

// ---------------------------------------------------------------------------
// ICO Status
// ---------------------------------------------------------------------------

export interface IcoStatus {
  config: IcoLaunchConfig;
  currentSupply: number;
  totalRaisedUsd: number;
  currentPriceUsd: number;
  bondingActive: boolean;
  percentToTarget: number;
  holders: number;
  launchedAt: number;
  chainStatus: Record<Chain, ChainStatus>;
}

export interface ChainStatus {
  chain: Chain;
  contractAddress: string;
  deployed: boolean;
  blockNumber: number;
  txCount: number;
}

/**
 * Create an initial ICO status.
 */
export function createIcoStatus(config: IcoLaunchConfig): IcoStatus {
  return {
    config,
    currentSupply: 0,
    totalRaisedUsd: 0,
    currentPriceUsd: config.bondingCurve.initialPriceUsd,
    bondingActive: true,
    percentToTarget: 0,
    holders: 0,
    launchedAt: Date.now(),
    chainStatus: {
      svrn: { chain: "svrn", contractAddress: "", deployed: false, blockNumber: 0, txCount: 0 },
      ethereum: {
        chain: "ethereum",
        contractAddress: "",
        deployed: false,
        blockNumber: 0,
        txCount: 0,
      },
    },
  };
}
