import { ethers } from 'ethers';
import { getConfig } from './config';
import { logger, logOpportunity, logExecution } from './utils/logger';
import { UniswapV2Scanner } from './scanner/UniswapV2Scanner';
import { PriceAggregator } from './scanner/PriceAggregator';
import { ProfitCalculator } from './analyzer/ProfitCalculator';
import { OpportunityValidator } from './analyzer/OpportunityValidator';
import { ContractInteractor } from './executor/ContractInteractor';
import { ArbitrageOpportunity } from './types/arbitrage.types';

/**
 * Main entry point for the Atomic Arbitrage Bot
 */

// Global state for cleanup
let aggregator: PriceAggregator | null = null;
let isRunning = false;

async function main() {
  logger.info('🚀 Starting Atomic Arbitrage Bot...');

  try {
    // Load and validate configuration
    const config = getConfig();
    logger.info('Configuration loaded successfully', {
      network: config.network.name,
      chainId: config.network.chainId,
      dryRun: config.network.execution.dryRun,
    });

    // Initialize provider and signer
    logger.info('Connecting to blockchain...');
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    const signer = new ethers.Wallet(config.privateKey, provider);
    
    // Verify connection
    const blockNumber = await provider.getBlockNumber();
    const signerAddress = await signer.getAddress();
    logger.info('Connected to blockchain', {
      blockNumber,
      signerAddress,
    });

    // Initialize scanners
    logger.info('Initializing DEX scanners...');
    const scanners = [];

    if (config.network.dexes.uniswapV2) {
      const uniswapScanner = new UniswapV2Scanner(config.network.dexes.uniswapV2, provider);
      await uniswapScanner.initialize();
      scanners.push(uniswapScanner);
      logger.info('✅ Uniswap V2 scanner initialized');
    }

    if (config.network.dexes.sushiswap) {
      const sushiScanner = new UniswapV2Scanner(config.network.dexes.sushiswap, provider);
      await sushiScanner.initialize();
      scanners.push(sushiScanner);
      logger.info('✅ SushiSwap scanner initialized');
    }

    if (scanners.length < 2) {
      throw new Error('Need at least 2 DEX scanners for arbitrage');
    }

    // Initialize price aggregator
    logger.info('Initializing price aggregator...');
    aggregator = new PriceAggregator(scanners);

    // Add token pairs to monitor
    // Example: WETH/USDC pair (configure these based on your strategy)
    const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    aggregator.addPair(WETH, USDC);
    
    logger.info('✅ Price aggregator initialized', aggregator.getStats());

    // Initialize analyzer components
    logger.info('Initializing analyzer...');
    const profitCalculator = new ProfitCalculator(config.network);
    const validator = new OpportunityValidator(config.network, {
      minLiquidityUSD: 10000,
      useWhitelist: false,
    });
    logger.info('✅ Analyzer initialized');

    // Initialize executor
    logger.info('Initializing executor...');
    const contractInteractor = new ContractInteractor(config.network, signer);
    
    // Check if contract is paused
    const isPaused = await contractInteractor.isPaused();
    if (isPaused) {
      logger.warn('⚠️  Contract is currently paused');
    }
    
    logger.info('✅ Executor initialized');

    // Display configuration summary
    logger.info('Bot Configuration Summary:', {
      minProfitUSD: config.network.execution.minProfitUSD,
      minProfitPercentage: config.network.execution.minProfitPercentage,
      maxGasPrice: config.network.execution.maxGasPrice,
      maxTradeSize: config.network.execution.maxTradeSize,
      maxSlippage: config.network.execution.maxSlippage,
      dryRun: config.network.execution.dryRun,
      arbitrageContract: config.network.arbitrageContract,
      monitoredPairs: aggregator.getMonitoredPairs().length,
      scanners: scanners.length,
    });

    if (config.network.execution.dryRun) {
      logger.warn('⚠️  DRY RUN MODE - No actual transactions will be executed');
    } else {
      logger.warn('🔴 LIVE MODE - Real transactions will be executed');
      logger.warn('⚠️  Make sure you have tested thoroughly on testnet first!');
    }

    // Setup graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      shutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
      shutdown();
    });

    logger.info('✅ All systems initialized successfully!');
    logger.info('🔍 Starting opportunity monitoring...');

    // Start monitoring for opportunities
    isRunning = true;
    await monitorOpportunities(aggregator, validator, profitCalculator, contractInteractor, config);

  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

