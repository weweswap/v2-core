import { expect } from "chai";
import hre = require("hardhat");
import {
  ArrakisV2,
  ArrakisV2Factory,
  IUniswapV3Factory,
  IUniswapV3Pool,
  ISwapRouter,
  ArrakisV2Resolver,
  Position,
  IFeeManager,
} from "../../typechain";
import { getAddresses, Addresses } from "../../src/addresses";
import { Signer } from "ethers";
import { Contract } from "ethers";
import { ManagerProxyMock } from "../../typechain/contracts/__mocks__/ManagerProxyMock";

const { ethers, deployments } = hre;

async function increaseBalance(address: string, amount: string) {
  const balance = ethers.utils.hexlify(
    ethers.utils.parseUnits(amount, "ether")
  ); // Convierte a hexadecimal correctamente
  await hre.network.provider.send("hardhat_setBalance", [address, balance]);
}

async function generateFees(
  userAddr: string,
  wMatic: Contract,
  swapR: Contract,
  addresses: any,
  wEth: Contract,
  usdc: Contract
) {
  await increaseBalance(userAddr, "2000"); // 10,000 ETH/MATIC
  await wMatic.deposit({ value: ethers.utils.parseUnits("1999", 18) });
  await wMatic.approve(swapR.address, ethers.utils.parseUnits("1999", 18));

  await swapR.exactInputSingle({
    tokenIn: addresses.WMATIC,
    tokenOut: addresses.WETH,
    fee: 500,
    recipient: userAddr,
    deadline: ethers.constants.MaxUint256,
    amountIn: ethers.utils.parseUnits("1999", 18),
    amountOutMinimum: ethers.constants.Zero,
    sqrtPriceLimitX96: 0,
  });

  await wEth.approve(swapR.address, ethers.utils.parseEther("0.0019"));

  await swapR.exactInputSingle({
    tokenIn: wEth.address,
    tokenOut: usdc.address,
    fee: 500,
    recipient: userAddr,
    deadline: ethers.constants.MaxUint256,
    amountIn: ethers.utils.parseEther("0.0019"),
    amountOutMinimum: ethers.constants.Zero,
    sqrtPriceLimitX96: 0,
  });
}

