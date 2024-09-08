// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IFeeManager {
    // Getter para la dirección del vault
    function vault() external view returns (IERC20);

    // Getter para la dirección del USDC
    function usdc() external view returns (IERC20);

    // Getter para accumulatedRewardsPerShare
    function accumulatedRewardsPerShare() external view returns (uint256);

    // Getter para rewardDebt de un usuario
    function rewardDebt(address _user) external view returns (uint256);

    // Getter para REWARDS_PRECISION
    function REWARDS_PRECISION() external view returns (uint256);

    // Setter para rewardDebt de un usuario (solo puede ser llamado por el vault)
    function setRewardDebt(address _user, uint256 _amount) external;

    // Función para que los usuarios reclamen las fees
    function claimFees(address claimer) external;

    // Función para depositar fees, solo puede ser llamada por el vault
    function depositFees(
        address token0,
        uint256 fees0,
        address token1,
        uint256 fees1
    ) external;
}
