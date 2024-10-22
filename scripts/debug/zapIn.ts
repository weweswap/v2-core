import hre, { ethers } from "hardhat";
import * as deployment from "../../deployments/base/ZapKyber.json";

const erc20ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
];

async function zapIn(
  vaultAddress: unknown,
  inputToken: unknown,
  tokenInAmount: unknown
) {
  const url = "https://app-backend-development.up.railway.app/api/zap-in";

  const body = {
    vaultAddress: vaultAddress,
    inputToken: inputToken,
    tokenInAmount: tokenInAmount,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error in zapIn:", error);
  }
}

async function main() {
  const privateKey = process.env.PK_LP;
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

  const contractAddress = (await hre.ethers.getContract("ZapKyber")).address;
  const contractABI = deployment.abi;

  const contract = new ethers.Contract(contractAddress, contractABI, wallet);

  const amountToApprove = ethers.utils.parseUnits("2", 6);

  const tokenAddress = "0x6b9bb36519538e0C073894E964E90172E1c0B41F";
  const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, wallet);

  console.log("Aprobando el token...");
  const approveTx = await tokenContract.approve(
    contractAddress,
    amountToApprove
  );
  await approveTx.wait();
  const amountIn = "1000000";
  console.log("Token aprobado con éxito");
  const result = await zapIn(
    "0x3Fd7957D9F98D46c755685B67dFD8505468A7Cb6",
    "usd-coin",
    amountIn
  );
  console.log("Calling zapIn...");

  console.log({
    vault: "0x3Fd7957D9F98D46c755685B67dFD8505468A7Cb6",
    from: result.swapFromToken,
    amountIn: amountIn,
    mintAmount: (BigInt(result.mintAmount) * BigInt(95)) / BigInt(100),
    encodedeA: result.kyberSwapEncodedRoute,
    encodedeB: result.kyberSwapEncodedRoute,
  });

  console.log("Route summary", result);

  const tx = await contract.zapIn(
    "0x3Fd7957D9F98D46c755685B67dFD8505468A7Cb6",
    result.swapFromToken,
    amountIn,
    (BigInt(result.mintAmount) * BigInt(95)) / BigInt(100),
    result.kyberSwapEncodedRoute,
    result.kyberSwapEncodedRoute,
    {
      gasLimit: ethers.utils.hexlify(1500000),
      maxFeePerGas: ethers.utils.parseUnits("62702908", "wei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("62702908", "wei"),
    }
  );

  console.log("Broadcasted...");
  await tx.wait();

  console.log("Tx hash:", tx.hash);
}

// Manejar errores
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
