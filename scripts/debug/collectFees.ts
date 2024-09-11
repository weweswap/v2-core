import { ethers } from "hardhat";
import * as deployment from "../../deployments/base/ArrakisV2.json";

async function main() {
  const privateKey = process.env.PK;
  const alchemyId = process.env.ALCHEMY_ID;
  if (!privateKey) {
    throw new Error("Private key is not defined");
  }
  if (!alchemyId) {
    throw new Error("Alchemy Id is not defined");
  }

  const provider = new ethers.providers.JsonRpcProvider(
    `https://base-mainnet.g.alchemy.com/v2/${alchemyId}`
  );

  const wallet = new ethers.Wallet(privateKey, provider);

  const contractAddress = "0x3884F9eE9dfA0550797f58049a448FA379C04C71";
  const contractABI = deployment.abi;

  const contract = new ethers.Contract(contractAddress, contractABI, wallet);

  console.log("Calling collectFees...");
  const tx = await contract.collectFees();

  console.log("Broadcasted...");
  await tx.wait();

  console.log("Tx hash:", tx.hash);
}

// Manejar errores
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
