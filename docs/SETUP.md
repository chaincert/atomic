# Atomic Arbitrage Bot - Setup Guide

This guide will walk you through setting up and running the Atomic Arbitrage Bot.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher)
- **Git**
- **A code editor** (VS Code recommended)

## Environment Requirements

- **Ethereum Wallet** with some ETH for gas fees
- **RPC Provider** (Alchemy, Infura, or similar)
- **Block Explorer API Key** (Etherscan) for contract verification

## Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd atomic-arbitrage-bot

# Install dependencies
npm install
```

## Step 2: Configuration

### Create Environment File

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

### Configure Essential Variables

Edit `.env` and set the following required variables:

```bash
# Network Configuration
NETWORK=mainnet  # or goerli, sepolia for testing
MAINNET_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY
WEBSOCKET_URL=wss://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY
CHAIN_ID=1

# Wallet Configuration
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
# ⚠️ NEVER commit your private key or share it

# Testnet RPCs (for testing)
GOERLI_RPC_URL=https://eth-goerli.alchemyapi.io/v2/YOUR_API_KEY
SEPOLIA_RPC_URL=https://eth-sepolia.alchemyapi.io/v2/YOUR_API_KEY

# Execution Parameters
MIN_PROFIT_USD=50
MIN_PROFIT_PERCENTAGE=0.5
MAX_GAS_PRICE_GWEI=100
MAX_SLIPPAGE_BPS=50
MAX_TRADE_SIZE_ETH=10

# Development (for testing)
ENABLE_SIMULATION=true
DRY_RUN=true  # Set to false for live trading
```

### Security Best Practices

🔒 **IMPORTANT SECURITY NOTES:**

1. **Never commit `.env` file** - It contains sensitive information
2. **Use a dedicated wallet** for the bot with limited funds
3. **Start with testnet** before moving to mainnet
4. **Use hardware wallet** or secure key management in production
5. **Enable DRY_RUN mode** initially to test without spending gas

## Step 3: Compile Smart Contracts

```bash
# Compile Solidity contracts
npm run compile
```

This will:
- Compile all smart contracts in `contracts/`
- Generate TypeScript types in `typechain-types/`
- Create artifacts in `artifacts/`

## Step 4: Deploy to Testnet

### Deploy on Goerli Testnet

```bash
# Make sure you have Goerli ETH in your wallet
npm run deploy:goerli
```

### Verify Deployment

After successful deployment, you'll see output like:

```
Arbitrage contract deployed to: 0x...
Add this to your .env file:
ARBITRAGE_CONTRACT_ADDRESS=0x...
```

**Action Required:**
1. Copy the contract address
2. Add it to your `.env` file
3. Note it for verification

### Verify Contract on Etherscan

```bash
# Get Etherscan API key from https://etherscan.io/myapikey
# Add to .env: ETHERSCAN_API_KEY=your_key

npx hardhat verify --network goerli [CONTRACT_ADDRESS] [AAVE_POOL] [BALANCER_VAULT]
```

## Step 5: Run Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Fork tests (requires mainnet RPC)
npm run test:fork
```

### Test Coverage

```bash
# Generate coverage report
npx hardhat coverage
```

## Step 6: Initial Bot Test (Dry Run)

### Start in Dry Run Mode

```bash
# Ensure DRY_RUN=true in .env
npm run dev
```

This will:
- Connect to the blockchain
- Start monitoring DEX pools
- Detect arbitrage opportunities
- Simulate transactions (no actual execution)
- Log results to console and files

### Monitor Logs

```bash
# In another terminal, watch logs
tail -f logs/combined.log

# Watch only opportunities
tail -f logs/combined.log | grep "Opportunity detected"
```

## Step 7: Monitoring Setup (Optional)

### Redis (for caching)

```bash
# Install Redis
# On Ubuntu/Debian:
sudo apt-get install redis-server

# On macOS with Homebrew:
brew install redis

# Start Redis
redis-server

# Update .env
REDIS_URL=redis://localhost:6379
ENABLE_CACHE=true
```

### Prometheus Metrics (optional)

```bash
# Metrics are exposed on port 9090 by default
# Access: http://localhost:9090/metrics

# Configure in .env
METRICS_PORT=9090
```

## Step 8: Testnet Trading

### Enable Live Trading on Testnet

1. Update `.env`:
   ```bash
   DRY_RUN=false
   NETWORK=goerli
   ```

2. Ensure you have sufficient Goerli ETH

3. Start the bot:
   ```bash
   npm start
   ```

4. Monitor execution:
   ```bash
   tail -f logs/combined.log
   ```

