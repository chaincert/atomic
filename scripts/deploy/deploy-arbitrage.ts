import { ethers } from 'hardhat';

/**
 * Deploy Arbitrage contract
 */
async function main() {
  console.log('Starting Arbitrage contract deployment...');

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());

  // Get contract addresses from environment or use defaults
  const aavePool = process.env.AAVE_POOL_ADDRESS || '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  const balancerVault = process.env.BALANCER_VAULT_ADDRESS || '0xBA12222222228d8Ba445958a75a0704d566BF2C8';

  console.log('Aave Pool:', aavePool);
  console.log('Balancer Vault:', balancerVault);

  // Deploy the Arbitrage contract
  const Arbitrage = await ethers.getContractFactory('Arbitrage');
  const arbitrage = await Arbitrage.deploy(aavePool, balancerVault);

  await arbitrage.deployed();

  console.log('Arbitrage contract deployed to:', arbitrage.address);

  // Configure DEX approvals
  console.log('\nConfiguring DEX approvals...');
  
  const uniswapV2Router = process.env.UNISWAP_V2_ROUTER || '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const sushiswapRouter = process.env.SUSHISWAP_ROUTER || '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';
  const uniswapV3Router = process.env.UNISWAP_V3_ROUTER || '0xE592427A0AEce92De3Edee1F18E0157C05861564';

  // Approve Uniswap V2
  let tx = await arbitrage.setDEXApproval(uniswapV2Router, true);
  await tx.wait();
  console.log('Approved Uniswap V2 Router:', uniswapV2Router);

  // Approve SushiSwap
  tx = await arbitrage.setDEXApproval(sushiswapRouter, true);
  await tx.wait();
  console.log('Approved SushiSwap Router:', sushiswapRouter);

  // Approve Uniswap V3
  tx = await arbitrage.setDEXApproval(uniswapV3Router, true);
  await tx.wait();
  console.log('Approved Uniswap V3 Router:', uniswapV3Router);

  console.log('\n=== Deployment Summary ===');
  console.log('Network:', (await ethers.provider.getNetwork()).name);
  console.log('Arbitrage Contract:', arbitrage.address);
  console.log('Deployer:', deployer.address);
  console.log('Aave Pool:', aavePool);
  console.log('Balancer Vault:', balancerVault);
  console.log('========================\n');

  // Save deployment info
  console.log('Add this to your .env file:');
  console.log(`ARBITRAGE_CONTRACT_ADDRESS=${arbitrage.address}`);

  // Verification command
  if (process.env.ETHERSCAN_API_KEY) {
    console.log('\nTo verify the contract, run:');
    console.log(`npx hardhat verify --network ${(await ethers.provider.getNetwork()).name} ${arbitrage.address} ${aavePool} ${balancerVault}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });