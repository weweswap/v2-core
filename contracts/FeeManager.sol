// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IFeeManager} from "./interfaces/IFeeManager.sol";
import {FullMath} from "@arrakisfi/v3-lib-0.8/contracts/LiquidityAmounts.sol";
import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IV3SwapRouter} from "./univ3-0.8/IV3SwapRouter.sol";
import {ISwapRouter02} from "./univ3-0.8/ISwapRouter02.sol";
import {TransferHelper} from "./univ3-0.8/TransferHelper.sol";

contract FeeManager is IFeeManager {
    using SafeERC20 for IERC20;

    IERC20 public immutable vault;
    IERC20 public immutable usdc;
    uint256 public accumulatedRewardsPerShare;
    mapping(address => uint256) public rewardDebt;
    uint256 public constant REWARDS_PRECISION = 1e18;
    ISwapRouter02 public immutable swapRouter =
        ISwapRouter02(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45);
    IERC20 public immutable USDC =
        IERC20(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174);

    modifier onlyVault() {
        require(address(vault) == msg.sender, "Only vault can call");
        _;
    }

    constructor(address vault_, address usdc_) {
        vault = IERC20(vault_);
        usdc = IERC20(usdc_);
    }

    // Setter para rewardDebt de un usuario
    function setRewardDebt(address _user, uint256 _amount) external onlyVault {
        rewardDebt[_user] = _amount;
    }

    function claimFees(address claimer) public {
        uint256 userBalance = vault.balanceOf(claimer);
        uint256 totalReward = FullMath.mulDiv(
            userBalance,
            accumulatedRewardsPerShare,
            REWARDS_PRECISION
        );
        uint256 rewardsToHarvest = totalReward - rewardDebt[claimer];

        if (rewardsToHarvest == 0) {
            rewardDebt[claimer] = totalReward;
            return;
        }

        // TODO: Add event
        rewardDebt[claimer] = totalReward;

        usdc.safeTransfer(claimer, rewardsToHarvest);
    }

    function _swapToUSDC(address token, uint256 feesToken)
        internal
        returns (uint256 feesUSDC)
    {
        if (feesToken == 0) {
            return 0;
        }

        // Aprobar el router para gastar el token
        TransferHelper.safeApprove(token, address(swapRouter), feesToken);

        // Configurar los parámetros para ExactInputSingleParams
        IV3SwapRouter.ExactInputSingleParams memory params = IV3SwapRouter
            .ExactInputSingleParams({
                tokenIn: address(token),
                tokenOut: address(USDC),
                fee: 3000,
                recipient: address(this),
                amountIn: feesToken,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // console.log('Swapping fees to USDC', feesToken);

        // Ejecutar el swap
        feesUSDC = swapRouter.exactInputSingle(params);

        // console.log('Swapped to USDC', feesUSDC);
    }

    /// @dev This function wraps the _applyFees to use only one token without
    /// breaking the current logic of Arrakis
    function _convertFeesToUSDC(
        address token0,
        uint256 fee0,
        address token1,
        uint256 fee1
    ) internal returns (uint256 usdcFee) {
        // Solo meter a usdcFee el fee del token que no sea USDC
        if (address(token0) != address(USDC)) {
            usdcFee += _swapToUSDC(address(token0), fee0);
        }
        if (address(token1) != address(USDC)) {
            usdcFee += _swapToUSDC(address(token1), fee1);
        }
    }

    function depositFees(
        address token0,
        uint256 fees0,
        address token1,
        uint256 fees1
    ) public onlyVault {
        IERC20(token0).safeTransferFrom(address(vault), address(this), fees0);
        IERC20(token1).safeTransferFrom(address(vault), address(this), fees1);
        uint256 rewards = _convertFeesToUSDC(token0, fees0, token1, fees1);
        accumulatedRewardsPerShare =
            accumulatedRewardsPerShare +
            FullMath.mulDiv(rewards, REWARDS_PRECISION, vault.totalSupply());
    }
}
