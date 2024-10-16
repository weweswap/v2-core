// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "./abstract/ArrakisV2Storage.sol";
import {IArrakisV2} from "./interfaces/IArrakisV2.sol";

contract ZapKyber {
    using SafeERC20 for IERC20;
    // address public immutable WETH;
    address public immutable AGGREGATION_ROUTER;
    address public immutable CHAOS_TOKEN = 0x6573D177273931c44Aa647DaAF90325545a7fCC4;
    uint256 public constant MINIMUM_AMOUNT = 1000;

    constructor(address _aggregationRouter) {
        AGGREGATION_ROUTER = _aggregationRouter;
        // WETH = _WETH;
    }
        
    function zapIn(
        address vault,
        address inputToken,
        uint256 tokenInAmount,
        uint256 mintAmount,
        bytes memory token0,
        bytes memory token1
    ) public {
        require(
            tokenInAmount >= MINIMUM_AMOUNT,
            "Weweswap: Insignificant input amount"
        );
        IERC20(inputToken).safeTransferFrom(
            msg.sender,
            address(this),
            tokenInAmount
        );
        _swapAndMint(vault, inputToken, inputToken, mintAmount, token0, token1);
    }

    function zapOut(
        address vault,
        uint256 sharesToBurn,
        address tokenToSwap,
        bytes memory routeToExecute
    ) public {
        IERC20(vault).safeTransferFrom(
            msg.sender,
            address(this),
            sharesToBurn
        );
        _burnAndSwap(vault, sharesToBurn, tokenToSwap, routeToExecute);
    }

    function propagateError(
        bool success,
        bytes memory data,
        string memory errorMessage
    ) public pure {
        // Forward error message from call/delegatecall
        if (!success) {
            if (data.length == 0) revert(errorMessage);
            assembly {
                revert(add(32, data), mload(data))
            }
        }
    }

    function _swapViaKyber(address _inputToken, bytes memory _callData)
        internal
        returns (uint256)
    {
        _approveTokenIfNeeded(_inputToken, address(AGGREGATION_ROUTER));

        (bool success, bytes memory retData) = AGGREGATION_ROUTER.call(
            _callData
        );

        propagateError(success, retData, "kyber");

        require(success == true, "calling Kyber got an error");
        uint256 actualAmount = abi.decode(retData, (uint256));
        return actualAmount;
    }

    function _approveTokenIfNeeded(address token, address spender) private {
        if (IERC20(token).allowance(address(this), spender) == 0) {
            IERC20(token).safeApprove(spender, type(uint256).max);
        }
    }

    function _swapAndMint(
        address vault,
        address inputToken0,
        address inputToken1,
        uint256 minAmount,
        bytes memory token0,
        bytes memory token1
    ) private {
        IArrakisV2 vaultInstance = IArrakisV2(vault);

        address[] memory path;
        if (inputToken0 == inputToken1) {
            path = new address[](3);
            path[0] = address(vaultInstance.token0());
            path[1] = address(vaultInstance.token1());
            path[2] = inputToken0;
        } else {
            path = new address[](4);
            path[0] = address(vaultInstance.token0());
            path[1] = address(vaultInstance.token1());
            path[2] = inputToken0;
            path[3] = inputToken1;
        }

        if (inputToken0 != path[0]) {
            _swapViaKyber(inputToken0, token0);
        }

        if (inputToken1 != path[1]) {
            _swapViaKyber(inputToken1, token1);
        }

        _approveTokenIfNeeded(address(vaultInstance.token0()), vault);
        _approveTokenIfNeeded(address(vaultInstance.token1()), vault);
        vaultInstance.mint(minAmount, msg.sender);
        _returnAssets(path);
    }

    function _burnAndSwap(
        address vault,
        uint256 sharesToBurn,
        address tokenToSwap,
        bytes memory routeToExecute
    ) private {
        IArrakisV2 vaultInstance = IArrakisV2(vault);

        address[] memory path = new address[](3);
        path[0] = address(vaultInstance.token0());
        path[1] = address(vaultInstance.token1());
        path[2] = address(CHAOS_TOKEN); // We need to return also CHAOS rewards to users

        vaultInstance.burn(sharesToBurn, address(this));

        _swapViaKyber(tokenToSwap, routeToExecute);

        _returnAssets(path);
    }

    function _returnAssets(address[] memory tokens) private {
        uint256 balance;
        for (uint256 i; i < tokens.length; i++) {
            balance = IERC20(tokens[i]).balanceOf(address(this));
            if (balance > 0) {
                // if (tokens[i] == WETH) {
                //     WETH.withdraw(balance);
                //     (bool success,) = msg.sender.call{value: balance}(new bytes(0));
                //     require(success, 'Weweswap: ETH transfer failed');
                // } else {
                    IERC20(tokens[i]).safeTransfer(msg.sender, balance);
                // }
            }
        }
    }
}
