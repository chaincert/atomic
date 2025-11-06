import { ethers } from 'ethers';
import { DexScanner } from './DexScanner';
import { Price, Reserves, LiquidityInfo, SwapQuote } from '../types/dex.types';
import { DexConfig } from '../types/config.types';
import { logger } from '../utils/logger';

// Uniswap V2 Pair ABI (minimal)
const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint256)',
];

// Uniswap V2 Factory ABI (minimal)
const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint256) external view returns (address pair)',
  'function allPairsLength() external view returns (uint256)',
];

// Uniswap V2 Router ABI (minimal)
const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] memory path) external view returns (uint[] memory amounts)',
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function balanceOf(address) external view returns (uint256)',
];

/**
 * Scanner for Uniswap V2 and compatible DEXs (SushiSwap, etc.)
 */
export class UniswapV2Scanner extends DexScanner {
  private factoryContract: ethers.Contract;
  private routerContract: ethers.Contract;
  private pairContracts: Map<string, ethers.Contract>;
  private tokenDecimals: Map<string, number>;

  constructor(config: DexConfig, provider: ethers.providers.Provider) {
    super(config, provider);
    this.pairContracts = new Map();
    this.tokenDecimals = new Map();
    
    // Initialize contracts
    this.factoryContract = new ethers.Contract(config.factory, FACTORY_ABI, provider);
    this.routerContract = new ethers.Contract(config.router, ROUTER_ABI, provider);
  }

  /**
   * Initialize Uniswap V2 specific functionality
   */
  protected async initializeDexSpecific(): Promise<void> {
    try {
      // Verify factory is accessible
      const allPairsLength = await this.factoryContract.allPairsLength();
      logger.info(`${this.config.name} factory verified`, {
        totalPairs: allPairsLength.toString(),
      });
    } catch (error) {
      throw new Error(`Failed to initialize ${this.config.name}: ${error}`);
    }
  }

