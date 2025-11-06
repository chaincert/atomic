// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/common/IERC20.sol";
import "./interfaces/aave/IPool.sol";
import "./interfaces/aave/IFlashLoanReceiver.sol";
import "./interfaces/balancer/IVault.sol";
import "./interfaces/balancer/IFlashLoanRecipient.sol";
import "./interfaces/uniswap/IUniswapV2Router02.sol";
import "./interfaces/uniswap/ISwapRouter.sol";

/**
 * @title Arbitrage
 * @notice Main contract for executing flash loan arbitrage across multiple DEXs
 * @dev Implements flash loan receivers for Aave V3 and Balancer V2
 */
contract Arbitrage is Ownable, ReentrancyGuard, Pausable, IFlashLoanReceiver, IFlashLoanRecipient {
    // Flash loan providers
    address public aavePool;
    address public balancerVault;

    // DEX routers
    mapping(address => bool) public approvedDEXs;
    
    // Flash loan providers whitelist
    mapping(address => bool) public approvedFlashLoanProviders;

    // Fee configuration (in basis points, e.g., 9 = 0.09%)
    uint256 public constant AAVE_FLASH_LOAN_FEE = 9; // 0.09%
    uint256 public constant BALANCER_FLASH_LOAN_FEE = 0; // 0% (usually zero for Balancer)
    
    // Events
    event ArbitrageExecuted(
        address indexed token,
        uint256 amount,
        uint256 profit,
        address indexed buyDex,
        address indexed sellDex
    );
    
    event FlashLoanProviderUpdated(address indexed provider, bool approved);
    event DEXUpdated(address indexed dex, bool approved);
    event ProfitWithdrawn(address indexed token, address indexed to, uint256 amount);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    /**
     * @notice Constructor
     * @param _aavePool Address of Aave V3 Pool
     * @param _balancerVault Address of Balancer V2 Vault
     */
    constructor(address _aavePool, address _balancerVault) {
        require(_aavePool != address(0), "Invalid Aave Pool address");
        require(_balancerVault != address(0), "Invalid Balancer Vault address");
        
        aavePool = _aavePool;
        balancerVault = _balancerVault;
        
        // Approve flash loan providers
        approvedFlashLoanProviders[_aavePool] = true;
        approvedFlashLoanProviders[_balancerVault] = true;
    }

    /**
     * @notice Execute arbitrage using Aave flash loan
     * @param token Token to borrow
     * @param amount Amount to borrow
     * @param buyDex DEX to buy from (lower price)
     * @param sellDex DEX to sell to (higher price)
     */
    function executeAaveFlashLoan(
        address token,
        uint256 amount,
        address buyDex,
        address sellDex
    ) external onlyOwner whenNotPaused nonReentrant {
        require(approvedDEXs[buyDex], "Buy DEX not approved");
        require(approvedDEXs[sellDex], "Sell DEX not approved");

        address[] memory assets = new address[](1);
        assets[0] = token;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // No debt, just flash loan

        bytes memory params = abi.encode(buyDex, sellDex);

        IPool(aavePool).flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            params,
            0
        );
    }

    /**
     * @notice Execute arbitrage using Balancer flash loan
     * @param token Token to borrow
     * @param amount Amount to borrow
     * @param buyDex DEX to buy from (lower price)
     * @param sellDex DEX to sell to (higher price)
     */
    function executeBalancerFlashLoan(
        address token,
        uint256 amount,
        address buyDex,
        address sellDex
    ) external onlyOwner whenNotPaused nonReentrant {
        require(approvedDEXs[buyDex], "Buy DEX not approved");
        require(approvedDEXs[sellDex], "Sell DEX not approved");

        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        bytes memory userData = abi.encode(buyDex, sellDex);

        IVault(balancerVault).flashLoan(
            IFlashLoanRecipient(address(this)),
            tokens,
            amounts,
            userData
        );
    }

    /**
     * @notice Aave flash loan callback
     * @dev This function is called by Aave Pool after receiving the flash loan
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == aavePool, "Caller must be Aave Pool");
        require(initiator == address(this), "Initiator must be this contract");

        // Decode parameters
        (address buyDex, address sellDex) = abi.decode(params, (address, address));

        // Execute arbitrage
        uint256 profit = _executeArbitrage(
            assets[0],
            amounts[0],
            buyDex,
            sellDex
        );

        // Calculate amount owed (principal + premium)
        uint256 amountOwed = amounts[0] + premiums[0];
        
        require(profit >= premiums[0], "Insufficient profit to cover fees");

        // Approve pool to pull the owed amount
        IERC20(assets[0]).approve(aavePool, amountOwed);

        emit ArbitrageExecuted(assets[0], amounts[0], profit, buyDex, sellDex);

        return true;
    }

    /**
     * @notice Balancer flash loan callback
     * @dev This function is called by Balancer Vault after receiving the flash loan
     */
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        require(msg.sender == balancerVault, "Caller must be Balancer Vault");

        // Decode parameters
        (address buyDex, address sellDex) = abi.decode(userData, (address, address));

        // Execute arbitrage
        uint256 profit = _executeArbitrage(
            address(tokens[0]),
            amounts[0],
            buyDex,
            sellDex
        );

        // Calculate amount owed (principal + fee, usually fee is 0 for Balancer)
        uint256 amountOwed = amounts[0] + feeAmounts[0];
        
        require(profit >= feeAmounts[0], "Insufficient profit to cover fees");

        // Transfer tokens back to Vault
        tokens[0].transfer(balancerVault, amountOwed);

        emit ArbitrageExecuted(address(tokens[0]), amounts[0], profit, buyDex, sellDex);
    }

    /**
     * @notice Internal function to execute the arbitrage logic
     * @param token Token to arbitrage
     * @param amount Amount to use for arbitrage
     * @param buyDex DEX to buy from
     * @param sellDex DEX to sell to
     * @return profit The profit made from the arbitrage
     */
    function _executeArbitrage(
        address token,
        uint256 amount,
        address buyDex,
        address sellDex
    ) internal returns (uint256 profit) {
        // Record initial balance
        uint256 initialBalance = IERC20(token).balanceOf(address(this));

        // For simplicity, this example assumes direct token-to-token swaps
        // In production, you'd need to determine the optimal path and intermediary tokens (e.g., WETH)
        
        // Approve buyDex to spend tokens
        IERC20(token).approve(buyDex, amount);

        // Execute buy on first DEX (buy low)
        // Note: This is a simplified example. In production, you need to:
        // 1. Determine the swap path (might need WETH as intermediary)
        // 2. Calculate minimum output amounts with slippage tolerance
        // 3. Handle different DEX types (V2 vs V3)
        
        // For now, this will need to be customized based on actual use case
        // Placeholder for actual swap logic
        
        // ... swap logic would go here ...

        // After swaps, calculate profit
        uint256 finalBalance = IERC20(token).balanceOf(address(this));
        profit = finalBalance > initialBalance ? finalBalance - initialBalance : 0;

        return profit;
    }

    /**
     * @notice Approve a DEX for trading
     * @param dex Address of the DEX router
     * @param approved Whether the DEX is approved
     */
    function setDEXApproval(address dex, bool approved) external onlyOwner {
        require(dex != address(0), "Invalid DEX address");
        approvedDEXs[dex] = approved;
        emit DEXUpdated(dex, approved);
    }

    /**
     * @notice Approve a flash loan provider
     * @param provider Address of the flash loan provider
     * @param approved Whether the provider is approved
     */
    function setFlashLoanProvider(address provider, bool approved) external onlyOwner {
        require(provider != address(0), "Invalid provider address");
        approvedFlashLoanProviders[provider] = approved;
        emit FlashLoanProviderUpdated(provider, approved);
    }

    /**
     * @notice Withdraw profits from the contract
     * @param token Token to withdraw
     */
    function withdrawProfits(address token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        
        IERC20(token).transfer(owner(), balance);
        emit ProfitWithdrawn(token, owner(), balance);
    }

    /**
     * @notice Emergency withdraw function
     * @param token Token to withdraw
     */
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        
        IERC20(token).transfer(owner(), balance);
        emit EmergencyWithdraw(token, owner(), balance);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Withdraw ETH from the contract (if any)
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        payable(owner()).transfer(balance);
    }

    /**
     * @notice Receive function to accept ETH
     */
    receive() external payable {}
}