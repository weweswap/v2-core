import hre from "hardhat";
import { Addresses, getAddresses } from "../../src/addresses";

const vaultAddress = "0x3884F9eE9dfA0550797f58049a448FA379C04C71"; // TODO: Automatize deploy vault

async function main() {
  const addresses: Addresses = getAddresses(hre.network.name);
  await hre.run("verify:verify", {
    address: (await hre.ethers.getContract("FeeManager")).address,
    constructorArguments: [
      vaultAddress,
      addresses.USDC,
      addresses.SwapRouter02,
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
