/**
 * Configuration type definitions for the Atomic Arbitrage Bot
 */

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  rpcUrls?: string[]; // Fallback RPCs
  wsUrl?: string; // WebSocket URL
  explorerUrl: string;
  arbitrageContract: string;
  flashLoanProviders: FlashLoanProviders;
  dexes: DexesConfig;
  execution: ExecutionConfig;
  flashbots?: FlashbotsConfig;
}

export interface FlashLoanProviders {
  aave?: {
    pool: string;
    feePercentage: number; // e.g., 0.09 for 0.09%
  };
  balancer?: {
    vault: string;
    feePercentage: number;
  };
}

export interface DexesConfig {
  uniswapV2?: DexConfig;
  sushiswap?: DexConfig;
  uniswapV3?: UniswapV3Config;
}

export interface DexConfig {
  name: string;
  type: DexType;
  router: string;
  factory: string;
  subgraphUrl?: string;
  feePercentage: number; // in basis points (e.g., 30 = 0.3%)
}

export interface UniswapV3Config extends DexConfig {
  quoter?: string;
  feeTiers?: number[]; // e.g., [500, 3000, 10000] for 0.05%, 0.3%, 1%
}

export type DexType = 'UniswapV2' | 'UniswapV3' | 'SushiSwap' | 'Balancer';

export interface ExecutionConfig {
  minProfitUSD: number;
  minProfitPercentage: number;
  maxGasPrice: string; // in Gwei
  maxSlippage: number; // in basis points
  maxTradeSize: string; // in ETH or base token
  confirmations: number;
  enableSimulation: boolean;
  dryRun: boolean;
}

export interface FlashbotsConfig {
  relayUrl: string;
  authSignerKey: string;
}

export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  minLiquidity: string; // Minimum liquidity to consider
  maxPriceImpact: number; // Maximum acceptable price impact
  pairs: TokenPairConfig[];
}

export interface TokenPairConfig {
  token: string;
  dexes: string[];
}

export interface MonitoringConfig {
  redisUrl: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  metricsPort: number;
  alerting: AlertConfig;
}

export interface AlertConfig {
  telegram?: {
    botToken: string;
    chatId: string;
  };
  alertOnProfit: boolean;
  alertOnError: boolean;
  minProfitForAlert: number;
}

export interface BotConfig {
  network: NetworkConfig;
  monitoring: MonitoringConfig;
  privateKey: string;
  maxConcurrentOpportunities: number;
  cacheEnabled: boolean;
  cacheTTL: number;
}