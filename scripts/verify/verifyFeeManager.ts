import hre from "hardhat";
import { Addresses, getAddresses } from "../../src/addresses";

const vaultAddress = "0x6bAffADA267Ef0FbdDEFc05592271bED9a0B4a5E"; // TODO: Automatize deploy vault

async function main() {
  const addresses: Addresses = getAddresses(hre.network.name);
  await hre.run("verify:verify", {
    address: "0xFA255938e6297d19Fd73E05400dF5f899614D788",
    constructorArguments: [
      vaultAddress,
      addresses.USDC,
      addresses.SwapRouter02,
      10000,
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
