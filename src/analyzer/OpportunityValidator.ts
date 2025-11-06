import { ethers } from 'ethers';
import { ArbitrageOpportunity } from '../types/arbitrage.types';
import { NetworkConfig } from '../types/config.types';
import { logger } from '../utils/logger';

/**
 * Validation result with detailed feedback
 */
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  warnings?: string[];
}

/**
 * OpportunityValidator - Validates and filters arbitrage opportunities
 */
export class OpportunityValidator {
  private config: NetworkConfig;
  private blacklistedTokens: Set<string>;
  private whitelistedTokens: Set<string>;
  private blacklistedDexes: Set<string>;
  private minLiquidityUSD: number;
  private useWhitelist: boolean;

  constructor(config: NetworkConfig, options?: {
    blacklistedTokens?: string[];
    whitelistedTokens?: string[];
    blacklistedDexes?: string[];
    minLiquidityUSD?: number;
    useWhitelist?: boolean;
  }) {
    this.config = config;
    this.blacklistedTokens = new Set(options?.blacklistedTokens?.map(t => t.toLowerCase()) || []);
    this.whitelistedTokens = new Set(options?.whitelistedTokens?.map(t => t.toLowerCase()) || []);
    this.blacklistedDexes = new Set(options?.blacklistedDexes || []);
    this.minLiquidityUSD = options?.minLiquidityUSD || 10000; // $10k default
    this.useWhitelist = options?.useWhitelist || false;

    logger.info('OpportunityValidator initialized', {
      blacklistedTokens: this.blacklistedTokens.size,
      whitelistedTokens: this.whitelistedTokens.size,
      blacklistedDexes: this.blacklistedDexes.size,
      minLiquidityUSD: this.minLiquidityUSD,
      useWhitelist: this.useWhitelist,
    });
  }

