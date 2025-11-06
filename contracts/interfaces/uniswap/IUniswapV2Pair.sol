// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUniswapV2Pair
 * @notice Interface for Uniswap V2 Pair contract
 * @dev Used to query reserves and other pair data
 */
interface IUniswapV2Pair {
    /**
     * @notice Returns the reserves of token0 and token1 used to price trades
     * @return reserve0 The reserve of token0
     * @return reserve1 The reserve of token1
     * @return blockTimestampLast The timestamp of the last block when reserves were updated
     */
    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );

    /**
     * @notice Returns the address of the pair token0
     */
    function token0() external view returns (address);

    /**
     * @notice Returns the address of the pair token1
     */
    function token1() external view returns (address);

    /**
     * @notice Returns the factory address
     */
    function factory() external view returns (address);

    /**
     * @notice Returns the price of token0 cumulative
     */
    function price0CumulativeLast() external view returns (uint256);

    /**
     * @notice Returns the price of token1 cumulative
     */
    function price1CumulativeLast() external view returns (uint256);

    /**
     * @notice Swaps tokens
     * @param amount0Out The amount of token0 to send out
     * @param amount1Out The amount of token1 to send out
     * @param to The recipient address
     * @param data Optional callback data
     */
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    /**
     * @notice Mints liquidity tokens
     * @param to The recipient address
     * @return liquidity The amount of liquidity minted
     */
    function mint(address to) external returns (uint256 liquidity);

    /**
     * @notice Burns liquidity tokens
     * @param to The recipient address
     * @return amount0 The amount of token0 received
     * @return amount1 The amount of token1 received
     */
    function burn(address to) external returns (uint256 amount0, uint256 amount1);

    /**
     * @notice Emitted each time reserves are updated
     */
    event Sync(uint112 reserve0, uint112 reserve1);

    /**
     * @notice Emitted each time a swap occurs
     */
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
}