  /**
   * Get price for token pair
   */
  async getPrice(tokenA: string, tokenB: string): Promise<Price> {
    try {
      const pairAddress = await this.getPairAddress(tokenA, tokenB);
      if (pairAddress === ethers.constants.AddressZero) {
        throw new Error(`No pair exists for ${tokenA}/${tokenB}`);
      }

      const reserves = await this.getReserves(pairAddress);
      const decimalsA = await this.getTokenDecimals(tokenA);
      const decimalsB = await this.getTokenDecimals(tokenB);

      const { token0 } = this.sortTokens(tokenA, tokenB);
      const isToken0 = token0.toLowerCase() === tokenA.toLowerCase();

      const { price, inversePrice } = this.calculatePrice(
        isToken0 ? reserves.reserve0 : reserves.reserve1,
        isToken0 ? reserves.reserve1 : reserves.reserve0,
        isToken0 ? decimalsA : decimalsB,
        isToken0 ? decimalsB : decimalsA
      );

      const blockNumber = await this.provider.getBlockNumber();

      return {
        tokenA,
        tokenB,
        price: isToken0 ? price : inversePrice,
        inversePrice: isToken0 ? inversePrice : price,
        blockNumber,
        timestamp: Date.now(),
        source: this.config.name,
        poolAddress: pairAddress,
      };
    } catch (error) {
      logger.error('Failed to get price', {
        dex: this.config.name,
        tokenA,
        tokenB,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get reserves for a liquidity pool
   */
  async getReserves(poolAddress: string): Promise<Reserves> {
    try {
      const pairContract = this.getPairContract(poolAddress);
      const [reserve0, reserve1, blockTimestampLast] = await pairContract.getReserves();
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();

      return {
        reserve0: ethers.BigNumber.from(reserve0),
        reserve1: ethers.BigNumber.from(reserve1),
        token0,
        token1,
        blockTimestampLast: blockTimestampLast.toNumber(),
        poolAddress,
      };
    } catch (error) {
      logger.error('Failed to get reserves', {
        dex: this.config.name,
        poolAddress,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get liquidity information for token pair
   */
  async getLiquidity(tokenA: string, tokenB: string): Promise<LiquidityInfo> {
    try {
      const pairAddress = await this.getPairAddress(tokenA, tokenB);
      if (pairAddress === ethers.constants.AddressZero) {
        throw new Error(`No pair exists for ${tokenA}/${tokenB}`);
      }

      const reserves = await this.getReserves(pairAddress);
      const { token0 } = this.sortTokens(tokenA, tokenB);
      const isToken0 = token0.toLowerCase() === tokenA.toLowerCase();

      // Liquidity is the amount of tokenA in the pool
      const liquidity = isToken0 ? reserves.reserve0 : reserves.reserve1;

      return {
        tokenA,
        tokenB,
        liquidity,
        dex: this.config.name,
        poolAddress: pairAddress,
      };
    } catch (error) {
      logger.error('Failed to get liquidity', {
        dex: this.config.name,
        tokenA,
        tokenB,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get swap quote
   */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: ethers.BigNumber
  ): Promise<SwapQuote> {
    try {
      const path = [tokenIn, tokenOut];
      const amounts = await this.routerContract.getAmountsOut(amountIn, path);
      const amountOut = ethers.BigNumber.from(amounts[amounts.length - 1]);

      // Get reserves to calculate price impact
      const pairAddress = await this.getPairAddress(tokenIn, tokenOut);
      const reserves = await this.getReserves(pairAddress);
      
      const { token0 } = this.sortTokens(tokenIn, tokenOut);
      const isToken0 = token0.toLowerCase() === tokenIn.toLowerCase();
      
      const reserveIn = isToken0 ? reserves.reserve0 : reserves.reserve1;
      const reserveOut = isToken0 ? reserves.reserve1 : reserves.reserve0;

      const priceImpact = this.calculatePriceImpact(amountIn, reserveIn, reserveOut);

      // Estimate gas (typical Uniswap V2 swap)
      const gasEstimate = ethers.BigNumber.from(150000);

      return {
        amountIn,
        amountOut,
        priceImpact,
        path: {
          tokenIn,
          tokenOut,
          path,
          poolAddresses: [pairAddress],
          dex: this.config.name,
        },
        gasEstimate,
      };
    } catch (error) {
      logger.error('Failed to get quote', {
        dex: this.config.name,
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Subscribe to price updates
   * Note: This requires WebSocket provider
   */
  subscribeToPriceUpdates(
    tokenA: string,
    tokenB: string,
    callback: (price: Price) => void
  ): void {
    try {
      this.getPairAddress(tokenA, tokenB).then((pairAddress) => {
        if (pairAddress === ethers.constants.AddressZero) {
          logger.warn('Cannot subscribe: pair does not exist', { tokenA, tokenB });
          return;
        }

        const pairContract = this.getPairContract(pairAddress);

        // Listen for Sync events (emitted on every swap)
        pairContract.on('Sync', async () => {
          try {
            const price = await this.getPrice(tokenA, tokenB);
            callback(price);
          } catch (error) {
            logger.error('Error in price update callback', {
              dex: this.config.name,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        });

        logger.info('Subscribed to price updates', {
          dex: this.config.name,
          tokenA,
          tokenB,
          pairAddress,
        });
      });
    } catch (error) {
      logger.error('Failed to subscribe to price updates', {
        dex: this.config.name,
        tokenA,
        tokenB,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Unsubscribe from all updates
   */
  unsubscribe(): void {
    try {
      // Remove all listeners from all pair contracts
      this.pairContracts.forEach((contract) => {
        contract.removeAllListeners();
      });
      logger.info('Unsubscribed from all price updates', { dex: this.config.name });
    } catch (error) {
      logger.error('Failed to unsubscribe', {
        dex: this.config.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get pair address for token pair
   */
  private async getPairAddress(tokenA: string, tokenB: string): Promise<string> {
    try {
      const pairAddress = await this.factoryContract.getPair(tokenA, tokenB);
      return pairAddress;
    } catch (error) {
      logger.error('Failed to get pair address', {
        dex: this.config.name,
        tokenA,
        tokenB,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get or create pair contract instance
   */
  private getPairContract(pairAddress: string): ethers.Contract {
    if (!this.pairContracts.has(pairAddress)) {
      const contract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
      this.pairContracts.set(pairAddress, contract);
    }
    return this.pairContracts.get(pairAddress)!;
  }

  /**
   * Get token decimals (with caching)
   */
  private async getTokenDecimals(tokenAddress: string): Promise<number> {
    if (!this.tokenDecimals.has(tokenAddress)) {
      try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
        const decimals = await tokenContract.decimals();
        this.tokenDecimals.set(tokenAddress, decimals);
      } catch (error) {
        logger.warn('Failed to get token decimals, using default 18', {
          token: tokenAddress,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.tokenDecimals.set(tokenAddress, 18);
      }
    }
    return this.tokenDecimals.get(tokenAddress)!;
  }
}