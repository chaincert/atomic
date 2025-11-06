import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { BotConfig, NetworkConfig, MonitoringConfig } from '../types/config.types';

dotenv.config();

/**
 * Load and validate bot configuration from environment variables
 */
export function loadConfig(): BotConfig {
  const network = loadNetworkConfig();
  const monitoring = loadMonitoringConfig();

  return {
    network,
    monitoring,
    privateKey: getEnvVar('PRIVATE_KEY'),
    maxConcurrentOpportunities: parseInt(getEnvVar('MAX_CONCURRENT_OPPORTUNITIES', '5')),
    cacheEnabled: getEnvVar('ENABLE_CACHE', 'true') === 'true',
    cacheTTL: parseInt(getEnvVar('CACHE_TTL_SECONDS', '60')),
  };
}

/**
 * Load network-specific configuration
 */
function loadNetworkConfig(): NetworkConfig {
  const networkName = getEnvVar('NETWORK', 'mainnet');
  const chainId = parseInt(getEnvVar('CHAIN_ID', '1'));

  return {
    name: networkName,
    chainId,
    rpcUrl: getEnvVar('RPC_URL') || getEnvVar('MAINNET_RPC_URL'),
    wsUrl: getEnvVar('WEBSOCKET_URL'),
    explorerUrl: getExplorerUrl(chainId),
    arbitrageContract: getEnvVar('ARBITRAGE_CONTRACT_ADDRESS'),
    flashLoanProviders: {
      aave: {
        pool: getEnvVar('AAVE_POOL_ADDRESS', '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'),
        feePercentage: 0.09,
      },
      balancer: {
        vault: getEnvVar('BALANCER_VAULT_ADDRESS', '0xBA12222222228d8Ba445958a75a0704d566BF2C8'),
        feePercentage: 0,
      },
    },
    dexes: {
      uniswapV2: {
        name: 'Uniswap V2',
        type: 'UniswapV2',
        router: getEnvVar('UNISWAP_V2_ROUTER', '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
        factory: getEnvVar('UNISWAP_V2_FACTORY', '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),
        feePercentage: 30, // 0.3%
      },
      sushiswap: {
        name: 'SushiSwap',
        type: 'SushiSwap',
        router: getEnvVar('SUSHISWAP_ROUTER', '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'),
        factory: getEnvVar('SUSHISWAP_FACTORY', '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'),
        feePercentage: 30, // 0.3%
      },
      uniswapV3: {
        name: 'Uniswap V3',
        type: 'UniswapV3',
        router: getEnvVar('UNISWAP_V3_ROUTER', '0xE592427A0AEce92De3Edee1F18E0157C05861564'),
        factory: getEnvVar('UNISWAP_V3_FACTORY', '0x1F98431c8aD98523631AE4a59f267346ea31F984'),
        feePercentage: 30, // Variable, but 0.3% is most common
        feeTiers: [500, 3000, 10000], // 0.05%, 0.3%, 1%
      },
    },
    execution: {
      minProfitUSD: parseFloat(getEnvVar('MIN_PROFIT_USD', '50')),
      minProfitPercentage: parseFloat(getEnvVar('MIN_PROFIT_PERCENTAGE', '0.5')),
      maxGasPrice: getEnvVar('MAX_GAS_PRICE_GWEI', '100'),
      maxSlippage: parseInt(getEnvVar('MAX_SLIPPAGE_BPS', '50')),
      maxTradeSize: getEnvVar('MAX_TRADE_SIZE_ETH', '10'),
      confirmations: parseInt(getEnvVar('CONFIRMATIONS', '1')),
      enableSimulation: getEnvVar('ENABLE_SIMULATION', 'true') === 'true',
      dryRun: getEnvVar('DRY_RUN', 'false') === 'true',
    },
    flashbots: networkName === 'mainnet' ? {
      relayUrl: getEnvVar('FLASHBOTS_RELAY_URL', 'https://relay.flashbots.net'),
      authSignerKey: getEnvVar('FLASHBOTS_AUTH_KEY'),
    } : undefined,
  };
}

/**
 * Load monitoring configuration
 */
function loadMonitoringConfig(): MonitoringConfig {
  return {
    redisUrl: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
    logLevel: getEnvVar('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',
    metricsPort: parseInt(getEnvVar('METRICS_PORT', '9090')),
    alerting: {
      telegram: process.env.TELEGRAM_BOT_TOKEN ? {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: getEnvVar('TELEGRAM_CHAT_ID'),
      } : undefined,
      alertOnProfit: getEnvVar('ALERT_ON_PROFIT', 'true') === 'true',
      alertOnError: getEnvVar('ALERT_ON_ERROR', 'true') === 'true',
      minProfitForAlert: parseFloat(getEnvVar('ALERT_MIN_PROFIT', '100')),
    },
  };
}

/**
 * Get environment variable with optional default
 */
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

/**
 * Get block explorer URL based on chain ID
 */
function getExplorerUrl(chainId: number): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    5: 'https://goerli.etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
  };
  return explorers[chainId] || 'https://etherscan.io';
}

/**
 * Validate configuration
 */
export function validateConfig(config: BotConfig): void {
  // Validate network config
  if (!config.network.rpcUrl) {
    throw new Error('RPC URL is required');
  }

  if (!config.network.arbitrageContract) {
    throw new Error('Arbitrage contract address is required');
  }

  if (!ethers.utils.isAddress(config.network.arbitrageContract)) {
    throw new Error('Invalid arbitrage contract address');
  }

  // Validate private key
  if (!config.privateKey || !config.privateKey.startsWith('0x')) {
    throw new Error('Invalid private key format');
  }

  // Validate execution parameters
  if (config.network.execution.minProfitUSD <= 0) {
    throw new Error('Minimum profit must be greater than 0');
  }

  if (config.network.execution.maxSlippage <= 0 || config.network.execution.maxSlippage > 10000) {
    throw new Error('Max slippage must be between 0 and 10000 basis points');
  }

  console.log('Configuration validated successfully');
}

/**
 * Get configuration with validation
 */
export function getConfig(): BotConfig {
  const config = loadConfig();
  validateConfig(config);
  return config;
}