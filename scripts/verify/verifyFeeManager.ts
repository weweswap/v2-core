import hre from "hardhat";
import { Addresses, getAddresses } from "../../src/addresses";

const vaultAddress = "0x3Fd7957D9F98D46c755685B67dFD8505468A7Cb6"; // TODO: Automatize deploy vault
const chaosToken = "0x6573D177273931c44Aa647DaAF90325545a7fCC4";

async function main() {
  const addresses: Addresses = getAddresses(hre.network.name);
  await hre.run("verify:verify", {
    address: (await hre.ethers.getContract("FeeManager")).address,
    constructorArguments: [
      vaultAddress,
      addresses.USDC,
      chaosToken,
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
