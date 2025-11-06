import { BigNumber } from 'ethers';

/**
 * Arbitrage-related type definitions
 */

export interface ArbitrageOpportunity {
  id: string;
  tokenIn: string;
  tokenOut: string;
  buyDex: string;
  sellDex: string;
  buyPrice: BigNumber;
  sellPrice: BigNumber;
  buyPoolAddress: string;
  sellPoolAddress: string;
  availableLiquidity: BigNumber;
  timestamp: number;
  blockNumber: number;
  estimatedProfit?: BigNumber;
}

export interface ProfitAnalysis {
  opportunity: ArbitrageOpportunity;
  grossProfit: BigNumber;
  flashLoanFee: BigNumber;
  gasCost: BigNumber;
  dexFees: BigNumber;
  netProfit: BigNumber;
  profitPercentage: number;
  recommendedAmount: BigNumber;
  isExecutable: boolean;
  priceImpact: {
    buy: number;
    sell: number;
  };
}

export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  profit?: BigNumber;
  gasUsed?: BigNumber;
  error?: string;
  opportunity: ArbitrageOpportunity;
  executionTime: number;
}

export interface FlashLoanParams {
  provider: 'aave' | 'balancer';
  token: string;
  amount: BigNumber;
  buyDex: string;
  sellDex: string;
}

export interface TransactionParams {
  to: string;
  data: string;
  value: BigNumber;
  gasLimit: BigNumber;
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
  nonce: number;
  chainId: number;
}

export interface SimulationResult {
  success: boolean;
  gasUsed: BigNumber;
  returnData: string;
  error?: string;
  logs?: any[];
}

export interface OpportunityFilter {
  minProfitUSD: number;
  minProfitPercentage: number;
  maxGasPrice: BigNumber;
  maxSlippage: number;
  blacklistedTokens?: string[];
  whitelistedTokens?: string[];
}

export interface BotMetrics {
  opportunitiesDetected: number;
  opportunitiesExecuted: number;
  opportunitiesSkipped: number;
  totalProfitUSD: number;
  totalGasSpentETH: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageProfitPerTx: number;
  uptime: number;
  lastExecutionTime?: number;
}

export interface GasEstimate {
  gasLimit: BigNumber;
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
  estimatedCost: BigNumber;
}