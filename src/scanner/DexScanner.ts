import { ethers } from 'ethers';
import { Price, Reserves, LiquidityInfo, SwapQuote, DexScanner as IDexScanner } from '../types/dex.types';
import { DexConfig } from '../types/config.types';
import { logger } from '../utils/logger';

/**
 * Abstract base class for DEX scanners
 * All DEX-specific scanners should extend this class
 */
export abstract class DexScanner implements IDexScanner {
  protected provider: ethers.providers.Provider;
  protected config: DexConfig;
  protected isInitialized: boolean = false;

  constructor(config: DexConfig, provider: ethers.providers.Provider) {
    this.config = config;
    this.provider = provider;
  }

  /**
   * Initialize the scanner
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Scanner already initialized', { dex: this.config.name });
      return;
    }

    try {
      await this.validateProvider();
      await this.initializeDexSpecific();
      this.isInitialized = true;
      
      logger.info('Scanner initialized', {
        dex: this.config.name,
        type: this.config.type,
      });
    } catch (error) {
      logger.error('Failed to initialize scanner', {
        dex: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Validate provider connection
   */
  private async validateProvider(): Promise<void> {
    try {
      await this.provider.getBlockNumber();
    } catch (error) {
      throw new Error(`Provider connection failed: ${error}`);
    }
  }

  /**
   * DEX-specific initialization (to be implemented by subclasses)
   */
  protected abstract initializeDexSpecific(): Promise<void>;

  /**
   * Get price for token pair
   */
  abstract getPrice(tokenA: string, tokenB: string): Promise<Price>;

  /**
   * Get reserves for a liquidity pool
   */
  abstract getReserves(poolAddress: string): Promise<Reserves>;

  /**
   * Get liquidity information for token pair
   */
  abstract getLiquidity(tokenA: string, tokenB: string): Promise<LiquidityInfo>;

  /**
   * Get swap quote
   */
  abstract getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: ethers.BigNumber
  ): Promise<SwapQuote>;

  /**
   * Subscribe to price updates
   */
  abstract subscribeToPriceUpdates(
    tokenA: string,
    tokenB: string,
    callback: (price: Price) => void
  ): void;

  /**
   * Unsubscribe from all updates
   */
  abstract unsubscribe(): void;

  /**
   * Check if scanner is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get DEX configuration
   */
  public getConfig(): DexConfig {
    return this.config;
  }

  /**
   * Get DEX name
   */
  public getName(): string {
    return this.config.name;
  }

  /**
   * Get DEX type
   */
  public getType(): string {
    return this.config.type;
  }

  /**
   * Calculate price from reserves
   */
  protected calculatePrice(
    reserve0: ethers.BigNumber,
    reserve1: ethers.BigNumber,
    decimals0: number,
    decimals1: number
  ): { price: ethers.BigNumber; inversePrice: ethers.BigNumber } {
    // Adjust for decimals
    const adjustedReserve0 = reserve0.mul(ethers.BigNumber.from(10).pow(18 - decimals0));
    const adjustedReserve1 = reserve1.mul(ethers.BigNumber.from(10).pow(18 - decimals1));

    // Price = reserve1 / reserve0
    const price = adjustedReserve1.mul(ethers.constants.WeiPerEther).div(adjustedReserve0);
    
    // Inverse price = reserve0 / reserve1
    const inversePrice = adjustedReserve0.mul(ethers.constants.WeiPerEther).div(adjustedReserve1);

    return { price, inversePrice };
  }

  /**
   * Calculate price impact for a trade
   */
  protected calculatePriceImpact(
    amountIn: ethers.BigNumber,
    reserveIn: ethers.BigNumber,
    reserveOut: ethers.BigNumber
  ): number {
    // Price impact = (amountIn / reserveIn) * 100
    const impact = amountIn.mul(10000).div(reserveIn).toNumber() / 100;
    return impact;
  }

  /**
   * Calculate output amount with fees
   */
  protected calculateAmountOut(
    amountIn: ethers.BigNumber,
    reserveIn: ethers.BigNumber,
    reserveOut: ethers.BigNumber,
    feeBasisPoints: number = 30 // Default 0.3%
  ): ethers.BigNumber {
    // amountInWithFee = amountIn * (10000 - fee)
    const amountInWithFee = amountIn.mul(10000 - feeBasisPoints);
    
    // numerator = amountInWithFee * reserveOut
    const numerator = amountInWithFee.mul(reserveOut);
    
    // denominator = (reserveIn * 10000) + amountInWithFee
    const denominator = reserveIn.mul(10000).add(amountInWithFee);
    
    // amountOut = numerator / denominator
    return numerator.div(denominator);
  }

  /**
   * Sort tokens to match Uniswap's token0/token1 convention
   */
  protected sortTokens(tokenA: string, tokenB: string): { token0: string; token1: string } {
    const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
    const token1 = token0 === tokenA ? tokenB : tokenA;
    return { token0, token1 };
  }

  /**
   * Validate Ethereum address
   */
  protected validateAddress(address: string): boolean {
    return ethers.utils.isAddress(address);
  }

  /**
   * Format address to checksum format
   */
  protected toChecksumAddress(address: string): string {
    return ethers.utils.getAddress(address);
  }
}