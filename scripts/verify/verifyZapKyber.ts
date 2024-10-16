import hre from "hardhat";
import { Addresses, getAddresses } from "../../src/addresses";

async function main() {
  const addresses: Addresses = getAddresses(hre.network.name);
  await hre.run("verify:verify", {
    address: (await hre.ethers.getContract("ZapKyber")).address,
    constructorArguments: [addresses.kyberAggregator],
  });
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
