/**
 * NoxSoft ICO — Dual-chain token launch platform
 *
 * Bonding curve to $2M, then free market.
 * Free to launch. NoxSoft does its own ICO first.
 */

export {
  type TokenAllocation,
  type BondingCurveConfig,
  type TaxConfig,
  type Chain,
  type IcoLaunchConfig,
  type IcoStatus,
  type ChainStatus,
  NOXSOFT_TOKEN_ALLOCATION,
  NOXSOFT_TAX_CONFIG,
  NOXSOFT_ICO_CONFIG,
  DEFAULT_BONDING_CURVE,
  bondingCurvePrice,
  tokensForInvestment,
  totalRaisedAtSupply,
  isBondingCapReached,
  calculateTransferTax,
  calculateRevenueShare,
  createIcoStatus,
} from "./tokenomics.js";

export {
  type IcoProject,
  type IcoHolder,
  type IcoTransaction,
  type IcoDashboard,
  createIcoProject,
  getIcoProject,
  listIcoProjects,
  buyTokens,
  transferTokens,
  getIcoDashboard,
} from "./launch-platform.js";
