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

// Only acepts ERC20
const depositRewardsInVault = async (
  weth: Contract,
  fee0: BigNumber,
  usdc: Contract,
  fee1: BigNumber,
  feeManager: FeeManager,
  vaultToImpersonate: ArrakisV2,
  expectRewardsConvertedToUsdc?: { usdcAmount: string }
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
  if (!expectRewardsConvertedToUsdc) {
    await feeManager
      .connect(vaultSigner)
      .depositFees(weth.address, fee0, usdc.address, fee1);
  } else {
    await expect(
      feeManager
        .connect(vaultSigner)
        .depositFees(weth.address, fee0, usdc.address, fee1)
    )
      .to.emit(feeManager, "RewardsConvertedToUsdc")
      .withArgs(expectRewardsConvertedToUsdc.usdcAmount);
  }
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
  weth: Contract,
  vaultOwner: Signer,
  chaos: Contract
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

  const tx = await arrakisV2Factory.connect(vaultOwner).deployVault(
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
    chaos.address,
    addresses.SwapRouter02,
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

      await chaos.transfer(
        feeManager.address,
        ethers.utils.parseUnits("10000")
      );
      await feeManager.setRate(100);

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
    }
  );

  describe("Single side fees", () => {
    it("#0: Constructor validations", async () => {
      const feeManagerFactory = await ethers.getContractFactory("FeeManager");
      await expect(
        feeManagerFactory.deploy(
          ethers.constants.AddressZero,
          usdc.address,
          chaos.address,
          swapRouter.address,
          3000
        )
      ).to.be.revertedWith("FeeManager: Invalid vault_ address");
      await expect(
        feeManagerFactory.deploy(
          arrakisV2.address,
          ethers.constants.AddressZero,
          chaos.address,
          swapRouter.address,
          3000
        )
      ).to.be.revertedWith("FeeManager: Invalid usdc_ address");
      await expect(
        feeManagerFactory.deploy(
          arrakisV2.address,
          usdc.address,
          chaos.address,
          ethers.constants.AddressZero,
          3000
        )
      ).to.be.revertedWith("FeeManager: uniSwapRouter_ address");
    });
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
        arrakisV2,
        { usdcAmount: "10000000" }
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
      let prevBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      await expect(feeManager.connect(user2).claimFees(userAddr2))
        .to.emit(feeManager, "RewardsClaimed")
        .withArgs(
          userAddr2,
          ethers.utils.parseUnits("11", 6),
          ethers.utils.parseUnits("11", 18)
        );
      let postBalanceUser2 = await usdc.balanceOf(userAddr2);
      let postBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("11", 6)
      );
      expect(postBalanceUserChaos2.sub(prevBalanceUserChaos2)).to.be.equal(
        ethers.utils.parseUnits("11", 18)
      );
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      let prevBalanceUserChaos3 = await chaos.balanceOf(userAddr3);
      let prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(owner).claimFees(userAddr3);
      let postBalanceUser3 = await usdc.balanceOf(userAddr3);
      let postBalanceUserChaos3 = await chaos.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("12", 6)
      );
      expect(postBalanceUserChaos3.sub(prevBalanceUserChaos3)).to.be.equal(
        ethers.utils.parseUnits("12", 18)
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
      prevBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      postBalanceUser2 = await usdc.balanceOf(userAddr2);
      postBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("3", 6)
      );
      expect(postBalanceUserChaos2.sub(prevBalanceUserChaos2)).to.be.equal(
        ethers.utils.parseUnits("3", 18)
      );
      prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      prevBalanceUserChaos3 = await chaos.balanceOf(userAddr3);
      await feeManager.connect(owner).claimFees(userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);
      postBalanceUserChaos3 = await chaos.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("4", 6)
      );
      expect(postBalanceUserChaos3.sub(prevBalanceUserChaos3)).to.be.equal(
        ethers.utils.parseUnits("4", 18)
      );
    });
    it("#4: Prevent double claim caused by transfer and check algorithm after transfer", async () => {
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
      let prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(owner).claimFees(userAddr3);
      let postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("4", 6)
      );
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("25", 6),
        feeManager,
        arrakisV2
      );
      let prevBalanceUser4 = await usdc.balanceOf(userAddr4);
      prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await arrakisV2.connect(owner).transfer(userAddr4, "2000000000000000000");
      await feeManager.connect(user4).claimFees(userAddr4);
      let postBalanceUser4 = await usdc.balanceOf(userAddr4);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser4.sub(prevBalanceUser4)).to.be.equal(
        ethers.utils.parseUnits("0", 6)
      );
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("20", 6)
      );
      prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(owner).claimFees(userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("0", 6)
      );
      await feeManager.connect(user2).claimFees(userAddr2);
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("5", 6),
        feeManager,
        arrakisV2
      );
      prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await feeManager.connect(owner).claimFees(userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("2", 6)
      );
      prevBalanceUser4 = await usdc.balanceOf(userAddr4);
      await feeManager.connect(owner).claimFees(userAddr4);
      postBalanceUser4 = await usdc.balanceOf(userAddr4);
      expect(postBalanceUser4.sub(prevBalanceUser4)).to.be.equal(
        ethers.utils.parseUnits("2", 6)
      );
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("1", 6)
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
      await feeManager.connect(owner).claimFees(userAddr3);
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
      await feeManager.connect(owner).claimFees(userAddr3);
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
        wEth,
        owner,
        chaos
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

  describe("Collect with mint and burn", async () => {
    it("#0: Correct fee distribution according to mint strategy", async () => {
      // Fee manager balance
      for (let i = 0; i < 10; i++) {
        // Reward 273
        await generateFees(userAddr, wMatic, swapRouter, addresses, wEth, usdc);
      }
      await arrakisV2.mint("4000000000000000000", userAddr3);
      for (let i = 0; i < 5; i++) {
        // Reward 623
        await generateFees(userAddr, wMatic, swapRouter, addresses, wEth, usdc);
      }
      await arrakisV2.collectFees();
      let prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await arrakisV2.mint("1", userAddr2);
      let postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("0.000397", 6)
      );
      for (let i = 0; i < 10; i++) {
        // Reward 1247
        await generateFees(userAddr, wMatic, swapRouter, addresses, wEth, usdc);
      }
      await arrakisV2.collectFees();
      let prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await arrakisV2.mint("1", userAddr3);
      let postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("0.001495", 6)
      );
      for (let i = 0; i < 5; i++) {
        // Reward 623
        await generateFees(userAddr, wMatic, swapRouter, addresses, wEth, usdc);
      }
      await arrakisV2.collectFees();
      prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      await arrakisV2.connect(user2).burn("1", userAddr2);
      postBalanceUser2 = await usdc.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("0.000374", 6)
      );
      prevBalanceUser3 = await usdc.balanceOf(userAddr3);
      await arrakisV2.connect(owner).burn("1", userAddr3);
      postBalanceUser3 = await usdc.balanceOf(userAddr3);
      expect(postBalanceUser3.sub(prevBalanceUser3)).to.be.equal(
        ethers.utils.parseUnits("0.000499", 6)
      );
    });
  });

  describe("Set rate", async () => {
    it("#0: Set rate double", async () => {
      await feeManager.setRate(200);
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      const prevBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);
      const postBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("10", 6)
      );
      expect(postBalanceUserChaos2.sub(prevBalanceUserChaos2)).to.be.equal(
        ethers.utils.parseUnits("20", 18)
      );
    });
    it("#1: Set rate half", async () => {
      await feeManager.setRate(50);
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      const prevBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      await expect(await feeManager.connect(user2).claimFees(userAddr2))
        .to.emit(feeManager, "RewardsClaimed")
        .withArgs(
          userAddr2,
          ethers.utils.parseUnits("10", 6),
          ethers.utils.parseUnits("5", 18)
        );
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);
      const postBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("10", 6)
      );
      expect(postBalanceUserChaos2.sub(prevBalanceUserChaos2)).to.be.equal(
        ethers.utils.parseUnits("5", 18)
      );
    });
    it("#2: Set rate zero", async () => {
      await feeManager.setRate(0);
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      const prevBalanceUser2 = await usdc.balanceOf(userAddr2);
      const prevBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      await feeManager.connect(user2).claimFees(userAddr2);
      const postBalanceUser2 = await usdc.balanceOf(userAddr2);
      const postBalanceUserChaos2 = await chaos.balanceOf(userAddr2);
      expect(postBalanceUser2.sub(prevBalanceUser2)).to.be.equal(
        ethers.utils.parseUnits("10", 6)
      );
      expect(postBalanceUserChaos2.sub(prevBalanceUserChaos2)).to.be.equal(
        ethers.utils.parseUnits("0", 18)
      );
    });
  });

  describe("Withdrawals", async () => {
    it("#0: Withdrawal CHAOS", async () => {
      const prevChaosBalanceInFeeManager = await chaos.balanceOf(
        feeManager.address
      );
      const prevOwnerBalanceWithdrawal = await chaos.balanceOf(
        await user.getAddress()
      );
      expect(prevChaosBalanceInFeeManager).not.eq(0);
      await feeManager.withdrawalChaos();
      const postChaosBalanceInFeeManager = await chaos.balanceOf(
        feeManager.address
      );
      const postOwnerBalanceWithdrawal = await chaos.balanceOf(
        await user.getAddress()
      );
      expect(postChaosBalanceInFeeManager).eq(0);
      expect(postOwnerBalanceWithdrawal.sub(prevOwnerBalanceWithdrawal)).eq(
        prevChaosBalanceInFeeManager
      );
      await expect(feeManager.withdrawalChaos()).to.be.revertedWith(
        "FeeManager: No balance to withdrawal"
      );
    });
    it("#1: Withdrawal emergency", async () => {
      await depositRewardsInVault(
        wEth,
        ethers.utils.parseUnits("0", 18),
        usdc,
        ethers.utils.parseUnits("10", 6),
        feeManager,
        arrakisV2
      );
      const prevBalanceInFeeManager = await usdc.balanceOf(feeManager.address);
      const prevOwnerBalanceWithdrawal = await usdc.balanceOf(
        await user.getAddress()
      );
      expect(prevBalanceInFeeManager).not.eq(0);
      await feeManager.withdrawEmergency();
      const postBalanceInFeeManager = await usdc.balanceOf(feeManager.address);
      const postOwnerBalanceWithdrawal = await usdc.balanceOf(
        await user.getAddress()
      );
      expect(postBalanceInFeeManager).eq(0);
      expect(postOwnerBalanceWithdrawal.sub(prevOwnerBalanceWithdrawal)).eq(
        prevBalanceInFeeManager
      );
      await expect(feeManager.withdrawEmergency()).to.be.revertedWith(
        "FeeManager: No USDC to withdraw"
      );
    });
  });
  describe("Withdrawals", async () => {
    it("#0: Invalid owner", async () => {
      await expect(
        feeManager.connect(user4).withdrawEmergency()
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        feeManager.connect(user4).withdrawalChaos()
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(feeManager.connect(user4).setRate(1000)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
    it("#0: Invalid vault", async () => {
      await expect(
        feeManager.connect(user4).setRewardDebt(await user4.getAddress(), 0)
      ).to.be.revertedWith("Only vault can call");
      await expect(
        feeManager
          .connect(user4)
          .depositFees(usdc.address, 1000, chaos.address, 1000)
      ).to.be.revertedWith("Only vault can call");
    });
  });
});
