/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import hre = require("hardhat");
import {
  ArrakisV2,
  ArrakisV2Factory,
  ArrakisV2Resolver,
  FeeManager,
  IArrakisV2Factory,
  IArrakisV2Resolver,
  ISwapRouter,
  IUniswapV3Factory,
  IUniswapV3Pool,
  ManagerProxyMock,
} from "../../typechain";
import { getAddresses, Addresses } from "../../src/addresses";
const { ethers, deployments } = hre;

// Only acepts ERC20
const depositRewardsInVault = async (
  weth: Contract,
  fee0: BigNumber,
  usdc: Contract,
  fee1: BigNumber,
  feeManager: FeeManager,
  vaultToImpersonate: ArrakisV2
) => {
  // Generate add founds to de vault (simulate fees) + add matic for pay fees
  await weth.transfer(vaultToImpersonate.address, fee0);
  await usdc.transfer(vaultToImpersonate.address, fee1);

  // Start impersonation
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [vaultToImpersonate.address],
  });
  const maticBalance = ethers.utils.hexlify(
    ethers.utils.parseUnits("0.03", 18)
  );
  await hre.network.provider.send("hardhat_setBalance", [
    vaultToImpersonate.address,
    maticBalance,
  ]);
  const vaultSigner = await ethers.provider.getSigner(
    vaultToImpersonate.address
  );
  await weth
    .connect(vaultSigner)
    .approve(feeManager.address, ethers.constants.MaxUint256);
  await usdc
    .connect(vaultSigner)
    .approve(feeManager.address, ethers.constants.MaxUint256);
  await feeManager
    .connect(vaultSigner)
    .depositFees(weth.address, fee0, usdc.address, fee1);
  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [vaultToImpersonate.address],
  });
};

const deployVault = async (
  uniswapV3Pool: IUniswapV3Pool,
  arrakisV2Resolver: IArrakisV2Resolver,
  arrakisV2Factory: IArrakisV2Factory,
  managerProxyMock: ManagerProxyMock,
  owner: Signer,
  shareFraccion = 1,
  usdc: Contract,
  weth: Contract
) => {
  const slot0 = await uniswapV3Pool.slot0();
  const tickSpacing = await uniswapV3Pool.tickSpacing();
  const addresses = getAddresses(hre.network.name);

  const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
  const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

  const res = await arrakisV2Resolver.getAmountsForLiquidity(
    slot0.sqrtPriceX96,
    lowerTick,
    upperTick,
    ethers.utils.parseUnits("0.01", 18)
  );

  const tx = await arrakisV2Factory.deployVault(
    {
      feeTiers: [500],
      token0: addresses.USDC,
      token1: addresses.WETH,
      owner: await owner.getAddress(),
      init0: res.amount0.div(shareFraccion),
      init1: res.amount1.div(shareFraccion),
      manager: managerProxyMock.address,
      routers: [],
    },
    true
  );

  const rc = await tx.wait();
  const event = rc?.events?.find((event) => event.event === "VaultCreated");
  // eslint-disable-next-line no-unsafe-optional-chaining
  const result = event?.args;

  const arrakisV2 = (await ethers.getContractAt(
    "ArrakisV2",
    result?.vault,
    owner
  )) as ArrakisV2;

  const feeManagerFactory = await ethers.getContractFactory("FeeManager");
  const feeManager = (await feeManagerFactory.deploy(
    arrakisV2.address,
    addresses.USDC,
    addresses.SwapRouter02,
    addresses.QuoterV2,
    3000
  )) as FeeManager;

  arrakisV2.connect(owner).setFeeManager(feeManager.address);

  await weth.approve(arrakisV2.address, ethers.constants.MaxUint256);
  await usdc.approve(arrakisV2.address, ethers.constants.MaxUint256);

  await arrakisV2.mint("900000000000000000000000", await owner.getAddress());
  await arrakisV2.mint("99999000000000000000000", await owner.getAddress());
  const rebalanceParams = await arrakisV2Resolver.standardRebalance(
    [{ range: { lowerTick, upperTick, feeTier: 500 }, weight: 10000 }],
    arrakisV2.address
  );

  await managerProxyMock.rebalance(arrakisV2.address, rebalanceParams);

  return { customVault: arrakisV2, customFeeManager: feeManager };
};

