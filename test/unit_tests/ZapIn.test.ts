/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "chai";
import { Contract, Signer } from "ethers";
import hre = require("hardhat");
import axios from "axios";
import {
  ArrakisV2,
  ArrakisV2Factory,
  ArrakisV2Resolver,
  FeeManager,
  ISwapRouter,
  IUniswapV3Factory,
  IUniswapV3Pool,
  ManagerProxyMock,
  ZapKyber,
} from "../../typechain";
import { getAddresses, Addresses } from "../../src/addresses";

const { ethers, deployments } = hre;

const AGGREGATOR_KYBERSWAP_BASEURL = "https://aggregator-api.kyberswap.com";

const api = axios.create({
  baseURL: AGGREGATOR_KYBERSWAP_BASEURL,
  headers: { accept: "application/json" },
});

async function getKyberParams(
  tokenIn: any,
  tokenOut: any,
  amountIn: string,
  userAddress: string
) {
  const chain = "polygon";
  const slippage = 25;

  const targetPathConfig = {
    params: {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amountIn: amountIn,
      gasInclude: "true",
    },
  };

  const routeResponse = await api.get(
    `${chain}/api/v1/routes?${new URLSearchParams(targetPathConfig.params)}`
  );
  const routeData = routeResponse.data;

  // Construir la transacción
  const requestBody = {
    routeSummary: routeData.data.routeSummary,
    sender: userAddress,
    recipient: userAddress,
    slippageTolerance: slippage,
    enableGasEstimation: false,
    skipSimulateTx: true,
    deadline: Math.floor(new Date().getTime() / 1000) + 1200,
  };

  const transactionResponse = await api.post(
    `/${chain}/api/v1/route/build`,
    JSON.stringify(requestBody)
  );

  const transactionData = transactionResponse.data;

  return {
    encodedCallData: transactionData.data.data,
    integrationData: transactionData.data.integrationData,
  };
}

