import { DexScanner } from './DexScanner';
import { Price } from '../types/dex.types';
import { ArbitrageOpportunity } from '../types/arbitrage.types';
import { logger } from '../utils/logger';
import { ethers } from 'ethers';

/**
 * PriceAggregator - Combines data from multiple DEX scanners to detect arbitrage opportunities
 */
export class PriceAggregator {
  private scanners: Map<string, DexScanner>;
  private monitoredPairs: Set<string>;
  private isMonitoring: boolean = false;
  private opportunityCallbacks: Array<(opportunity: ArbitrageOpportunity) => void> = [];

  constructor(scanners: DexScanner[]) {
    this.scanners = new Map();
    this.monitoredPairs = new Set();

    // Register all scanners
    scanners.forEach((scanner) => {
      this.scanners.set(scanner.getName(), scanner);
    });

    logger.info('PriceAggregator initialized', {
      scannerCount: this.scanners.size,
      scanners: Array.from(this.scanners.keys()),
    });
  }

  /**
   * Add a token pair to monitor
   */
  addPair(tokenA: string, tokenB: string): void {
    const pairKey = this.getPairKey(tokenA, tokenB);
    this.monitoredPairs.add(pairKey);
    
    logger.info('Pair added to monitoring', {
      tokenA,
      tokenB,
      totalPairs: this.monitoredPairs.size,
    });
  }

  /**
   * Add multiple pairs to monitor
   */
  addPairs(pairs: Array<{ tokenA: string; tokenB: string }>): void {
    pairs.forEach(({ tokenA, tokenB }) => this.addPair(tokenA, tokenB));
  }

  /**
   * Remove a pair from monitoring
   */
  removePair(tokenA: string, tokenB: string): void {
    const pairKey = this.getPairKey(tokenA, tokenB);
    this.monitoredPairs.delete(pairKey);
    
    logger.info('Pair removed from monitoring', {
      tokenA,
      tokenB,
      remainingPairs: this.monitoredPairs.size,
    });
  }