### Verify First Transaction

After detection and execution:
1. Check transaction on Goerli Etherscan
2. Verify gas costs
3. Confirm profit calculation
4. Review logs for any issues

## Step 9: Mainnet Preparation

### Pre-Mainnet Checklist

Before deploying to mainnet:

- [ ] Successfully tested on testnet for at least 1 week
- [ ] Verified all calculations are accurate
- [ ] Tested emergency stop functionality
- [ ] Reviewed all smart contract code
- [ ] Conducted security audit (recommended)
- [ ] Set up monitoring and alerting
- [ ] Prepared emergency procedures
- [ ] Funded wallet with minimal ETH (start small)
- [ ] Documented all procedures

### Deploy to Mainnet

```bash
# ⚠️ WARNING: Real funds at risk

# 1. Update .env
NETWORK=mainnet
MAINNET_RPC_URL=your_mainnet_rpc

# 2. Deploy contract
npm run deploy:mainnet

# 3. Update ARBITRAGE_CONTRACT_ADDRESS in .env

# 4. Verify contract
npx hardhat verify --network mainnet [CONTRACT_ADDRESS] [AAVE_POOL] [BALANCER_VAULT]
```

### Conservative Mainnet Start

Start with very conservative parameters:

```bash
MIN_PROFIT_USD=100  # Higher than testnet
MIN_PROFIT_PERCENTAGE=1.0  # Higher threshold
MAX_TRADE_SIZE_ETH=1  # Small size initially
MAX_GAS_PRICE_GWEI=50  # Lower gas limit
DRY_RUN=false
```

### Gradual Scaling

Week 1:
- Monitor 10-20 pools only
- Maximum 1 ETH trade size
- Manual approval of opportunities (if possible)

Week 2-4:
- Increase to 50 pools
- Increase trade size to 5 ETH
- Allow semi-automated execution

Month 2+:
- Scale to 100+ pools
- Up to 10 ETH trade size
- Fully automated (with monitoring)

## Common Issues and Solutions

### Issue: "Cannot connect to RPC"
**Solution:**
- Verify RPC_URL is correct
- Check API key is valid
- Try fallback RPC provider
- Check network connectivity

### Issue: "Insufficient funds"
**Solution:**
- Ensure wallet has ETH for gas
- Check contract has no leftover tokens
- Verify token approvals

### Issue: "Transaction reverted"
**Solution:**
- Check gas limits
- Verify token addresses
- Ensure DEX approvals are set
- Check flash loan provider is approved

### Issue: "No opportunities detected"
**Solution:**
- Verify DEX configurations
- Check token pair liquidity
- Lower MIN_PROFIT threshold temporarily
- Ensure WebSocket connection is active

## Operational Best Practices

### Daily Operations

1. **Morning Checklist:**
   - Check bot is running
   - Review overnight profits/losses
   - Verify no errors in logs
   - Check wallet balance

2. **Monitoring:**
   - Watch logs for anomalies
   - Check metrics dashboard
   - Verify gas prices are reasonable

3. **End of Day:**
   - Review performance metrics
   - Withdraw profits if desired
   - Plan any adjustments needed

### Weekly Maintenance

- Review and update DEX configurations
- Analyze profitable trading pairs
- Optimize gas settings
- Update token lists if needed
- Review security logs

### Emergency Procedures

1. **Immediate Stop:**
   ```bash
   # Kill the bot process
   pkill -f "node.*index.js"
   
   # Or use the pause function via Hardhat
   npx hardhat console --network mainnet
   > const arbitrage = await ethers.getContractAt("Arbitrage", "CONTRACT_ADDRESS")
   > await arbitrage.pause()
   ```

2. **Emergency Withdrawal:**
   ```bash
   npx hardhat console --network mainnet
   > const arbitrage = await ethers.getContractAt("Arbitrage", "CONTRACT_ADDRESS")
   > await arbitrage.emergencyWithdraw("TOKEN_ADDRESS")
   ```

## Getting Help

- Review logs in `logs/` directory
- Check GitHub Issues
- Consult `ARCHITECTURE.md` for system design
- Review `TECH_SPEC.md` for technical details

## Next Steps

After successful setup:
1. Read [`OPERATIONS.md`](OPERATIONS.md) for day-to-day operations
2. Review [`DEPLOYMENT.md`](DEPLOYMENT.md) for deployment strategies
3. Study [`ARCHITECTURE.md`](../ARCHITECTURE.md) to understand the system

---

**Remember:** This is a high-risk application. Never invest more than you can afford to lose. Start small and scale gradually.