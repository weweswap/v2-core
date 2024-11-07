import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const deployVault = async () => {
  const signer = new ethers.Wallet(process.env.PK as string);
  const provider = new ethers.providers.JsonRpcProvider(
    "https://base-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_ID
  );

  const params = {
    feeTiers: [10000], // was 500
    token0: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    token1: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    owner: "0x0625Db97368dF1805314E68D0E63e5eB154B9AE6", // we we owner
    init0: 1000000,
    init1: 1000000,
    manager: "0x0625Db97368dF1805314E68D0E63e5eB154B9AE6", // user
    routers: [],
  };

  const abi = [
    "function deployVault(uint256[] feeTiers, address token0, address token1, address owner, uint256 init0, uint256 init1, address manager, address[] routers, bool isBeacon_) external returns (address vault)",
  ];

  const contract = new ethers.Contract(
    "0x7Af5148b733354FC25eAE912Ad5189e0E0a90670",
    abi,
    signer
  );

  const tx = await contract.deployVault(
    params.feeTiers,
    params.token0,
    params.token1,
    params.owner,
    params.init0,
    params.init1,
    params.manager,
    params.routers,
    false
  );

  const receipt = await tx.wait();
  console.log(receipt);
};

deployVault();
