import hre from "hardhat";
import { Addresses, getAddresses } from "../../src/addresses";

const vaultAddress = "0xb13688c877268e32cc4584B6e06A3984d016dBB2"; // TODO: Automatize deploy vault

async function main() {
  const addresses: Addresses = getAddresses(hre.network.name);
  await hre.run("verify:verify", {
    address: "0x30157e46b919EEC3E5d46bDc17c360b8bb442C30",
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