describe("Arrakis V2 integration test!!!", async function () {
  this.timeout(0);

  let user: Signer;
  let user2: Signer;
  let owner: Signer;
  let userAddr: string;
  let arrakisV2Factory: ArrakisV2Factory;
  let vaultV2: ArrakisV2;
  let pool: IUniswapV3Pool;
  let uniswapV3Factory: IUniswapV3Factory;
  let uniswapV3Pool: IUniswapV3Pool;
  let arrakisV2Resolver: ArrakisV2Resolver;
  let position: Position;
  let swapRouter: ISwapRouter;
  let wMatic: Contract;
  let wEth: Contract;
  let usdc: Contract;
  let addresses: Addresses;
  let lowerTick: number;
  let upperTick: number;
  let feeManager: IFeeManager;

  let managerProxyMock: ManagerProxyMock;

  beforeEach("Setting up for V2 functions integration test", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    [user, , owner, user2] = await ethers.getSigners();

    userAddr = await user.getAddress();

    addresses = getAddresses(hre.network.name);
    await deployments.fixture();

    arrakisV2Factory = (await ethers.getContract(
      "ArrakisV2Factory"
    )) as ArrakisV2Factory;

    arrakisV2Resolver = (await ethers.getContract(
      "ArrakisV2Resolver"
    )) as ArrakisV2Resolver;

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

    position = (await ethers.getContract("Position", user)) as Position;

    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

    wEth = new ethers.Contract(
      addresses.WETH,
      [
        "function decimals() external view returns (uint8)",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address to, uint256 amount) external returns (bool)",
      ],
      user
    );

    usdc = new ethers.Contract(
      addresses.USDC,
      [
        "function decimals() external view returns (uint8)",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address to, uint256 amount) external returns (bool)",
      ],
      user
    );

    // #region Price computation.

    // const usdcDecimals = await usdc.decimals();
    // const wEthDecimals = await wEth.decimals();

    // const price = slot0.sqrtPriceX96
    //   .pow(2)
    //   .mul(
    //     ethers.utils
    //       .parseUnits("1", 18)
    //       .mul(ethers.utils.parseUnits("1", usdcDecimals))
    //       .div(ethers.utils.parseUnits("1", wEthDecimals))
    //   )
    //   .div(BigNumber.from("2").pow(96).pow(2));

    // const price1 = BigNumber.from("2")
    //   .pow(96)
    //   .pow(2)
    //   .mul(
    //     ethers.utils
    //       .parseUnits("1", 18)
    //       .mul(ethers.utils.parseUnits("1", wEthDecimals))
    //       .div(ethers.utils.parseUnits("1", usdcDecimals))
    //   )
    //   .div(slot0.sqrtPriceX96.pow(2));

    // #endregion Price computation.

    // For initialization.
    const res = await arrakisV2Resolver.getAmountsForLiquidity(
      slot0.sqrtPriceX96,
      lowerTick,
      upperTick,
      ethers.utils.parseUnits("1", 18)
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
        routers: [addresses.SwapRouter],
      },
      true
    );

    // vaultV2 = (await ethers.getContract("ArrakisV2", user)) as ArrakisV2;

    // vaultV2.initialize("Token 1", "Symbol 1", {
    //   feeTiers: [500],
    //   token0: addresses.USDC,
    //   token1: addresses.WETH,
    //   owner: userAddr,
    //   init0: res.amount0,
    //   init1: res.amount1,
    //   manager: managerProxyMock.address,
    //   maxTwapDeviation: 100,
    //   twapDuration: 2000,
    //   maxSlippage: 100,
    // });

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    vaultV2 = (await ethers.getContractAt(
      "ArrakisV2",
      result?.vault,
      user
    )) as ArrakisV2;

    const chaosTokenFactory = await ethers.getContractFactory("MockERC20");
    const chaosToken = await chaosTokenFactory.deploy();
    const feeManagerFactory = await ethers.getContractFactory("FeeManager");
    feeManager = (await feeManagerFactory.deploy(
      vaultV2.address,
      addresses.USDC,
      chaosToken.address,
      addresses.SwapRouter02,
      3000
    )) as IFeeManager;

    vaultV2.connect(user).setFeeManager(feeManager.address);

    // TODO: Reenable once we support manager fees
    // await managerProxyMock.setManagerFeeBPS(
    //   vaultV2.address,
    //   await managerProxyMock.managerFeeBPS()
    // );

    // #region get some USDC and WETH tokens from Uniswap V3.

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

    await wMatic.deposit({ value: ethers.utils.parseUnits("1000", 18) });

    await wMatic.approve(swapRouter.address, ethers.constants.MaxUint256);

    // #region swap wrapped matic for wrapped eth.

    await swapRouter.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.WETH,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("1000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    // #endregion swap wrapped matic for wrapped eth.

    // #region swap wrapped matic for usdc.

    await wMatic.deposit({ value: ethers.utils.parseUnits("1000", 18) });

    await swapRouter.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.USDC,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("1000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    // #endregion swap wrapped matic for usdc.

    // #endregion get some USDC and WETH tokens from Uniswap V3.

    pool = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniswapV3Factory.getPool(addresses.USDC, addresses.WETH, 500),
      user
    )) as IUniswapV3Pool;
  });

  it("#0: Deposit token and Mint Arrakis V2 tokens ", async () => {
    // #region approve weth and usdc token to vault.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    const wethBalance = await wEth.balanceOf(userAddr);
    const usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    const result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    const balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis vault V2 token.
  });

  it("#1: Burn Minted Arrakis V2 tokens", async () => {
    // #region mint arrakis token by Lp.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    const wethBalance = await wEth.balanceOf(userAddr);
    const usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    const result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    let balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis token by Lp.
    // #region burn token to get back token to user.

    await vaultV2.burn(result.mintAmount, userAddr);

    balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(0);

    // #endregion burn token to get back token to user.
  });

  it("#2: Rebalance after mint and burn of Arrakis V2 tokens", async () => {
    // #region mint arrakis token by Lp.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    const wethBalance = await wEth.balanceOf(userAddr);
    const usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    const result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    let balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis token by Lp.
    // #region rebalance to deposit user token into the uniswap v3 pool.

    const rebalanceParams = await arrakisV2Resolver.standardRebalance(
      [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
      vaultV2.address
    );

    await managerProxyMock.rebalance(vaultV2.address, rebalanceParams);

    // #region do a swap to generate fees.

    const swapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const swapR: ISwapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      swapRouter,
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
    // #region burn token to get back token to user.

    // await wMatic.deposit({ value: ethers.utils.parseUnits("1000", 18) });
    // await wMatic.approve(swapR.address, ethers.utils.parseUnits("1000", 18));

    // await swapR.exactInputSingle({
    //   tokenIn: addresses.WMATIC,
    //   tokenOut: addresses.WETH,
    //   fee: 500,
    //   recipient: userAddr,
    //   deadline: ethers.constants.MaxUint256,
    //   amountIn: ethers.utils.parseUnits("1000", 18),
    //   amountOutMinimum: ethers.constants.Zero,
    //   sqrtPriceLimitX96: 0,
    // });

    // await wEth.approve(swapR.address, ethers.utils.parseEther("0.001"));

    // const amountOut = await swapR.callStatic.exactInputSingle({
    //   tokenIn: wEth.address,
    //   tokenOut: usdc.address,
    //   fee: 500,
    //   recipient: userAddr,
    //   deadline: ethers.constants.MaxUint256,
    //   amountIn: ethers.utils.parseEther("0.001"),
    //   amountOutMinimum: ethers.constants.Zero,
    //   sqrtPriceLimitX96: 0,
    // });

    // #region rebalance to do a swap.

    const liquidity = pool.positions(
      position.getPositionId(vaultV2.address, lowerTick, upperTick)
    );

    await managerProxyMock.rebalance(vaultV2.address, {
      burns: [
        {
          range: { lowerTick, upperTick, feeTier: 500 },
          liquidity: (await liquidity)._liquidity,
        },
      ],
      swap: {
        amountIn: ethers.utils.parseEther("0.001"),
        expectedMinReturn: 2626887,
        router: swapR.address,
        zeroForOne: false,
        payload: swapR.interface.encodeFunctionData("exactInputSingle", [
          {
            tokenIn: wEth.address,
            tokenOut: usdc.address,
            fee: 500,
            recipient: vaultV2.address,
            deadline: ethers.constants.MaxUint256,
            amountIn: ethers.utils.parseEther("0.001"),
            amountOutMinimum: ethers.constants.Zero,
            sqrtPriceLimitX96: 0,
          },
        ]),
      },
      mints: [],
      minBurn0: ethers.constants.Zero,
      minBurn1: ethers.constants.Zero,
      minDeposit0: ethers.constants.Zero,
      minDeposit1: ethers.constants.Zero,
    });

    // #endregion rebalance to do a swap.

    await vaultV2.burn(result.mintAmount, userAddr);

    balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(0);

    // #endregion burn token to get back token to user.

    // #region rebalance to remove the range.

    await managerProxyMock.rebalance(
      vaultV2.address,
      await arrakisV2Resolver.standardRebalance([], vaultV2.address)
    );

    // #endregion rebalance to remove the range.

    // #region withdraw as manager.

    // TODO: Reenable once we support manager fees

    // const managerAddr = await vaultV2.manager();

    // managerProxyMock.fundVaultBalance(vaultV2.address, {
    //   value: ethers.utils.parseEther("1"),
    // });

    // const managerT0B = await usdc.balanceOf(managerAddr);
    // const managerT1B = await wEth.balanceOf(managerAddr);

    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [managerAddr],
    // });

    // const managerSigner = await ethers.getSigner(managerAddr);

    // await vaultV2.connect(managerSigner).withdrawManagerBalance();

    // await hre.network.provider.request({
    //   method: "hardhat_stopImpersonatingAccount",
    //   params: [managerAddr],
    // });

    // const managerT0A = await usdc.balanceOf(managerAddr);
    // const managerT1A = await wEth.balanceOf(managerAddr);

    // expect(managerT0A).to.be.gte(managerT0B);
    // expect(managerT1A).to.be.gt(managerT1B);

    // #region withdraw as manager.
  });

  it("#3: Rebalance without swap after mint and burn of Arrakis V2 tokens", async () => {
    // #region mint arrakis token by Lp.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    const wethBalance = await wEth.balanceOf(userAddr);
    const usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    const result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    let balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis token by Lp.
    // #region rebalance to deposit user token into the uniswap v3 pool.

    const rebalanceParams = await arrakisV2Resolver.standardRebalance(
      [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
      vaultV2.address
    );

    await managerProxyMock.rebalance(vaultV2.address, rebalanceParams);

    // #region do a swap to generate fees.

    const swapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const swapR: ISwapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      swapRouter,
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
    // #region burn token to get back token to user.

    // #endregion rebalance to do a swap.

    await vaultV2.burn(result.mintAmount, userAddr);

    balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(0);

    // #endregion burn token to get back token to user.

    // #region rebalance to remove the range.

    await managerProxyMock.rebalance(
      vaultV2.address,
      await arrakisV2Resolver.standardRebalance([], vaultV2.address)
    );

    // #endregion rebalance to remove the range.

    // #region withdraw as manager.

    // TODO: Reenable once we support manager fees
    // const managerAddr = await vaultV2.manager();

    // managerProxyMock.fundVaultBalance(vaultV2.address, {
    //   value: ethers.utils.parseEther("1"),
    // });

    // const managerT0B = await usdc.balanceOf(managerAddr);
    // const managerT1B = await wEth.balanceOf(managerAddr);

    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [managerAddr],
    // });

    // const managerSigner = await ethers.getSigner(managerAddr);

    // await vaultV2.connect(managerSigner).withdrawManagerBalance();

    // await hre.network.provider.request({
    //   method: "hardhat_stopImpersonatingAccount",
    //   params: [managerAddr],
    // });

    // const managerT0A = await usdc.balanceOf(managerAddr);
    // const managerT1A = await wEth.balanceOf(managerAddr);

    // expect(managerT0A).to.be.gte(managerT0B);
    // expect(managerT1A).to.be.gt(managerT1B);

    // #region withdraw as manager.
  });

  it("#4: Rebalance without swap after mint, and another Lp is minting", async () => {
    // #region mint arrakis token by Lp.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    let wethBalance = await wEth.balanceOf(userAddr);
    let usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    let result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    const balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis token by Lp.
    // #region rebalance to deposit user token into the uniswap v3 pool.

    const rebalanceParams = await arrakisV2Resolver.standardRebalance(
      [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
      vaultV2.address
    );

    await managerProxyMock.rebalance(vaultV2.address, rebalanceParams);

    // #region do a swap to generate fees.

    const swapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const swapR: ISwapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      swapRouter,
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

    const user2Addr = await user2.getAddress();

    wethBalance = await wEth.balanceOf(userAddr);
    usdcBalance = await usdc.balanceOf(userAddr);

    await wEth.transfer(user2Addr, wethBalance);
    await usdc.transfer(user2Addr, usdcBalance);

    await wEth.connect(user2).approve(vaultV2.address, wethBalance);
    await usdc.connect(user2).approve(vaultV2.address, usdcBalance);

    result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.connect(user2).mint(result.mintAmount, user2Addr);

    // #endregion burn token to get back token to user.

    // #region rebalance to remove the range.

    await managerProxyMock.rebalance(
      vaultV2.address,
      await arrakisV2Resolver.standardRebalance([], vaultV2.address)
    );

    // #endregion rebalance to remove the range.

    // #region withdraw as manager.

    // TODO: Reenable once we support manager fees
    // const managerAddr = await vaultV2.manager();

    // managerProxyMock.fundVaultBalance(vaultV2.address, {
    //   value: ethers.utils.parseEther("1"),
    // });

    // const managerT0B = await usdc.balanceOf(managerAddr);
    // const managerT1B = await wEth.balanceOf(managerAddr);

    // await hre.network.provider.request({
    //   method: "hardhat_impersonateAccount",
    //   params: [managerAddr],
    // });

    // const managerSigner = await ethers.getSigner(managerAddr);

    // await vaultV2.connect(managerSigner).withdrawManagerBalance();

    // await hre.network.provider.request({
    //   method: "hardhat_stopImpersonatingAccount",
    //   params: [managerAddr],
    // });

    // const managerT0A = await usdc.balanceOf(managerAddr);
    // const managerT1A = await wEth.balanceOf(managerAddr);

    // expect(managerT0A).to.be.gte(managerT0B);
    // expect(managerT1A).to.be.gt(managerT1B);

    // #region withdraw as manager.
  });
  it("#5: Collect fees", async () => {
    // #region mint arrakis token by Lp.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    let wethBalance = await wEth.balanceOf(userAddr);
    let usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    let result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    const balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis token by Lp.
    // #region rebalance to deposit user token into the uniswap v3 pool.

    const rebalanceParams = await arrakisV2Resolver.standardRebalance(
      [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
      vaultV2.address
    );

    await managerProxyMock.rebalance(vaultV2.address, rebalanceParams);

    // #region do a swap to generate fees.

    const swapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const swapR: ISwapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      swapRouter,
      user
    )) as ISwapRouter;

    await wMatic.deposit({ value: ethers.utils.parseUnits("3000", 18) });
    await wMatic.approve(swapR.address, ethers.utils.parseUnits("3000", 18));

    await swapR.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.WETH,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("3000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    await wEth.approve(swapR.address, ethers.utils.parseEther("0.003"));

    await swapR.exactInputSingle({
      tokenIn: wEth.address,
      tokenOut: usdc.address,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseEther("0.003"),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    // #endregion do a swap to generate fess.

    // #endregion rebalance to deposit user token into the uniswap v3 pool.

    const user2Addr = await user2.getAddress();

    wethBalance = await wEth.balanceOf(userAddr);
    usdcBalance = await usdc.balanceOf(userAddr);

    await wEth.transfer(user2Addr, wethBalance);
    await usdc.transfer(user2Addr, usdcBalance);

    await wEth.connect(user2).approve(vaultV2.address, wethBalance);
    await usdc.connect(user2).approve(vaultV2.address, usdcBalance);

    result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.collectFees();
    await vaultV2.connect(user2).mint(result.mintAmount, user2Addr);

    const balance2 = await vaultV2.balanceOf(user2Addr);

    expect(balance2).to.be.eq(result.mintAmount);

    // #region do a swap to generate fees.

    for (let i = 0; i < 1; i++) {
      await generateFees(userAddr, wMatic, swapR, addresses, wEth, usdc);
    }

    await vaultV2.collectFees();

    // Claim all fees from fee manager
    const feeManagerUser: IFeeManager = (await ethers.getContractAt(
      "FeeManager",
      feeManager.address,
      user2Addr
    )) as IFeeManager;

    const prevBalanceUser2 = await usdc.balanceOf(user2Addr);
    await feeManagerUser.claimFees(user2Addr);
    const postBalanceUser2 = await usdc.balanceOf(user2Addr);

    expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.closeTo(
      ethers.utils.parseUnits("0.000064", 6),
      0
    );

    const prevBalanceUser = await usdc.balanceOf(userAddr);
    await feeManagerUser.connect(user).claimFees(userAddr);
    const postBalanceUser = await usdc.balanceOf(userAddr);

    expect(postBalanceUser.sub(prevBalanceUser)).to.be.closeTo(
      ethers.utils.parseUnits("0.000190", 6),
      0
    );
  });
  it("#6: Burn twice don't collect more rewards than expected", async () => {
    // #region mint arrakis token by Lp.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    let wethBalance = await wEth.balanceOf(userAddr);
    let usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    let result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    const balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis token by Lp.
    // #region rebalance to deposit user token into the uniswap v3 pool.

    const rebalanceParams = await arrakisV2Resolver.standardRebalance(
      [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
      vaultV2.address
    );

    await managerProxyMock.rebalance(vaultV2.address, rebalanceParams);

    // #region do a swap to generate fees.

    const swapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const swapR: ISwapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      swapRouter,
      user
    )) as ISwapRouter;

    await wMatic.deposit({ value: ethers.utils.parseUnits("3000", 18) });
    await wMatic.approve(swapR.address, ethers.utils.parseUnits("3000", 18));

    await swapR.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.WETH,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("3000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    await wEth.approve(swapR.address, ethers.utils.parseEther("0.003"));

    await swapR.exactInputSingle({
      tokenIn: wEth.address,
      tokenOut: usdc.address,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseEther("0.003"),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    // #endregion do a swap to generate fess.

    // #endregion rebalance to deposit user token into the uniswap v3 pool.

    const user2Addr = await user2.getAddress();

    wethBalance = await wEth.balanceOf(userAddr);
    usdcBalance = await usdc.balanceOf(userAddr);

    await wEth.transfer(user2Addr, wethBalance);
    await usdc.transfer(user2Addr, usdcBalance);

    await wEth.connect(user2).approve(vaultV2.address, wethBalance);
    await usdc.connect(user2).approve(vaultV2.address, usdcBalance);

    result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.collectFees();
    await vaultV2.connect(user2).mint(result.mintAmount, user2Addr);

    const balance2 = await vaultV2.balanceOf(user2Addr);

    expect(balance2).to.be.eq(result.mintAmount);

    // #region do a swap to generate fees.

    for (let i = 0; i < 1; i++) {
      // User 1 per loop 190
      // User 2 per loop 64
      await generateFees(userAddr, wMatic, swapR, addresses, wEth, usdc);
    }

    const prevBalanceUser2 = await usdc.balanceOf(user2Addr);
    await vaultV2.connect(user2).burn("1000", user2Addr);
    const postBalanceUser2 = await usdc.balanceOf(user2Addr);

    expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.closeTo(
      ethers.utils.parseUnits("0.000064", 6),
      0
    );

    const prevBalanceUser2twice = await usdc.balanceOf(user2Addr);
    await vaultV2.connect(user2).burn("1000", user2Addr);
    const postBalanceUser2twice = await usdc.balanceOf(user2Addr);

    expect(postBalanceUser2twice.sub(prevBalanceUser2twice)).to.be.equal(0);
  });
  it("#7: Mint twice don't collect more rewards than expected", async () => {
    // #region mint arrakis token by Lp.

    await wEth.approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc.approve(vaultV2.address, ethers.constants.MaxUint256);

    // #endregion approve weth and usdc token to vault.

    // #region user balance of weth and usdc.

    let wethBalance = await wEth.balanceOf(userAddr);
    let usdcBalance = await usdc.balanceOf(userAddr);

    // #endregion user balance of weth and usdc.

    // #region mint arrakis vault V2 token.

    let result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.mint(result.mintAmount, userAddr);

    const balance = await vaultV2.balanceOf(userAddr);

    expect(balance).to.be.eq(result.mintAmount);

    // #endregion mint arrakis token by Lp.
    // #region rebalance to deposit user token into the uniswap v3 pool.

    const rebalanceParams = await arrakisV2Resolver.standardRebalance(
      [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
      vaultV2.address
    );

    await managerProxyMock.rebalance(vaultV2.address, rebalanceParams);

    // #region do a swap to generate fees.

    const swapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const swapR: ISwapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      swapRouter,
      user
    )) as ISwapRouter;

    await wMatic.deposit({ value: ethers.utils.parseUnits("3000", 18) });
    await wMatic.approve(swapR.address, ethers.utils.parseUnits("3000", 18));

    await swapR.exactInputSingle({
      tokenIn: addresses.WMATIC,
      tokenOut: addresses.WETH,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseUnits("3000", 18),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    await wEth.approve(swapR.address, ethers.utils.parseEther("0.003"));

    await swapR.exactInputSingle({
      tokenIn: wEth.address,
      tokenOut: usdc.address,
      fee: 500,
      recipient: userAddr,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseEther("0.003"),
      amountOutMinimum: ethers.constants.Zero,
      sqrtPriceLimitX96: 0,
    });

    // #endregion do a swap to generate fess.

    // #endregion rebalance to deposit user token into the uniswap v3 pool.

    const user2Addr = await user2.getAddress();

    wethBalance = await wEth.balanceOf(userAddr);
    usdcBalance = await usdc.balanceOf(userAddr);

    await wEth.transfer(user2Addr, wethBalance);
    await usdc.transfer(user2Addr, usdcBalance);

    await wEth
      .connect(user2)
      .approve(vaultV2.address, ethers.constants.MaxUint256);
    await usdc
      .connect(user2)
      .approve(vaultV2.address, ethers.constants.MaxUint256);

    result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      usdcBalance,
      wethBalance
    );

    await vaultV2.collectFees();
    await vaultV2.connect(user2).mint(result.mintAmount, user2Addr);

    const balance2 = await vaultV2.balanceOf(user2Addr);

    expect(balance2).to.be.eq(result.mintAmount);

    // #region do a swap to generate fees.

    for (let i = 0; i < 1; i++) {
      await generateFees(userAddr, wMatic, swapR, addresses, wEth, usdc);
    }

    result = await arrakisV2Resolver.getMintAmounts(
      vaultV2.address,
      "1000",
      "1000"
    );

    const prevBalanceUser2 = await usdc.balanceOf(user2Addr);
    await vaultV2.connect(user2).mint("1000", user2Addr);
    const postBalanceUser2 = await usdc.balanceOf(user2Addr);

    expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.closeTo(
      ethers.utils.parseUnits("0.000064", 6).sub(result.amount0),
      0
    );

    const prevBalanceUser2twice = await usdc.balanceOf(user2Addr);
    await vaultV2.connect(user2).mint("1000", user2Addr);
    const postBalanceUser2twice = await usdc.balanceOf(user2Addr);

    expect(
      postBalanceUser2twice.sub(prevBalanceUser2twice).add(result.amount0)
    ).to.be.equal(ethers.utils.parseUnits("0", 6));
  });
});
