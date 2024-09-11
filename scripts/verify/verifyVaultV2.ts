import hre from "hardhat";
import { getAddresses, Addresses } from "../../src/addresses";

async function main() {
  const addresses: Addresses = getAddresses(hre.network.name);

  await hre.run("verify:verify", {
    address: "0xb8B244D396188E341E8bD43F4156e4F98c9f4fd7",
    constructorArguments: [addresses.UniswapV3Factory],
    // other args
    libraries: {
      Underlying: (await hre.ethers.getContract("Underlying")).address,
      Pool: (await hre.ethers.getContract("Pool")).address,
      Position: (await hre.ethers.getContract("Position")).address,
    },
  });
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
