import winston from 'winston';

/**
 * Winston logger configuration for the Atomic Arbitrage Bot
 */

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(logColors);

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

/**
 * Create logger instance
 */
export const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

/**
 * Log opportunity detection
 */
export function logOpportunity(opportunity: any): void {
  logger.info('Opportunity detected', {
    tokenIn: opportunity.tokenIn,
    tokenOut: opportunity.tokenOut,
    buyDex: opportunity.buyDex,
    sellDex: opportunity.sellDex,
    estimatedProfit: opportunity.estimatedProfit?.toString(),
  });
}

/**
 * Log execution result
 */
export function logExecution(result: any): void {
  if (result.success) {
    logger.info('Arbitrage executed successfully', {
      txHash: result.transactionHash,
      profit: result.profit?.toString(),
      gasUsed: result.gasUsed?.toString(),
    });
  } else {
    logger.error('Arbitrage execution failed', {
      error: result.error,
      opportunity: result.opportunity,
    });
  }
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: any): void {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    context,
  });
}

/**
 * Log metrics
 */
export function logMetrics(metrics: any): void {
  logger.info('Bot metrics', metrics);
}

export default logger;