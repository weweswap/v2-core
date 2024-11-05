import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import hre = require("hardhat");
import {
  IUniswapV3Factory,
  IUniswapV3Pool,
  ArrakisV2,
  ArrakisV2Factory,
  ArrakisV2Resolver,
  ArrakisV2Beacon,
} from "../../typechain";
import { getAddresses, Addresses } from "../../src/addresses";
const { ethers, deployments } = hre;

describe.only("Factory function unit test", function () {
  this.timeout(0);

  let user: Signer;
  let userAddr: string;
  let arrakisV2Factory: ArrakisV2Factory;
  let uniswapV3Pool: IUniswapV3Pool;
  let arrakisV2Resolver: ArrakisV2Resolver;
  let addresses: Addresses;
  let owner: Signer;
  let impersonateOwner: Signer;

  beforeEach("Setting up for Factory view function test", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    addresses = getAddresses("base"); // use base to siulate mainnet
    await deployments.fixture();

    [user, , owner] = await ethers.getSigners();
    userAddr = await user.getAddress();

    // const addr =
    //   "0x" +
    //   (
    //     await user.provider!.getStorageAt(
    //       (
    //         await ethers.getContract("ArrakisV2Factory")
    //       ).address,
    //       "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
    //     )
    //   )
    //     .toString()
    //     .substring(26);

    // arrakisV2Factory = (await ethers.getContractAt(
    //   "ArrakisV2Factory",
    //   addr,
    //   user
    // )) as ArrakisV2Factory;

    // await arrakisV2Factory.initialize(await owner.getAddress());

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0x0625Db97368dF1805314E68D0E63e5eB154B9AE6"],
    });

    impersonateOwner = await ethers.provider.getSigner(
      "0x0625Db97368dF1805314E68D0E63e5eB154B9AE6" // we we owner
    );

    arrakisV2Factory = (await ethers.getContract(
      "ArrakisV2Factory",
      "0x0625Db97368dF1805314E68D0E63e5eB154B9AE6" //user
    )) as ArrakisV2Factory;

    const uniswapV3Factory = (await ethers.getContractAt(
      "IUniswapV3Factory",
      addresses.UniswapV3Factory,
      "0x0625Db97368dF1805314E68D0E63e5eB154B9AE6", // user
    )) as IUniswapV3Factory;

    // uniswapV3Pool = (await ethers.getContractAt(
    //   "IUniswapV3Pool",
    //   await uniswapV3Factory.getPool(addresses.USDC, addresses.WETH, 500),
    //   user
    // )) as IUniswapV3Pool;

    uniswapV3Pool = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniswapV3Factory.getPool(addresses.USDC, addresses.WETH, 10000),
      user
    )) as IUniswapV3Pool;

    console.log(uniswapV3Pool.address);

    arrakisV2Resolver = (await ethers.getContract(
      "ArrakisV2Resolver"
    )) as ArrakisV2Resolver;
  });

  it.only("#0: unit test create a vault v2", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    // get values https://basescan.org/address/0x0b1c2dcbbfa744ebd3fc17ff1a96a1e1eb4b2d69#readContract
    const sqrtPriceX96 = BigNumber.from("3872514393515746240839284");
    const sqrt = slot0.sqrtPriceX96;

    const tick = 198534;

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

    // const lowerTick = tick - (tick % tickSpacing) - tickSpacing;
    // const upperTick = tick - (tick % tickSpacing) + 2 * tickSpacing;

    // For initialization.
    const res = await arrakisV2Resolver.getAmountsForLiquidity(
      sqrt,
      lowerTick,
      upperTick,
      ethers.utils.parseUnits("1", 18)
    );

    const token0 = addresses.WETH;
    const token1 = addresses.USDC;

    console.log("token0: ", token0);
    console.log("token1: ", token1);
    console.log("init0: ", res.amount0.toString());
    console.log("init1: ", res.amount1.toString());

    const tx = await arrakisV2Factory.connect(impersonateOwner).deployVault(
      {
        feeTiers: [10000], // was 500
        token0: token0,
        token1: token1,
        owner: "0x0625Db97368dF1805314E68D0E63e5eB154B9AE6", // we we owner
        init0: res.amount0,
        init1: res.amount1,
        manager: "0x0625Db97368dF1805314E68D0E63e5eB154B9AE6", // user
        routers: [],
      },
      true
    );

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    const vaultV2 = (await ethers.getContractAt(
      "ArrakisV2",
      result?.vault,
      user
    )) as ArrakisV2;

    expect(await vaultV2.name()).to.be.eq("WEWESwap Vault V1 USDC/WETH");
    expect(await vaultV2.symbol()).to.be.eq("WEWEv1-1");
  });

  it("#1: unit test get token name", async () => {
    expect(
      await arrakisV2Factory.getTokenName(addresses.USDC, addresses.WETH)
    ).to.be.eq("WEWESwap Vault V1 USDC/WETH");
  });

  it("#2: unit test get num vaults", async () => {
    expect(await arrakisV2Factory.numVaults()).to.be.eq(0);
  });

  it("#3: unit test get num vaults", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

    // For initialization.
    const res = await arrakisV2Resolver.getAmountsForLiquidity(
      slot0.sqrtPriceX96,
      lowerTick,
      upperTick,
      ethers.utils.parseUnits("1", 18)
    );

    await arrakisV2Factory.connect(owner).deployVault(
      {
        feeTiers: [500],
        token0: addresses.USDC,
        token1: addresses.WETH,
        owner: userAddr,
        init0: res.amount0,
        init1: res.amount1,
        manager: userAddr,
        routers: [],
      },
      true
    );

    expect(await arrakisV2Factory.numVaults()).to.be.eq(1);
  });

  it("#5: unit test get vaults", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

    // For initialization.
    const res = await arrakisV2Resolver.getAmountsForLiquidity(
      slot0.sqrtPriceX96,
      lowerTick,
      upperTick,
      ethers.utils.parseUnits("1", 18)
    );

    await arrakisV2Factory.connect(owner).deployVault(
      {
        feeTiers: [500],
        token0: addresses.USDC,
        token1: addresses.WETH,
        owner: userAddr,
        init0: res.amount0,
        init1: res.amount1,
        manager: userAddr,
        routers: [],
      },
      true
    );

    expect(
      (await arrakisV2Factory.vaults(0, await arrakisV2Factory.numVaults()))
        .length
    ).to.be.eq(1);

    await arrakisV2Factory.connect(owner).deployVault(
      {
        feeTiers: [3000],
        token0: addresses.USDC,
        token1: addresses.WETH,
        owner: userAddr,
        init0: res.amount0,
        init1: res.amount1,
        manager: userAddr,
        routers: [],
      },
      true
    );

    expect(
      (await arrakisV2Factory.vaults(0, await arrakisV2Factory.numVaults()))
        .length
    ).to.be.eq(2);

    // get a slice that starts at non-zero index, fails unless we make change
    expect(
      (await arrakisV2Factory.vaults(1, await arrakisV2Factory.numVaults()))
        .length
    ).to.be.eq(1);
  });

  it("#6: get implementation", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

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
        manager: userAddr,
        routers: [],
      },
      false
    );

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    expect(
      await arrakisV2Factory.getProxyImplementation(result?.vault)
    ).to.not.be.eq(ethers.constants.AddressZero);
  });

  it("#7: get proxy admin", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

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
        manager: userAddr,
        routers: [],
      },
      false
    );

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    expect(await arrakisV2Factory.getProxyAdmin(result?.vault)).to.not.be.eq(
      ethers.constants.AddressZero
    );
  });

  it("#8: make vault immutable", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

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
        manager: userAddr,
        routers: [],
      },
      false
    );

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    await arrakisV2Factory.connect(owner).makeVaultsImmutable([result?.vault]);

    const newAdmin =
      "0x" +
      (
        await user.provider!.getStorageAt(
          result?.vault,
          "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
        )
      )
        .toString()
        .substring(26);

    expect(newAdmin).to.be.eq("0x0000000000000000000000000000000000000001");
  });

  it("#9: upgrade and Call", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

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
        manager: userAddr,
        routers: [],
      },
      false
    );

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    const previousImplementation =
      await arrakisV2Factory.getProxyImplementation(result?.vault);

    // #region get new implementation.

    const deployResult = await deployments.deploy("ArrakisV2", {
      from: userAddr,
      args: [userAddr],
      libraries: {
        Pool: (await ethers.getContract("Pool")).address,
        Position: (await ethers.getContract("Position")).address,
        Underlying: (await ethers.getContract("Underlying")).address,
      },
      log: hre.network.name != "hardhat" ? true : false,
    });
    const newImplementation: ArrakisV2 = (await ethers.getContractAt(
      "ArrakisV2",
      deployResult.address,
      user
    )) as ArrakisV2;

    // #endregion get new implementation.

    // #region call data.

    const data = newImplementation.interface.encodeFunctionData("owner");

    // #endregion call data.

    // #region get arrakis v2 beacon.

    const beacon = (await ethers.getContract(
      "ArrakisV2Beacon",
      user
    )) as ArrakisV2Beacon;

    await beacon.upgradeTo(newImplementation.address);

    // #endregion get arrakis v2 beacon.

    await arrakisV2Factory
      .connect(owner)
      .upgradeVaultsAndCall([result?.vault], [data]);

    const currentImplementation = await arrakisV2Factory.getProxyImplementation(
      result?.vault
    );

    expect(currentImplementation).to.not.be.eq(previousImplementation);
  });

  it("#10: upgrade", async () => {
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();

    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

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
        manager: userAddr,
        routers: [],
      },
      false
    );

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    const previousImplementation =
      await arrakisV2Factory.getProxyImplementation(result?.vault);

    // #region get new implementation.

    const deployResult = await deployments.deploy("ArrakisV2", {
      from: userAddr,
      args: [userAddr],
      libraries: {
        Pool: (await ethers.getContract("Pool")).address,
        Position: (await ethers.getContract("Position")).address,
        Underlying: (await ethers.getContract("Underlying")).address,
      },
      log: hre.network.name != "hardhat" ? true : false,
    });
    const newImplementation: ArrakisV2 = (await ethers.getContractAt(
      "ArrakisV2",
      deployResult.address,
      user
    )) as ArrakisV2;

    // #endregion get new implementation.

    // #region get arrakis v2 beacon.

    const beacon = (await ethers.getContract(
      "ArrakisV2Beacon",
      user
    )) as ArrakisV2Beacon;

    await beacon.upgradeTo(newImplementation.address);

    // #endregion get arrakis v2 beacon.

    await arrakisV2Factory.connect(owner).upgradeVaults([result?.vault]);

    const currentImplementation = await arrakisV2Factory.getProxyImplementation(
      result?.vault
    );

    expect(currentImplementation).to.not.be.eq(previousImplementation);
  });
});
