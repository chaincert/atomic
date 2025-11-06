import { ethers } from 'ethers';
import { ArbitrageOpportunity, ProfitAnalysis } from '../types/arbitrage.types';
import { NetworkConfig } from '../types/config.types';
import { logger } from '../utils/logger';

/**
 * ProfitCalculator - Analyzes arbitrage opportunities and calculates profitability
 */
export class ProfitCalculator {
  private config: NetworkConfig;
  private ethPriceUSD: number = 2000; // Default ETH price, should be updated dynamically

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Calculate complete profit analysis for an arbitrage opportunity
   */
  async calculateProfit(opportunity: ArbitrageOpportunity): Promise<ProfitAnalysis> {
    try {
      // Determine recommended trade amount
      const recommendedAmount = this.calculateOptimalAmount(
        opportunity.buyPrice,
        opportunity.sellPrice,
        opportunity.availableLiquidity
      );

      // Calculate gross profit (before fees)
      const grossProfit = this.calculateGrossProfit(
        recommendedAmount,
        opportunity.buyPrice,
        opportunity.sellPrice
      );

      // Calculate flash loan fee
      const flashLoanFee = this.calculateFlashLoanFee(recommendedAmount);

      // Calculate DEX fees
      const dexFees = this.calculateDexFees(recommendedAmount, opportunity.buyDex, opportunity.sellDex);

      // Estimate gas cost
      const gasCost = await this.estimateGasCost();

      // Calculate net profit
      const netProfit = grossProfit.sub(flashLoanFee).sub(dexFees).sub(gasCost);

      // Calculate profit percentage
      const profitPercentage = this.calculateProfitPercentage(netProfit, recommendedAmount);

      // Calculate price impact
      const buyPriceImpact = this.calculatePriceImpactPercent(
        recommendedAmount,
        opportunity.buyPrice
      );
      const sellPriceImpact = this.calculatePriceImpactPercent(
        recommendedAmount,
        opportunity.sellPrice
      );

      // Determine if executable
      const isExecutable = this.isOpportunityExecutable(
        netProfit,
        profitPercentage,
        buyPriceImpact,
        sellPriceImpact
      );

      const analysis: ProfitAnalysis = {
        opportunity,
        grossProfit,
        flashLoanFee,
        gasCost,
        dexFees,
        netProfit,
        profitPercentage,
        recommendedAmount,
        isExecutable,
        priceImpact: {
          buy: buyPriceImpact,
          sell: sellPriceImpact,
        },
      };

      logger.debug('Profit analysis complete', {
        tokenIn: opportunity.tokenIn,
        tokenOut: opportunity.tokenOut,
        netProfit: ethers.utils.formatEther(netProfit),
        profitPercentage: profitPercentage.toFixed(2),
        isExecutable,
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to calculate profit', {
        opportunity,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate optimal trade amount based on liquidity and price difference
   */
  private calculateOptimalAmount(
    buyPrice: ethers.BigNumber,
    sellPrice: ethers.BigNumber,
    availableLiquidity: ethers.BigNumber
  ): ethers.BigNumber {
    // Simple heuristic: use percentage of available liquidity
    // More sophisticated: calculate optimal amount to maximize profit considering price impact
    
    const maxTradeSize = ethers.utils.parseEther(this.config.execution.maxTradeSize);
    
    // Use smaller of: 10% of liquidity, or max trade size
    const tenPercentLiquidity = availableLiquidity.div(10);
    const recommendedAmount = tenPercentLiquidity.lt(maxTradeSize)
      ? tenPercentLiquidity
      : maxTradeSize;

    // Ensure minimum of 0.1 ETH equivalent
    const minAmount = ethers.utils.parseEther('0.1');
    return recommendedAmount.lt(minAmount) ? minAmount : recommendedAmount;
  }

  /**
   * Calculate gross profit before fees
   */
  private calculateGrossProfit(
    amount: ethers.BigNumber,
    buyPrice: ethers.BigNumber,
    sellPrice: ethers.BigNumber
  ): ethers.BigNumber {
    // Gross profit = (sellPrice - buyPrice) * amount / 10^18
    const priceDiff = sellPrice.sub(buyPrice);
    return priceDiff.mul(amount).div(ethers.constants.WeiPerEther);
  }

  /**
   * Calculate flash loan fee
   */
  private calculateFlashLoanFee(amount: ethers.BigNumber): ethers.BigNumber {
    // Aave V3 fee is 0.09% (9 basis points)
    // Fee = amount * 0.09 / 100 = amount * 9 / 10000
    const aaveFee = this.config.flashLoanProviders.aave?.feePercentage || 0.09;
    const feeB asisPoints = Math.round(aaveFee * 100); // 0.09 * 100 = 9 basis points
    
    return amount.mul(feeBasisPoints).div(10000);
  }

  /**
   * Calculate DEX fees for both buy and sell
   */
  private calculateDexFees(
    amount: ethers.BigNumber,
    buyDex: string,
    sellDex: string
  ): ethers.BigNumber {
    // Get fee percentages for each DEX
    const buyFee = this.getDexFee(buyDex);
    const sellFee = this.getDexFee(sellDex);

    // Calculate fees: amount * (buyFee + sellFee) / 10000
    const totalFeeBasisPoints = buyFee + sellFee;
    return amount.mul(totalFeeBasisPoints).div(10000);
  }

  /**
   * Get DEX fee in basis points
   */
  private getDexFee(dexName: string): number {
    // Default to 30 basis points (0.3%)
    const dex = Object.values(this.config.dexes).find((d) => d?.name === dexName);
    return dex?.feePercentage || 30;
  }

  /**
   * Estimate gas cost for the arbitrage transaction
   */
  private async estimateGasCost(): Promise<ethers.BigNumber> {
    // Estimated gas units for flash loan arbitrage
    // Flash loan callback + 2 swaps ≈ 400,000 gas
    const estimatedGas = ethers.BigNumber.from(400000);

    // Get current gas price or use max from config
    const maxGasPriceGwei = this.config.execution.maxGasPrice;
    const maxGasPrice = ethers.utils.parseUnits(maxGasPriceGwei, 'gwei');

    // Total cost = gas * gasPrice
    const gasCost = estimatedGas.mul(maxGasPrice);

    return gasCost;
  }

  /**
   * Calculate profit percentage
   */
  private calculateProfitPercentage(
    netProfit: ethers.BigNumber,
    amount: ethers.BigNumber
  ): number {
    if (amount.isZero()) return 0;

    // Percentage = (netProfit / amount) * 100
    const percentage = netProfit.mul(10000).div(amount).toNumber() / 100;
    return percentage;
  }

  /**
   * Calculate price impact as percentage
   */
  private calculatePriceImpactPercent(
    amount: ethers.BigNumber,
    price: ethers.BigNumber
  ): number {
    // Simplified price impact calculation
    // In production, this should use actual reserve data
    
    // Rough estimate: impact = (amount / assumed_liquidity) * 100
    // Assuming liquidity is 100x the trade amount for simplicity
    const assumedLiquidity = amount.mul(100);
    const impact = amount.mul(10000).div(assumedLiquidity).toNumber() / 100;
    
    return Math.min(impact, 100); // Cap at 100%
  }

  /**
   * Determine if opportunity is executable based on thresholds
   */
  private isOpportunityExecutable(
    netProfit: ethers.BigNumber,
    profitPercentage: number,
    buyPriceImpact: number,
    sellPriceImpact: number
  ): boolean {
    // Check if net profit is positive
    if (netProfit.lte(0)) {
      return false;
    }

    // Check minimum profit threshold in USD
    const netProfitUSD = this.convertToUSD(netProfit);
    if (netProfitUSD < this.config.execution.minProfitUSD) {
      return false;
    }

    // Check minimum profit percentage
    if (profitPercentage < this.config.execution.minProfitPercentage) {
      return false;
    }

    // Check price impact thresholds
    const maxSlippagePercent = this.config.execution.maxSlippage / 100; // Convert basis points to percentage
    if (buyPriceImpact > maxSlippagePercent || sellPriceImpact > maxSlippagePercent) {
      return false;
    }

    return true;
  }

  /**
   * Convert ETH amount to USD
   */
  private convertToUSD(ethAmount: ethers.BigNumber): number {
    const ethValue = parseFloat(ethers.utils.formatEther(ethAmount));
    return ethValue * this.ethPriceUSD;
  }

  /**
   * Update ETH price for USD calculations
   */
  public updateEthPrice(priceUSD: number): void {
    this.ethPriceUSD = priceUSD;
    logger.info('ETH price updated', { priceUSD });
  }

  /**
   * Calculate minimum profitable amount
   */
  public calculateMinimumProfitableAmount(
    buyPrice: ethers.BigNumber,
    sellPrice: ethers.BigNumber
  ): ethers.BigNumber {
    // This would calculate the break-even point
    // Amount where gross profit equals all fees
    
    const priceDiff = sellPrice.sub(buyPrice);
    if (priceDiff.lte(0)) {
      return ethers.constants.Zero;
    }

    // Simplified: minimum amount where fees are covered
    // In production, solve equation: profit(amount) = 0
    return ethers.utils.parseEther('0.1'); // Placeholder
  }
}