  /**
   * Detect arbitrage opportunities across all monitored pairs
   */
  async detectOpportunities(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    try {
      logger.debug('Scanning for opportunities', {
        pairs: this.monitoredPairs.size,
        scanners: this.scanners.size,
      });

      // Scan each monitored pair
      for (const pairKey of this.monitoredPairs) {
        const [tokenA, tokenB] = this.parsePairKey(pairKey);
        
        try {
          const pairOpportunities = await this.detectOpportunitiesForPair(tokenA, tokenB);
          opportunities.push(...pairOpportunities);
        } catch (error) {
          logger.warn('Failed to scan pair', {
            tokenA,
            tokenB,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (opportunities.length > 0) {
        logger.info('Opportunities detected', {
          count: opportunities.length,
          pairs: opportunities.map((o) => `${o.tokenIn}/${o.tokenOut}`),
        });
      }

      return opportunities;
    } catch (error) {
      logger.error('Failed to detect opportunities', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Detect opportunities for a specific token pair
   */
  async detectOpportunitiesForPair(
    tokenA: string,
    tokenB: string
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const prices: Map<string, Price> = new Map();

    // Fetch prices from all scanners
    for (const [dexName, scanner] of this.scanners) {
      try {
        if (!scanner.isReady()) {
          logger.warn('Scanner not ready', { dex: dexName });
          continue;
        }

        const price = await scanner.getPrice(tokenA, tokenB);
        prices.set(dexName, price);
      } catch (error) {
        logger.debug('Failed to get price from scanner', {
          dex: dexName,
          tokenA,
          tokenB,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Need at least 2 prices to compare
    if (prices.size < 2) {
      return opportunities;
    }

    // Compare all price pairs to find arbitrage opportunities
    const dexNames = Array.from(prices.keys());
    
    for (let i = 0; i < dexNames.length; i++) {
      for (let j = i + 1; j < dexNames.length; j++) {
        const dex1 = dexNames[i];
        const dex2 = dexNames[j];
        
        const price1 = prices.get(dex1)!;
        const price2 = prices.get(dex2)!;

        // Check if arbitrage is possible in either direction
        const opportunity1 = this.createOpportunityIfProfitable(
          tokenA,
          tokenB,
          dex1,
          dex2,
          price1,
          price2
        );
        
        if (opportunity1) {
          opportunities.push(opportunity1);
        }

        const opportunity2 = this.createOpportunityIfProfitable(
          tokenA,
          tokenB,
          dex2,
          dex1,
          price2,
          price1
        );
        
        if (opportunity2) {
          opportunities.push(opportunity2);
        }
      }
    }

    return opportunities;
  }

  /**
   * Create an opportunity if the price difference is profitable
   */
  private createOpportunityIfProfitable(
    tokenA: string,
    tokenB: string,
    buyDex: string,
    sellDex: string,
    buyPrice: Price,
    sellPrice: Price
  ): ArbitrageOpportunity | null {
    // Check if there's a profitable price difference
    // Buy on buyDex (lower price), sell on sellDex (higher price)
    
    if (sellPrice.price.lte(buyPrice.price)) {
      // No opportunity - sell price is not higher than buy price
      return null;
    }

    // Calculate price difference percentage
    const priceDiff = sellPrice.price.sub(buyPrice.price);
    const diffPercentage = priceDiff.mul(10000).div(buyPrice.price).toNumber() / 100;

    // Minimum threshold to consider (0.5% to cover fees)
    const minDiffPercentage = 0.5;
    
    if (diffPercentage < minDiffPercentage) {
      return null;
    }

    // Get liquidity information
    const availableLiquidity = ethers.utils.parseEther('10'); // Placeholder - should fetch real liquidity

    const opportunity: ArbitrageOpportunity = {
      id: this.generateOpportunityId(tokenA, tokenB, buyDex, sellDex),
      tokenIn: tokenA,
      tokenOut: tokenB,
      buyDex,
      sellDex,
      buyPrice: buyPrice.price,
      sellPrice: sellPrice.price,
      buyPoolAddress: buyPrice.poolAddress || ethers.constants.AddressZero,
      sellPoolAddress: sellPrice.poolAddress || ethers.constants.AddressZero,
      availableLiquidity,
      timestamp: Date.now(),
      blockNumber: Math.max(buyPrice.blockNumber, sellPrice.blockNumber),
      estimatedProfit: priceDiff,
    };

    logger.debug('Opportunity created', {
      tokenA,
      tokenB,
      buyDex,
      sellDex,
      diffPercentage: diffPercentage.toFixed(2),
    });

    return opportunity;
  }

  /**
   * Start continuous monitoring for opportunities
   */
  async monitorContinuously(
    callback: (opportunity: ArbitrageOpportunity) => void,
    intervalMs: number = 12000 // Default: every block (~12 seconds)
  ): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Already monitoring');
      return;
    }

    this.isMonitoring = true;
    this.opportunityCallbacks.push(callback);

    logger.info('Started continuous monitoring', {
      intervalMs,
      pairs: this.monitoredPairs.size,
      scanners: this.scanners.size,
    });

    while (this.isMonitoring) {
      try {
        const opportunities = await this.detectOpportunities();
        
        // Call all registered callbacks for each opportunity
        for (const opportunity of opportunities) {
          for (const cb of this.opportunityCallbacks) {
            try {
              cb(opportunity);
            } catch (error) {
              logger.error('Error in opportunity callback', {
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }
      } catch (error) {
        logger.error('Error in monitoring loop', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Wait for next interval
      await this.sleep(intervalMs);
    }
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    logger.info('Stopped continuous monitoring');
  }

  /**
   * Subscribe to price updates from all scanners (event-based monitoring)
   */
  subscribeToUpdates(callback: (opportunity: ArbitrageOpportunity) => void): void {
    this.opportunityCallbacks.push(callback);

    // Subscribe to price updates from each scanner for each pair
    for (const pairKey of this.monitoredPairs) {
      const [tokenA, tokenB] = this.parsePairKey(pairKey);
      
      for (const [dexName, scanner] of this.scanners) {
        try {
          scanner.subscribeToPriceUpdates(tokenA, tokenB, async () => {
            // When price updates, check for opportunities
            const opportunities = await this.detectOpportunitiesForPair(tokenA, tokenB);
            
            for (const opportunity of opportunities) {
              for (const cb of this.opportunityCallbacks) {
                try {
                  cb(opportunity);
                } catch (error) {
                  logger.error('Error in opportunity callback', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              }
            }
          });
        } catch (error) {
          logger.warn('Failed to subscribe to price updates', {
            dex: dexName,
            tokenA,
            tokenB,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    logger.info('Subscribed to price updates', {
      pairs: this.monitoredPairs.size,
      scanners: this.scanners.size,
    });
  }

  /**
   * Unsubscribe from all updates
   */
  unsubscribe(): void {
    for (const scanner of this.scanners.values()) {
      scanner.unsubscribe();
    }
    this.opportunityCallbacks = [];
    logger.info('Unsubscribed from all updates');
  }

  /**
   * Get all registered scanners
   */
  getScanners(): Map<string, DexScanner> {
    return this.scanners;
  }

  /**
   * Get scanner by name
   */
  getScanner(name: string): DexScanner | undefined {
    return this.scanners.get(name);
  }

  /**
   * Get monitored pairs
   */
  getMonitoredPairs(): Array<{ tokenA: string; tokenB: string }> {
    return Array.from(this.monitoredPairs).map((key) => {
      const [tokenA, tokenB] = this.parsePairKey(key);
      return { tokenA, tokenB };
    });
  }

  /**
   * Generate a unique key for a token pair
   */
  private getPairKey(tokenA: string, tokenB: string): string {
    // Sort to ensure consistent key regardless of order
    const sorted = [tokenA.toLowerCase(), tokenB.toLowerCase()].sort();
    return `${sorted[0]}-${sorted[1]}`;
  }

  /**
   * Parse a pair key back into tokens
   */
  private parsePairKey(pairKey: string): [string, string] {
    const [tokenA, tokenB] = pairKey.split('-');
    return [tokenA, tokenB];
  }

  /**
   * Generate unique opportunity ID
   */
  private generateOpportunityId(
    tokenA: string,
    tokenB: string,
    buyDex: string,
    sellDex: string
  ): string {
    const timestamp = Date.now();
    return `${tokenA}-${tokenB}-${buyDex}-${sellDex}-${timestamp}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get aggregator statistics
   */
  getStats(): {
    scannerCount: number;
    monitoredPairCount: number;
    isMonitoring: boolean;
    callbackCount: number;
  } {
    return {
      scannerCount: this.scanners.size,
      monitoredPairCount: this.monitoredPairs.size,
      isMonitoring: this.isMonitoring,
      callbackCount: this.opportunityCallbacks.length,
    };
  }
}