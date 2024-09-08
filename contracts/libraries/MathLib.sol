// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

library MathLib {
    function mulDiv(
        uint256 a,
        uint256 b,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        result = (a * b) / denominator;
    }
}
