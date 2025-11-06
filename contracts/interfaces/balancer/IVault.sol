// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../common/IERC20.sol";
import "./IFlashLoanRecipient.sol";

/**
 * @title IVault
 * @notice Interface for Balancer V2 Vault contract
 * @dev Defines flash loan functionality for Balancer V2
 */
interface IVault {
    /**
     * @notice Performs a flash loan
     * @param recipient The contract receiving the flash loan, and must implement IFlashLoanRecipient
     * @param tokens The tokens to be loaned
     * @param amounts The amount of each token to loan
     * @param userData Arbitrary data to pass to the recipient contract
     */
    function flashLoan(
        IFlashLoanRecipient recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;

    /**
     * @notice Returns the protocol's swap fee percentage
     * @return The swap fee percentage
     */
    function getProtocolFeesCollector() external view returns (address);
}