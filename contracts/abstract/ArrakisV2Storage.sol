// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.13;

import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {
    IV3SwapRouter
} from "../univ3-0.8/IV3SwapRouter.sol";
import {ISwapRouter02} from "../univ3-0.8/ISwapRouter02.sol";
import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    ERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {
    Range,
    Rebalance,
    InitializePayload,
    UserLiquidityInfo,
    Withdraw
} from "../structs/SArrakisV2.sol";
import {hundredPercent} from "../constants/CArrakisV2.sol";
import {MathLib} from "../libraries/MathLib.sol"; 

/// @title ArrakisV2Storage base contract containing all ArrakisV2 storage variables.
// solhint-disable-next-line max-states-count
abstract contract ArrakisV2Storage is
    OwnableUpgradeable,
    ERC20Upgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathLib for uint256;
    
    ISwapRouter02 public immutable swapRouter = ISwapRouter02(0x2626664c2603336E57B271c5C0b26F421741e481);
    IUniswapV3Factory public immutable factory;

    IERC20 public token0;
    IERC20 public token1;

    uint256 public init0;
    uint256 public init1;

    // #region manager data

    uint16 public managerFeeBPS;
    uint256 public managerBalance0;
    uint256 public managerBalance1;
    address public manager;
    address public restrictedMint;

    // #endregion manager data

    // #region UserLiquidityInfo data

    uint256 public totalLiquidity; // TODO: Liquidez total de los holders
    uint256 public accumulatedRewardsPerShare0; // Recompensas acumuladas para token0
    uint256 public accumulatedRewardsPerShare1; // Recompensas acumuladas para token1
    mapping(address => UserLiquidityInfo) public userLiquidityInfo;
    uint256 public constant REWARDS_PRECISION = 1e12; // Precisión para evitar errores de redondeo

    // #endregion UserLiquidityInfo data

    Range[] internal _ranges;

    EnumerableSet.AddressSet internal _pools;
    EnumerableSet.AddressSet internal _routers;

    // #region events

    event LogMint(
        address indexed receiver,
        uint256 mintAmount,
        uint256 amount0In,
        uint256 amount1In
    );

    event LogBurn(
        address indexed receiver,
        uint256 burnAmount,
        uint256 amount0Out,
        uint256 amount1Out
    );

    event LPBurned(
        address indexed user,
        uint256 burnAmount0,
        uint256 burnAmount1
    );

    event LogRebalance(
        Rebalance rebalanceParams,
        uint256 swapDelta0,
        uint256 swapDelta1
    );

    event LogCollectedFees(uint256 fee0, uint256 fee1);

    event LogWithdrawManagerBalance(uint256 amount0, uint256 amount1);
    // #region Setting events

    event LogSetInits(uint256 init0, uint256 init1);
    event LogAddPools(uint24[] feeTiers);
    event LogRemovePools(address[] pools);
    event LogSetManager(address newManager);
    event LogSetManagerFeeBPS(uint16 managerFeeBPS);
    event LogRestrictedMint(address minter);
    event LogWhitelistRouters(address[] routers);
    event LogBlacklistRouters(address[] routers);
    // #endregion Setting events

    // #endregion events

    // #region modifiers

    modifier onlyManager() {
        require(manager == msg.sender, "NM");
        _;
    }

    // #endregion modifiers

    constructor(IUniswapV3Factory factory_) {
        require(address(factory_) != address(0), "ZF");
        factory = factory_;
    }

    // solhint-disable-next-line function-max-lines
    function initialize(
        string calldata name_,
        string calldata symbol_,
        InitializePayload calldata params_
    ) external initializer {
        require(params_.feeTiers.length > 0, "NFT");
        require(params_.token0 != address(0), "T0");
        require(params_.token0 < params_.token1, "WTO");
        require(params_.owner != address(0), "OAZ");
        require(params_.manager != address(0), "MAZ");
        require(params_.init0 > 0 || params_.init1 > 0, "I");

        __ERC20_init(name_, symbol_);
        __ReentrancyGuard_init();

        _addPools(params_.feeTiers, params_.token0, params_.token1);

        token0 = IERC20(params_.token0);
        token1 = IERC20(params_.token1);

        _whitelistRouters(params_.routers);

        _transferOwnership(params_.owner);

        manager = params_.manager;

        init0 = params_.init0;
        init1 = params_.init1;

        emit LogAddPools(params_.feeTiers);
        emit LogSetInits(params_.init0, params_.init1);
        emit LogSetManager(params_.manager);
    }

    // #region setter functions

    /// @notice set initial virtual allocation of token0 and token1
    /// @param init0_ initial virtual allocation of token 0.
    /// @param init1_ initial virtual allocation of token 1.
    /// @dev only callable by restrictedMint or by owner if restrictedMint is unset.
    function setInits(uint256 init0_, uint256 init1_) external {
        require(init0_ > 0 || init1_ > 0, "I");
        require(totalSupply() == 0, "TS");
        address requiredCaller = restrictedMint == address(0)
            ? owner()
            : restrictedMint;
        require(msg.sender == requiredCaller, "R");
        emit LogSetInits(init0 = init0_, init1 = init1_);
    }

    /// @notice whitelist pools
    /// @param feeTiers_ list of fee tiers associated to pools to whitelist.
    /// @dev only callable by owner.
    function addPools(uint24[] calldata feeTiers_) external onlyOwner {
        _addPools(feeTiers_, address(token0), address(token1));
        emit LogAddPools(feeTiers_);
    }

    /// @notice unwhitelist pools
    /// @param pools_ list of pools to remove from whitelist.
    /// @dev only callable by owner.
    function removePools(address[] calldata pools_) external onlyOwner {
        for (uint256 i = 0; i < pools_.length; i++) {
            require(_pools.contains(pools_[i]), "NP");

            _pools.remove(pools_[i]);
        }
        emit LogRemovePools(pools_);
    }

    /// @notice whitelist routers
    /// @param routers_ list of router addresses to whitelist.
    /// @dev only callable by owner.
    function whitelistRouters(address[] calldata routers_) external onlyOwner {
        _whitelistRouters(routers_);
    }

    /// @notice blacklist routers
    /// @param routers_ list of routers addresses to blacklist.
    /// @dev only callable by owner.
    function blacklistRouters(address[] calldata routers_) external onlyOwner {
        for (uint256 i = 0; i < routers_.length; i++) {
            require(_routers.contains(routers_[i]), "RW");

            _routers.remove(routers_[i]);
        }
        emit LogBlacklistRouters(routers_);
    }

    /// @notice set manager
    /// @param manager_ manager address.
    /// @dev only callable by owner.
    function setManager(address manager_) external onlyOwner nonReentrant {
        _collectFeesOnPools();
        _withdrawManagerBalance();
        manager = manager_;
        emit LogSetManager(manager_);
    }

    /// @notice set manager fee bps
    /// @param managerFeeBPS_ manager fee in basis points.
    /// @dev only callable by manager.
    function setManagerFeeBPS(uint16 managerFeeBPS_)
        external
        onlyManager
        nonReentrant
    {
        require(managerFeeBPS_ <= 10000, "MFO");
        _collectFeesOnPools();
        managerFeeBPS = managerFeeBPS_;
        emit LogSetManagerFeeBPS(managerFeeBPS_);
    }

    /// @notice set restricted minter
    /// @param minter_ address of restricted minter.
    /// @dev only callable by owner.
    function setRestrictedMint(address minter_) external onlyOwner {
        restrictedMint = minter_;
        emit LogRestrictedMint(minter_);
    }

    // #endregion setter functions

    // #region getter functions

    /// @notice get full list of ranges, guaranteed to contain all active vault LP Positions.
    /// @return ranges list of ranges
    function getRanges() external view returns (Range[] memory) {
        return _ranges;
    }

    function getPools() external view returns (address[] memory) {
        uint256 len = _pools.length();
        address[] memory output = new address[](len);
        for (uint256 i; i < len; i++) {
            output[i] = _pools.at(i);
        }

        return output;
    }

    function getRouters() external view returns (address[] memory) {
        uint256 len = _routers.length();
        address[] memory output = new address[](len);
        for (uint256 i; i < len; i++) {
            output[i] = _routers.at(i);
        }

        return output;
    }

    // #endregion getter functions

    // #region internal functions

    function _uniswapV3CallBack(uint256 amount0_, uint256 amount1_) internal {
        require(_pools.contains(msg.sender), "CC");

        if (amount0_ > 0) token0.safeTransfer(msg.sender, amount0_);
        if (amount1_ > 0) token1.safeTransfer(msg.sender, amount1_);
    }

    function _withdrawManagerBalance() internal {
        uint256 amount0 = managerBalance0;
        uint256 amount1 = managerBalance1;

        managerBalance0 = 0;
        managerBalance1 = 0;

        /// @dev token can blacklist manager and make this function fail,
        /// so we use try catch to deal with blacklisting.

        if (amount0 > 0) {
            // solhint-disable-next-line no-empty-blocks
            try token0.transfer(manager, amount0) {} catch {
                amount0 = 0;
            }
        }

        if (amount1 > 0) {
            // solhint-disable-next-line no-empty-blocks
            try token1.transfer(manager, amount1) {} catch {
                amount1 = 0;
            }
        }

        emit LogWithdrawManagerBalance(amount0, amount1);
    }

    function _addPools(
        uint24[] calldata feeTiers_,
        address token0Addr_,
        address token1Addr_
    ) internal {
        for (uint256 i = 0; i < feeTiers_.length; i++) {
            address pool = factory.getPool(
                token0Addr_,
                token1Addr_,
                feeTiers_[i]
            );

            require(pool != address(0), "ZA");
            require(!_pools.contains(pool), "P");

            // explicit.
            _pools.add(pool);
        }
    }

    function _collectFeesOnPools() internal {
        uint256 fees0;
        uint256 fees1;
        for (uint256 i; i < _ranges.length; i++) {
            Range memory range = _ranges[i];
            IUniswapV3Pool pool = IUniswapV3Pool(
                factory.getPool(address(token0), address(token1), range.feeTier)
            );

            /// @dev to update the position and collect fees.
            pool.burn(range.lowerTick, range.upperTick, 0);

            (uint256 collect0, uint256 collect1) = _collectFees(
                pool,
                range.lowerTick,
                range.upperTick
            );

            fees0 += collect0;
            fees1 += collect1;
        }

        _applyFees(fees0, fees1);
        emit LogCollectedFees(fees0, fees1);
    }

    function _collectFees(
        IUniswapV3Pool pool_,
        int24 lowerTick_,
        int24 upperTick_
    ) internal returns (uint256 collect0, uint256 collect1) {
        (collect0, collect1) = pool_.collect(
            address(this),
            lowerTick_,
            upperTick_,
            type(uint128).max,
            type(uint128).max
        );
    }

    function _whitelistRouters(address[] calldata routers_) internal {
        for (uint256 i = 0; i < routers_.length; i++) {
            require(
                routers_[i] != address(token0) &&
                    routers_[i] != address(token1),
                "RT"
            );
            require(!_routers.contains(routers_[i]), "CR");
            // explicit.
            _routers.add(routers_[i]);
        }

        emit LogWhitelistRouters(routers_);
    }

    function _applyFees(uint256 fee0_, uint256 fee1_) internal {
        uint16 mManagerFeeBPS = managerFeeBPS;

        // Calcular la cantidad que corresponde al manager y añadir a lo que ya tiene
        uint256 managerFee0 = MathLib.mulDiv(fee0_, mManagerFeeBPS, hundredPercent);
        uint256 managerFee1 = MathLib.mulDiv(fee1_, mManagerFeeBPS, hundredPercent);

        // Añadir a lo que ya tiene
        managerBalance0 += managerFee0;
        managerBalance1 += managerFee1;

        // Quitamos la parte del manager de los fees que se van a distribuir
        uint256 remainingFee0 = fee0_ - managerFee0;
        uint256 remainingFee1 = fee1_ - managerFee1;

        // Si hay liquidez en la pool, distribuir los fees entre los usuarios
        if (totalLiquidity > 0) {
            // Actualizar las recompensas acumuladas para cada token
            accumulatedRewardsPerShare0 += MathLib.mulDiv(remainingFee0, REWARDS_PRECISION, totalLiquidity);
            accumulatedRewardsPerShare1 += MathLib.mulDiv(remainingFee1, REWARDS_PRECISION, totalLiquidity);
        }
    }

    function _updateAllUserRewardDebt() internal {
        // TODO: Recoger los usuarios holders
        for (uint256 i = 0; i < _pools.length(); i++) {
            address user = _pools.at(i);
            UserLiquidityInfo storage userInfo = userLiquidityInfo[user];

            // Actualizamos su rewardDebt con los valores actuales TODO: revisar si esto está bien dividir entre el REWARDS_PRECISION
            userInfo.rewardDebtUSDC = 
                MathLib.mulDiv(userInfo.liquidity, accumulatedRewardsPerShare0, REWARDS_PRECISION); 
        }
    }

    function _swapToUSDC(
        address token,
        uint256 feesToken
    ) internal returns (uint256 feesUSDC) { // TODO: Literals
        require(token != address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) && feesToken > 0,
            "NUP");

        // Aprobar el router para gastar el token TODO: Literals
        IERC20(token).approve(address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913), feesToken);

        // Configurar los parámetros para ExactInputSingleParams TODO: Literals
        IV3SwapRouter.ExactInputSingleParams memory params = IV3SwapRouter.ExactInputSingleParams({
            tokenIn: address(token),
            tokenOut: address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913),
            fee: 500,
            recipient: address(this),
            amountIn: feesToken,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        // Ejecutar el swap TODO: Literals
        feesUSDC = swapRouter.exactInputSingle(params);
    }

    /// @dev This function wraps the _applyFees to use only one token without 
    /// breaking the current logic of Arrakis
    function _applyUSDCFees(uint256 fee0, uint256 fee1) internal {
        uint256 usdcFee;

        // Solo meter a usdcFee el fee del token que no sea USDC TODO: Literals
        if (address(token0) != address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)) {
            usdcFee += _swapToUSDC(address(token0), fee0);
        }
        if (address(token1) != address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)) {
            usdcFee += _swapToUSDC(address(token1), fee1);
        }
        _applyFees(usdcFee, 0);
    }

    function _withdraw(
        IUniswapV3Pool pool_,
        int24 lowerTick_,
        int24 upperTick_,
        uint128 liquidity_
    ) internal returns (Withdraw memory withdraw) {
        (withdraw.burn0, withdraw.burn1) = pool_.burn(
            lowerTick_,
            upperTick_,
            liquidity_
        );

        (uint256 collect0, uint256 collect1) = _collectFees(
            pool_,
            lowerTick_,
            upperTick_
        );

        withdraw.fee0 = collect0 - withdraw.burn0;
        withdraw.fee1 = collect1 - withdraw.burn1;
    }

    // #endregion internal functions
}
