import hre, { ethers } from "hardhat";

async function main() {
  await hre.run("verify:verify", {
    address: (await hre.ethers.getContract("ArrakisV2Factory_Implementation")).address,
    constructorArguments: [
      (await ethers.getContract("ArrakisV2Beacon")).address,
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