describe("FeeManager unit test", function () {
  this.timeout(0);

  let user: Signer;
  let user2: Signer;
  let user3: Signer;
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
  let wMatic: Contract;
  let lowerTick: number;
  let upperTick: number;
  let slot0: any;

  beforeEach(
    "Setting up for FeeManager functions unit test",
    async function () {
      if (hre.network.name !== "hardhat") {
        console.error("Test Suite is meant to be run on hardhat only");
        process.exit(1);
      }

      await deployments.fixture();

      addresses = getAddresses(hre.network.name);

      [user, user2, user3, user4] = await ethers.getSigners();

      userAddr = await user.getAddress();
      userAddr2 = await user2.getAddress();
      userAddr3 = await user3.getAddress();
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

      const tx = await arrakisV2Factory.deployVault(
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

      const feeManagerFactory = await ethers.getContractFactory("FeeManager");
      feeManager = (await feeManagerFactory.deploy(
        arrakisV2.address,
        addresses.USDC,
        addresses.SwapRouter02,
        addresses.QuoterV2,
        3000
      )) as FeeManager;

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

      // #region swap wrapped matic for wrapped eth.

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

      // #endregion swap wrapped matic for wrapped eth.

      // #region swap wrapped matic for usdc.

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

      // #endregion swap wrapped matic for usdc.

      // #region mint arrakis token by Lp.

      await wEth.approve(arrakisV2.address, ethers.constants.MaxUint256);
      await usdc.approve(arrakisV2.address, ethers.constants.MaxUint256);

      // #endregion approve weth and usdc token to vault.

      // #region user balance of weth and usdc.

      // const wethBalance = await wEth.balanceOf(userAddr);
      // const usdcBalance = await usdc.balanceOf(userAddr);

      // #endregion user balance of weth and usdc.

      // #region mint arrakis vault V2 token.

      const result2 = await arrakisV2Resolver.getMintAmounts(
        arrakisV2.address,
        res.amount0,
        res.amount1
      );

      await arrakisV2.mint(result2.mintAmount, userAddr2);

      const balance = await arrakisV2.balanceOf(userAddr2);

      expect(balance).to.be.eq(result2.mintAmount);

      // #endregion mint arrakis token by Lp.
      // #region rebalance to deposit user token into the uniswap v3 pool.

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
    }
  );

  describe("Single side fees", () => {
    it("#0: Get 100% when your are alone in the vault", async () => {
      await wEth.approve(arrakisV2.address, ethers.constants.MaxUint256);
      await usdc.approve(arrakisV2.address, ethers.constants.MaxUint256);

      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("1", 6),
        feeManager,
        arrakisV2
      );

      const prevBalance = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      const postBalance = await usdc.balanceOf(userAddr2);

      expect(postBalance.sub(prevBalance)).to.be.equal(
        ethers.utils.parseUnits("1", 6)
      );
    });

    it("#1: Get half reward when your are 50% in the vault", async () => {
      await arrakisV2.mint("1000000000000000000", userAddr3);
      let postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3).to.be.equal(0);

      await feeManager.connect(user2).claimFees(userAddr2); // Claim fees to clean pending fees derived from mint

      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("1", 6),
        feeManager,
        arrakisV2
      );

      await arrakisV2.mint("1000000000000000000", userAddr4);
      let postBalanceUser4 = await usdc.balanceOf(userAddr4);
      expect(postBalanceUser4).to.be.equal(0);

      // User 2 can claim 50%
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);

      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("0.500000", 6)
      );

      // User 3 can claim 50%
      const prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(user2).claimFees(userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);

      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("0.500000", 6)
      );
      // User 4 can claim 0%
      postBalanceUser4 = await usdc.balanceOf(userAddr4);
      expect(postBalanceUser4).to.be.equal(0);
    });
    it("#2: Collect on burn", async () => {
      await arrakisV2.mint("1000000000000000000", userAddr4);
      await arrakisV2.collectFees(); // Claim fees to clean pending fees derived from mint
      await feeManager.connect(user2).claimFees(userAddr2); // Claim fees to clean pending fees derived from mint
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("3", 6),
        feeManager,
        arrakisV2
      );
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await arrakisV2.connect(user2).burn("1000000000000000000", userAddr);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("1.5", 6)
      );
    });
    it("#3: Collect on mint", async () => {
      await arrakisV2.mint("1000000000000000000", userAddr2);
      await arrakisV2.mint("1000000000000000000", userAddr3);
      await arrakisV2.collectFees(); // Claim fees to clean pending fees derived from mint
      await feeManager.connect(user2).claimFees(userAddr2); // Claim fees to clean pending fees derived from mint
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("3", 6),
        feeManager,
        arrakisV2
      );
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await arrakisV2.mint("1000000000000000000", userAddr2);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("2", 6)
      );
    });
    it("#4: Collect differente times with more than one user", async () => {
      // RewardsPerBlock = $1
      // On block 0, Staker A deposits $100
      // On block 10, Staker B deposits $400
      // On block 15, Staker A harvests all rewards
      // On block 25, Staker B harvests all rewards
      // On block 30, both stakers harvests all rewards.
      await arrakisV2.collectFees(); // Claim fees to clean pending fees derived from mint
      await feeManager.connect(user2).claimFees(userAddr2); // Claim fees to clean pending fees derived from mint
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      await arrakisV2.mint("4000000000000000000", userAddr3);
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("5", 6),
        feeManager,
        arrakisV2
      );
      let prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      let postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("11", 6)
      );
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      let prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(user3).claimFees(userAddr3);
      let postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("12", 6)
      );
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("5", 6),
        feeManager,
        arrakisV2
      );
      prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("3", 6)
      );
      prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(user3).claimFees(userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("4", 6)
      );
    });
  });

  describe("Dual side fees", async () => {
    it("#0: Get 100% when your are alone in the vault", async () => {
      await wEth.approve(arrakisV2.address, ethers.constants.MaxUint256);
      await usdc.approve(arrakisV2.address, ethers.constants.MaxUint256);

      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0.000001", 18),
        usdc,
        ethers.utils.parseUnits("1", 6),
        feeManager,
        arrakisV2
      );

      const prevBalance = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      const postBalance = await usdc.balanceOf(userAddr2);
      expect(postBalance.sub(prevBalance)).to.be.equal(
        ethers.utils.parseUnits("1.002614", 6)
      );
    });

    it("#1: Get half reward when your are 50% in the vault", async () => {
      await arrakisV2.mint("1000000000000000000", userAddr3);
      let postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3).to.be.equal(0);

      await feeManager.connect(user2).claimFees(userAddr2); // Claim fees to clean pending fees derived from mint

      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0.000001", 18),
        usdc,
        ethers.utils.parseUnits("1", 6),
        feeManager,
        arrakisV2
      );

      await arrakisV2.mint("1000000000000000000", userAddr4);
      let postBalanceUser4 = await usdc.balanceOf(userAddr4);
      expect(postBalanceUser4).to.be.equal(0);

      // User 2 can claim 50%
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);

      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("0.501307", 6)
      );

      // User 3 can claim 50%
      const prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(user2).claimFees(userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);

      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("0.501307", 6)
      );
      // User 4 can claim 0%
      postBalanceUser4 = await usdc.balanceOf(userAddr4);
      expect(postBalanceUser4).to.be.equal(0);
    });

    it("#2: Collect differente times with more than one user", async () => {
      // RewardsPerBlock = $1
      // On block 0, Staker A deposits $100
      // On block 10, Staker B deposits $400
      // On block 15, Staker A harvests all rewards
      // On block 25, Staker B harvests all rewards
      // On block 30, both stakers harvests all rewards.
      const conversion = 0.002614;
      const delta = 2; // Variation due to price movement caused by sales
      await arrakisV2.collectFees(); // Claim fees to clean pending fees derived from mint
      await feeManager.connect(user2).claimFees(userAddr2); // Claim fees to clean pending fees derived from mint
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0.00001", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      await arrakisV2.mint("4000000000000000000", userAddr3);
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0.000005", 18),
        usdc,
        ethers.utils.parseUnits("5", 6),
        feeManager,
        arrakisV2
      );
      let prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      let postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.closeTo(
        ethers.utils.parseUnits(String(11 + 11 * conversion), 6),
        delta
      );
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0.00001", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      let prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(user3).claimFees(userAddr3);
      let postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.closeTo(
        ethers.utils.parseUnits(String(12 + 12 * conversion), 6),
        delta
      );
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0.000005", 18),
        usdc,
        ethers.utils.parseUnits("5", 6),
        feeManager,
        arrakisV2
      );
      prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits(String(3 + 3 * conversion), 6)
      );
      prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(user3).claimFees(userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.closeTo(
        ethers.utils.parseUnits(String(4 + 4 * conversion), 6),
        delta
      );
    });
  });

  describe("Preccision on dust collects", async () => {
    it("#0: Try to collect dust less than 0,000001", async () => {
      const { customVault, customFeeManager } = await deployVault(
        uniswapV3Pool,
        arrakisV2Resolver,
        arrakisV2Factory,
        managerProxyMock,
        user,
        1000000,
        usdc,
        wEth
      );
      await customVault.mint("1000000000000000000", userAddr2);
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("1", 6),
        customFeeManager,
        customVault
      );
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await customFeeManager.connect(user2).claimFees(userAddr2);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.closeTo(
        ethers.utils.parseUnits("0.000001", 6),
        0
      );
    });
  });
});