describe("ZapInKyber unit test", function () {
  this.timeout(0);

  let user: Signer;
  let user2: Signer;
  let owner: Signer;
  let user4: Signer;
  let userAddr: string;
  let userAddr2: string;
  let userAddr3: string;
  let userAddr4: string;
  let uniswapV3Factory: IUniswapV3Factory;
  let uniswapV3Pool: IUniswapV3Pool;
  let arrakisV2: ArrakisV2;
  let arrakisV2Factory: ArrakisV2Factory;
  let managerProxyMock: ManagerProxyMock;
  let arrakisV2Resolver: ArrakisV2Resolver;
  let swapRouter: ISwapRouter;
  let addresses: Addresses;
  let feeManager: FeeManager;
  let wEth: Contract;
  let usdc: Contract;
  let chaos: Contract;
  let wMatic: Contract;
  let zapIn: Contract;
  let lowerTick: number;
  let upperTick: number;
  let slot0: any;

  beforeEach("Setting up for ZapIn functions unit test", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    await deployments.fixture();

    addresses = getAddresses(hre.network.name);

    [user, user2, owner, user4] = await ethers.getSigners();

    userAddr = await user.getAddress();
    userAddr2 = await user2.getAddress();
    userAddr3 = await owner.getAddress();
    userAddr4 = await user4.getAddress();

    arrakisV2Factory = (await ethers.getContract(
      "ArrakisV2Factory",
      user
    )) as ArrakisV2Factory;
    uniswapV3Factory = (await ethers.getContractAt(
      "IUniswapV3Factory",
      addresses.UniswapV3Factory,
      user
    )) as IUniswapV3Factory;
    managerProxyMock = (await ethers.getContract(
      "ManagerProxyMock"
    )) as ManagerProxyMock;
    uniswapV3Pool = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniswapV3Factory.getPool(addresses.USDC, addresses.WETH, 500),
      user
    )) as IUniswapV3Pool;
    arrakisV2Resolver = (await ethers.getContract(
      "ArrakisV2Resolver"
    )) as ArrakisV2Resolver;

    wEth = new ethers.Contract(
      addresses.WETH,
      [
        "function decimals() external view returns (uint8)",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address recipient, uint256 amount) external returns (bool)",
      ],
      user
    );

    usdc = new ethers.Contract(
      addresses.USDC,
      [
        "function decimals() external view returns (uint8)",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address recipient, uint256 amount) external returns (bool)",
      ],
      user
    );

    slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

    const res = await arrakisV2Resolver.getAmountsForLiquidity(
      slot0.sqrtPriceX96,
      lowerTick,
      upperTick,
      ethers.utils.parseUnits("0.01", 18)
    );

    const tx = await arrakisV2Factory.connect(owner).deployVault(
      {
        feeTiers: [500],
        token0: addresses.USDC,
        token1: addresses.WETH,
        owner: userAddr,
        init0: res.amount0,
        init1: res.amount1,
        manager: managerProxyMock.address,
        routers: [],
      },
      true
    );
    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    arrakisV2 = (await ethers.getContractAt(
      "ArrakisV2",
      result?.vault,
      user
    )) as ArrakisV2;

    const chaosTokenFactory = await ethers.getContractFactory("MockERC20");
    chaos = await chaosTokenFactory.deploy();
    const feeManagerFactory = await ethers.getContractFactory("FeeManager");
    feeManager = (await feeManagerFactory.deploy(
      arrakisV2.address,
      addresses.USDC,
      chaos.address,
      addresses.SwapRouter02,
      3000
    )) as FeeManager;

    await chaos.transfer(feeManager.address, ethers.utils.parseUnits("10000"));
    await feeManager.setRate(100);

    const zapInFactory = await ethers.getContractFactory("ZapKyber");
    console.log("addresses", addresses);
    zapIn = (await zapInFactory.deploy(addresses.kyberAggregator)) as ZapKyber;

    arrakisV2.connect(user).setFeeManager(feeManager.address);

    swapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      addresses.SwapRouter,
      user
    )) as ISwapRouter;

    wMatic = new ethers.Contract(
      addresses.WMATIC,
      [
        "function deposit() external payable",
        "function withdraw(uint256 _amount) external",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
      ],
      user
    );

    await wMatic.deposit({ value: ethers.utils.parseUnits("6000", 18) });

    await wMatic.approve(swapRouter.address, ethers.constants.MaxUint256);

    await swapRouter.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.WETH,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("3000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    await wMatic.deposit({ value: ethers.utils.parseUnits("2000", 18) });

    await swapRouter.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.USDC,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("2000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    await wEth.approve(arrakisV2.address, ethers.constants.MaxUint256);
    await usdc.approve(arrakisV2.address, ethers.constants.MaxUint256);

    const result2 = await arrakisV2Resolver.getMintAmounts(
      arrakisV2.address,
      res.amount0,
      res.amount1
    );

    await arrakisV2.mint(result2.mintAmount, userAddr2);

    const balance = await arrakisV2.balanceOf(userAddr2);

    expect(balance).to.be.eq(result2.mintAmount);

    const rebalanceParams = await arrakisV2Resolver.standardRebalance(
      [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
      arrakisV2.address
    );

    await managerProxyMock.rebalance(arrakisV2.address, rebalanceParams);

    // #region do a swap to generate fees.

    const swapR: ISwapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      user
    )) as ISwapRouter;

    await wMatic.deposit({ value: ethers.utils.parseUnits("1000", 18) });
    await wMatic.approve(swapR.address, ethers.utils.parseUnits("1000", 18));

    await swapR.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.WETH,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("1000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    await wEth.approve(swapR.address, ethers.utils.parseEther("0.001"));

    await swapR.exactInputSingle({
      tokenIn: wEth.address,
      tokenOut: usdc.address,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseEther("0.001"),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    // #endregion do a swap to generate fess.

    // #endregion rebalance to deposit user token into the uniswap v3 pool.
  });

  describe("Single side fees", () => {
    it("#0: Get 100% when your are alone in the vault", async () => {
      await wEth.approve(arrakisV2.address, ethers.constants.MaxUint256);
      await usdc.approve(arrakisV2.address, ethers.constants.MaxUint256);

      const addressToImpersonate = "0x38019bC40f504BE4546F24083Ccaf0c8553C408A";
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [addressToImpersonate],
      });

      const user = await ethers.getSigner(addressToImpersonate);
      const userAddress = await user.getAddress();

      const result = await getKyberParams(
        addresses.USDC,
        addresses.WETH,
        "2000000",
        userAddress
      );

      console.log("route", result.encodedCallData);

      await usdc
        .connect(user)
        .approve(zapIn.address, ethers.constants.MaxUint256);

      const prevBalance = await arrakisV2.balanceOf(userAddress);

      await zapIn
        .connect(user)
        .zapIn(
          arrakisV2.address,
          usdc.address,
          "2000000",
          "10",
          result.encodedCallData,
          result.encodedCallData
        );

      const postBalance = await arrakisV2.balanceOf(userAddress);

      console.log("prevBalance", prevBalance.toString());
      console.log("postBalance", postBalance.toString());
    });
  });
});