  /**
   * Validate an arbitrage opportunity
   */
  validate(opportunity: ArbitrageOpportunity): ValidationResult {
    const warnings: string[] = [];

    // 1. Validate token addresses
    const tokenValidation = this.validateTokens(opportunity);
    if (!tokenValidation.isValid) {
      return tokenValidation;
    }
    if (tokenValidation.warnings) {
      warnings.push(...tokenValidation.warnings);
    }

    // 2. Validate DEXes
    const dexValidation = this.validateDexes(opportunity);
    if (!dexValidation.isValid) {
      return dexValidation;
    }
    if (dexValidation.warnings) {
      warnings.push(...dexValidation.warnings);
    }

    // 3. Validate prices
    const priceValidation = this.validatePrices(opportunity);
    if (!priceValidation.isValid) {
      return priceValidation;
    }
    if (priceValidation.warnings) {
      warnings.push(...priceValidation.warnings);
    }

    // 4. Validate liquidity
    const liquidityValidation = this.validateLiquidity(opportunity);
    if (!liquidityValidation.isValid) {
      return liquidityValidation;
    }
    if (liquidityValidation.warnings) {
      warnings.push(...liquidityValidation.warnings);
    }

    // 5. Validate profit potential
    const profitValidation = this.validateProfitPotential(opportunity);
    if (!profitValidation.isValid) {
      return profitValidation;
    }
    if (profitValidation.warnings) {
      warnings.push(...profitValidation.warnings);
    }

    // 6. Validate freshness
    const freshnessValidation = this.validateFreshness(opportunity);
    if (!freshnessValidation.isValid) {
      return freshnessValidation;
    }
    if (freshnessValidation.warnings) {
      warnings.push(...freshnessValidation.warnings);
    }

    logger.debug('Opportunity validated successfully', {
      id: opportunity.id,
      warnings: warnings.length,
    });

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate token addresses
   */
  private validateTokens(opportunity: ArbitrageOpportunity): ValidationResult {
    // Check if tokens are valid addresses
    if (!ethers.utils.isAddress(opportunity.tokenIn)) {
      return {
        isValid: false,
        reason: `Invalid tokenIn address: ${opportunity.tokenIn}`,
      };
    }

    if (!ethers.utils.isAddress(opportunity.tokenOut)) {
      return {
        isValid: false,
        reason: `Invalid tokenOut address: ${opportunity.tokenOut}`,
      };
    }

    // Check if tokens are the same
    if (opportunity.tokenIn.toLowerCase() === opportunity.tokenOut.toLowerCase()) {
      return {
        isValid: false,
        reason: 'TokenIn and tokenOut cannot be the same',
      };
    }

    const tokenInLower = opportunity.tokenIn.toLowerCase();
    const tokenOutLower = opportunity.tokenOut.toLowerCase();

    // Check blacklist
    if (this.blacklistedTokens.has(tokenInLower)) {
      return {
        isValid: false,
        reason: `TokenIn is blacklisted: ${opportunity.tokenIn}`,
      };
    }

    if (this.blacklistedTokens.has(tokenOutLower)) {
      return {
        isValid: false,
        reason: `TokenOut is blacklisted: ${opportunity.tokenOut}`,
      };
    }

    // Check whitelist if enabled
    if (this.useWhitelist) {
      if (!this.whitelistedTokens.has(tokenInLower)) {
        return {
          isValid: false,
          reason: `TokenIn not in whitelist: ${opportunity.tokenIn}`,
        };
      }

      if (!this.whitelistedTokens.has(tokenOutLower)) {
        return {
          isValid: false,
          reason: `TokenOut not in whitelist: ${opportunity.tokenOut}`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate DEXes
   */
  private validateDexes(opportunity: ArbitrageOpportunity): ValidationResult {
    // Check if DEXes are different
    if (opportunity.buyDex === opportunity.sellDex) {
      return {
        isValid: false,
        reason: 'Buy and sell DEX cannot be the same',
      };
    }

    // Check blacklist
    if (this.blacklistedDexes.has(opportunity.buyDex)) {
      return {
        isValid: false,
        reason: `Buy DEX is blacklisted: ${opportunity.buyDex}`,
      };
    }

    if (this.blacklistedDexes.has(opportunity.sellDex)) {
      return {
        isValid: false,
        reason: `Sell DEX is blacklisted: ${opportunity.sellDex}`,
      };
    }

    // Validate pool addresses
    if (!ethers.utils.isAddress(opportunity.buyPoolAddress)) {
      return {
        isValid: false,
        reason: `Invalid buy pool address: ${opportunity.buyPoolAddress}`,
      };
    }

    if (!ethers.utils.isAddress(opportunity.sellPoolAddress)) {
      return {
        isValid: false,
        reason: `Invalid sell pool address: ${opportunity.sellPoolAddress}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate prices
   */
  private validatePrices(opportunity: ArbitrageOpportunity): ValidationResult {
    const warnings: string[] = [];

    // Prices must be positive
    if (opportunity.buyPrice.lte(0)) {
      return {
        isValid: false,
        reason: 'Buy price must be positive',
      };
    }

    if (opportunity.sellPrice.lte(0)) {
      return {
        isValid: false,
        reason: 'Sell price must be positive',
      };
    }

    // Sell price should be higher than buy price for arbitrage
    if (opportunity.sellPrice.lte(opportunity.buyPrice)) {
      return {
        isValid: false,
        reason: 'Sell price must be higher than buy price for profitable arbitrage',
      };
    }

    // Calculate price difference percentage
    const priceDiff = opportunity.sellPrice.sub(opportunity.buyPrice);
    const diffPercentage = priceDiff.mul(10000).div(opportunity.buyPrice).toNumber() / 100;

    // Warn if price difference is very high (might be stale data or error)
    if (diffPercentage > 10) {
      warnings.push(`Very high price difference: ${diffPercentage.toFixed(2)}% - verify data accuracy`);
    }

    // Warn if price difference is very low (might not cover fees)
    if (diffPercentage < 0.3) {
      warnings.push(`Low price difference: ${diffPercentage.toFixed(2)}% - may not cover all fees`);
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate liquidity
   */
  private validateLiquidity(opportunity: ArbitrageOpportunity): ValidationResult {
    const warnings: string[] = [];

    // Liquidity must be positive
    if (opportunity.availableLiquidity.lte(0)) {
      return {
        isValid: false,
        reason: 'Available liquidity must be positive',
      };
    }

    // Check minimum liquidity (rough USD estimate)
    // This is a simplified check - in production, you'd convert to USD properly
    const liquidityETH = parseFloat(ethers.utils.formatEther(opportunity.availableLiquidity));
    const estimatedUSD = liquidityETH * 2000; // Rough ETH price estimate

    if (estimatedUSD < this.minLiquidityUSD) {
      return {
        isValid: false,
        reason: `Insufficient liquidity: $${estimatedUSD.toFixed(0)} < $${this.minLiquidityUSD}`,
      };
    }

    // Warn if liquidity is marginal
    if (estimatedUSD < this.minLiquidityUSD * 1.5) {
      warnings.push(`Low liquidity: $${estimatedUSD.toFixed(0)} - expect high slippage`);
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate profit potential
   */
  private validateProfitPotential(opportunity: ArbitrageOpportunity): ValidationResult {
    const warnings: string[] = [];

    // Check if estimated profit exists
    if (opportunity.estimatedProfit) {
      // Profit should be positive
      if (opportunity.estimatedProfit.lte(0)) {
        return {
          isValid: false,
          reason: 'Estimated profit must be positive',
        };
      }

      // Check against minimum profit threshold
      const profitETH = parseFloat(ethers.utils.formatEther(opportunity.estimatedProfit));
      const profitUSD = profitETH * 2000; // Rough estimate

      const minProfitUSD = this.config.execution.minProfitUSD;

      if (profitUSD < minProfitUSD) {
        return {
          isValid: false,
          reason: `Estimated profit $${profitUSD.toFixed(2)} below minimum $${minProfitUSD}`,
        };
      }

      // Warn if profit is marginal
      if (profitUSD < minProfitUSD * 1.2) {
        warnings.push(`Marginal profit: $${profitUSD.toFixed(2)} - vulnerable to price changes`);
      }
    } else {
      warnings.push('No estimated profit provided - validation limited');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate opportunity freshness
   */
  private validateFreshness(opportunity: ArbitrageOpportunity): ValidationResult {
    const warnings: string[] = [];
    const now = Date.now();
    const ageMs = now - opportunity.timestamp;
    const ageSeconds = ageMs / 1000;

    // Opportunity should be recent (within 1 minute)
    const maxAgeSeconds = 60;

    if (ageSeconds > maxAgeSeconds) {
      return {
        isValid: false,
        reason: `Opportunity is stale: ${ageSeconds.toFixed(0)}s old (max: ${maxAgeSeconds}s)`,
      };
    }

    // Warn if opportunity is getting old
    if (ageSeconds > maxAgeSeconds / 2) {
      warnings.push(`Opportunity aging: ${ageSeconds.toFixed(0)}s old - execute quickly`);
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**, 
   * Add token to blacklist
   */
  addToBlacklist(token: string): void {
    this.blacklistedTokens.add(token.toLowerCase());
    logger.info('Token added to blacklist', { token });
  }

  /**
   * Remove token from blacklist
   */
  removeFromBlacklist(token: string): void {
    this.blacklistedTokens.delete(token.toLowerCase());
    logger.info('Token removed from blacklist', { token });
  }

  /**
   * Add token to whitelist
   */
  addToWhitelist(token: string): void {
    this.whitelistedTokens.add(token.toLowerCase());
    logger.info('Token added to whitelist', { token });
  }

  /**
   * Remove token from whitelist
   */
  removeFromWhitelist(token: string): void {
    this.whitelistedTokens.delete(token.toLowerCase());
    logger.info('Token removed from whitelist', { token });
  }

  /**
   * Add DEX to blacklist
   */
  addDexToBlacklist(dex: string): void {
    this.blacklistedDexes.add(dex);
    logger.info('DEX added to blacklist', { dex });
  }

  /**
   * Remove DEX from blacklist
   */
  removeDexFromBlacklist(dex: string): void {
    this.blacklistedDexes.delete(dex);
    logger.info('DEX removed from blacklist', { dex });
  }

  /**
   * Enable whitelist mode
   */
  enableWhitelist(): void {
    this.useWhitelist = true;
    logger.info('Whitelist mode enabled');
  }

  /**
   * Disable whitelist mode
   */
  disableWhitelist(): void {
    this.useWhitelist = false;
    logger.info('Whitelist mode disabled');
  }

  /**
   * Update minimum liquidity requirement
   */
  setMinLiquidityUSD(amount: number): void {
    this.minLiquidityUSD = amount;
    logger.info('Minimum liquidity updated', { amount });
  }

  /**
   * Get validator statistics
   */
  getStats(): {
    blacklistedTokens: number;
    whitelistedTokens: number;
    blacklistedDexes: number;
    minLiquidityUSD: number;
    useWhitelist: boolean;
  } {
    return {
      blacklistedTokens: this.blacklistedTokens.size,
      whitelistedTokens: this.whitelistedTokens.size,
      blacklistedDexes: this.blacklistedDexes.size,
      minLiquidityUSD: this.minLiquidityUSD,
      useWhitelist: this.useWhitelist,
    };
  }
}