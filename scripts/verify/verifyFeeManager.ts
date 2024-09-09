import hre from "hardhat";
import { Addresses, getAddresses } from "../../src/addresses";

const vaultAddress = "0x3884F9eE9dfA0550797f58049a448FA379C04C71"; // TODO: Automatize deploy vault

async function main() {
  const addresses: Addresses = getAddresses(hre.network.name);
  await hre.run("verify:verify", {
    address: "0x4B44AC40aEFB44a4AB1bA3a7420C7A819315F6D0",
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
