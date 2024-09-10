import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getAddresses, Addresses } from "../src/addresses";
import { sleep } from "../src/utils";

const vaultAddress = "0xb13688c877268e32cc4584B6e06A3984d016dBB2"; // TODO: Automatize deploy vault

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "goerli" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance" ||
    hre.network.name === "base" ||
    hre.network.name === "base_goerli" ||
    hre.network.name === "sepolia" ||
    hre.network.name === "gnosis"
  ) {
    console.log(
      `Deploying FeeManager to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await sleep(10000);
  }

  const addresses: Addresses = getAddresses(hre.network.name);
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("FeeManager", {
    from: deployer,
    args: [vaultAddress, addresses.USDC, addresses.SwapRouter02, 10000],
    log: hre.network.name != "hardhat" ? true : false,
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "goerli" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance" ||
    hre.network.name === "base" ||
    hre.network.name === "base_goerli" ||
    hre.network.name === "sepolia" ||
    hre.network.name === "gnosis";
  return shouldSkip ? true : false;
};
func.tags = ["FeeManager"];