/**
 * Monitor for and execute arbitrage opportunities
 */
async function monitorOpportunities(
  aggregator: PriceAggregator,
  validator: OpportunityValidator,
  calculator: ProfitCalculator,
  interactor: ContractInteractor,
  config: any
) {
  let opportunitiesDetected = 0;
  let opportunitiesExecuted = 0;
  let opportunitiesSkipped = 0;

  // Define the opportunity handler
  const handleOpportunity = async (opportunity: ArbitrageOpportunity) => {
    try {
      opportunitiesDetected++;
      logOpportunity(opportunity);

      // Validate opportunity
      const validation = validator.validate(opportunity);
      if (!validation.isValid) {
        logger.info('Opportunity rejected', {
          id: opportunity.id,
          reason: validation.reason,
        });
        opportunitiesSkipped++;
        return;
      }

      if (validation.warnings && validation.warnings.length > 0) {
        logger.warn('Opportunity has warnings', {
          id: opportunity.id,
          warnings: validation.warnings,
        });
      }

      // Calculate profit
      const analysis = await calculator.calculateProfit(opportunity);
      
      if (!analysis.isExecutable) {
        logger.info('Opportunity not profitable enough', {
          id: opportunity.id,
          netProfit: ethers.utils.formatEther(analysis.netProfit),
          profitPercentage: analysis.profitPercentage.toFixed(2),
        });
        opportunitiesSkipped++;
        return;
      }

      logger.info('✅ Profitable opportunity found!', {
        id: opportunity.id,
        netProfit: ethers.utils.formatEther(analysis.netProfit),
        profitPercentage: analysis.profitPercentage.toFixed(2),
        recommendedAmount: ethers.utils.formatEther(analysis.recommendedAmount),
      });

      // Execute if not in dry run mode
      if (!config.network.execution.dryRun) {
        logger.info('Executing arbitrage...');
        
        // Simulate first for safety
        const simulation = await interactor.simulateExecution({
          provider: 'aave',
          token: opportunity.tokenIn,
          amount: analysis.recommendedAmount,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
        });

        if (!simulation.success) {
          logger.error('Simulation failed', {
            id: opportunity.id,
            error: simulation.error,
          });
          opportunitiesSkipped++;
          return;
        }

        // Execute the arbitrage
        const result = await interactor.executeAaveArbitrage(
          opportunity,
          analysis.recommendedAmount
        );

        logExecution(result);

        if (result.success) {
          opportunitiesExecuted++;
          logger.info('🎉 Arbitrage executed successfully!', {
            txHash: result.transactionHash,
            profit: ethers.utils.formatEther(result.profit!),
          });
        } else {
          opportunitiesSkipped++;
        }
      } else {
        logger.info('DRY RUN - Would execute arbitrage', {
          id: opportunity.id,
          expectedProfit: ethers.utils.formatEther(analysis.netProfit),
        });
        opportunitiesSkipped++;
      }
    } catch (error) {
      logger.error('Error handling opportunity', {
        id: opportunity.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      opportunitiesSkipped++;
    }
  };

  // Log stats periodically
  setInterval(() => {
    logger.info('Bot Statistics', {
      opportunitiesDetected,
      opportunitiesExecuted,
      opportunitiesSkipped,
      successRate: opportunitiesDetected > 0 
        ? ((opportunitiesExecuted / opportunitiesDetected) * 100).toFixed(2) + '%'
        : '0%',
    });
  }, 60000); // Every minute

  // Start continuous monitoring
  await aggregator.monitorContinuously(handleOpportunity, 12000); // Every block
}

/**
 * Graceful shutdown handler
 */
function shutdown() {
  logger.info('Performing graceful shutdown...');
  
  isRunning = false;
  
  // Stop monitoring
  if (aggregator) {
    aggregator.stopMonitoring();
    aggregator.unsubscribe();
  }
  
  logger.info('Shutdown complete');
  process.exit(0);
}

// Start the bot
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };