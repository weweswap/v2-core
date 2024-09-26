import hre from "hardhat";

async function main() {
  await hre.run("verify:verify", {
    address: "0xF64C9c67418d6Eec9550D65E3d6c369F7Bb70b00",
    contract: "contracts/ArrakisV2Beacon.sol:ArrakisV2Beacon",
    constructorArguments: [
      "0xAE3C7554F53D58ae301d2a66dF352A5936B19372",
      "0x627e03Ddcb7186cD01364d00c489f701983aa9Ae",
    ], // Implementation, owne
  });
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
