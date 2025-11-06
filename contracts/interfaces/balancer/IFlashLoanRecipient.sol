// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../common/IERC20.sol";

/**
 * @title IFlashLoanRecipient
 * @notice Interface that must be implemented by contracts that receive flash loans from Balancer V2
 * @dev The receiver contract must implement the receiveFlashLoan function
 */
interface IFlashLoanRecipient {
    /**
     * @notice Receives and executes on flash-loaned tokens
     * @dev When this function is called, the Vault will have transferred tokens to the recipient
     * @param tokens The tokens received in the flash loan
     * @param amounts The amounts of each token received
     * @param feeAmounts The fee amounts for each token (usually 0 for Balancer)
     * @param userData Arbitrary data passed from the flash loan initiator
     */
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}