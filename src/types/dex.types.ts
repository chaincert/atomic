import { BigNumber } from 'ethers';

/**
 * DEX-related type definitions
 */

export interface Price {
  tokenA: string;
  tokenB: string;
  price: BigNumber; // Price of tokenB in terms of tokenA
  inversePrice: BigNumber; // Price of tokenA in terms of tokenB
  blockNumber: number;
  timestamp: number;
  source: string; // DEX name
  poolAddress?: string;
}

export interface Reserves {
  reserve0: BigNumber;
  reserve1: BigNumber;
  token0: string;
  token1: string;
  blockTimestampLast: number;
  poolAddress: string;
}

export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  reserves: Reserves;
  fee: number; // in basis points
  dexType: string;
}

export interface LiquidityInfo {
  tokenA: string;
  tokenB: string;
  liquidity: BigNumber;
  dex: string;
  poolAddress: string;
}

export interface SwapPath {
  tokenIn: string;
  tokenOut: string;
  path: string[]; // Array of token addresses in the swap path
  poolAddresses: string[]; // Array of pool addresses
  dex: string;
}

export interface SwapQuote {
  amountIn: BigNumber;
  amountOut: BigNumber;
  priceImpact: number; // in percentage
  path: SwapPath;
  gasEstimate: BigNumber;
}

export interface DexScanner {
  initialize(config: any): Promise<void>;
  getPrice(tokenA: string, tokenB: string): Promise<Price>;
  getReserves(poolAddress: string): Promise<Reserves>;
  getLiquidity(tokenA: string, tokenB: string): Promise<LiquidityInfo>;
  getQuote(tokenIn: string, tokenOut: string, amountIn: BigNumber): Promise<SwapQuote>;
  subscribeToPriceUpdates(
    tokenA: string,
    tokenB: string,
    callback: (price: Price) => void
  ): void;
  unsubscribe(): void;
}

export interface DexInfo {
  name: string;
  type: 'UniswapV2' | 'UniswapV3' | 'SushiSwap' | 'Balancer';
  router: string;
  factory: string;
  feePercentage: number;
}