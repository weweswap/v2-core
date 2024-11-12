const { ethers } = require("ethers");
const dotenv = require("dotenv");

dotenv.config();

// const provider = new ethers.providers.JsonRpcProvider("https://rpc")

// const erc20Abi = [
//   "function balanceOf(address) view returns (uint256)",
//   "function name() view returns (string)",
//   "function symbol() view returns (string)",
//   "function decimals() view returns (uint8)",
// ]

// const dcaContract = new ethers.Contract("0xCa227Cb6197B57d08888982bfA93619F67B4773A", abi, provider)

const deployVault = async () => {
  // const resolverAddress = "0x8512828605abC5c10d58254B25921E7a5735012c";

  if (!process.env.ALCHEMY_ID) {
    console.log("Please set your ALCHEMY_ID in .env file");
    return;
  }

  const pk = process.env.PK;
  if (!pk) {
    console.log("Please set your PK in .env file");
    return;
  }

  const wallet = new ethers.Wallet(pk);
  const provider = new ethers.providers.JsonRpcProvider(
    "https://base-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_ID
  );

  const signer = wallet.connect(provider);

  const univ3Abi = [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
  ];

  const v3FactoryAddress = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";

  const v3Factory = new ethers.Contract(v3FactoryAddress, univ3Abi, provider);
  const poolAddress = await v3Factory.getPool("0x4200000000000000000000000000000000000006", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 3000);
  console.log("Pool address: ", poolAddress);


  // const vaultAbi = [
  //   "function token0() external view returns (address)",
  //   "function token1() external view returns (address)",
  //   "function fee() external view returns (uint24)",
  //   "function owner() external view returns (address)",
  //   "function balance0() external view returns (uint256)",
  //   "function balance1() external view returns (uint256)",
  //   "function manager() external view returns (address)",
  //   "function routers(uint256) external view returns (address)",
  //   "function isBeacon() external view returns (bool)",
  // ];

  const vaultAbi = [
    "function factory() external view returns (address)",
    "function manager() external view returns (address)",
    "function feeManager() external view returns (address)",
    "function isBeacon() external view returns (bool)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function setFeeManager(address manager_) external",
  ];

  // 
  const vault_1_address = "0x3Fd7957D9F98D46c755685B67dFD8505468A7Cb6";
  const vault_2_address = "0xC3b2FfDE3403Fb9461F2690A72Fa701aE58140Bd";
  const vault_3_address = "0x137c8040d44e25D2c7677224165Da6Aa0901e33B";

  const vault_addresses = [
    "0x3Fd7957D9F98D46c755685B67dFD8505468A7Cb6",
    "0xC3b2FfDE3403Fb9461F2690A72Fa701aE58140Bd",
    "0x137c8040d44e25D2c7677224165Da6Aa0901e33B"
  ];
  
  for (let i = 0; i < vault_addresses.length; i++) {
    const vault = new ethers.Contract(vault_addresses[i], vaultAbi, provider);
    const factory = await vault.factory();
    const manager = await vault.manager();
    const feeManager = await vault.feeManager();
    const token0 = await vault.token0();
    const token1 = await vault.token1();

    console.log("");
    console.log("Vault: ", i, " ", vault_addresses[i]);
    console.log("************************************");
    console.log("Factory: ", factory);
    console.log("Manager: ", manager);
    console.log("Fee Manager: ", feeManager);
    console.log("Token0: ", token0);
    console.log("Token1: ", token1);
    console.log("************************************");
  }

  const setFeeManager = false;
  if (setFeeManager) {
    const vault = new ethers.Contract(vault_3_address, vaultAbi, signer);
    const tx = await vault.setFeeManager("0xCCa8EFb0537bD55a372c9bE076650e5B88251fDa");
    const receipt = await tx.wait();
    console.log(receipt);
  }

  const vaultFactoryAbi = [
    // "function vaults(uint256 startIndex_, uint256 endIndex_) external view returns (address[] memory)",
    "function numVaults() public view returns (uint256)"
  ];

  const vaultFactory = new ethers.ContractFactory(
    "0x7Af5148b733354FC25eAE912Ad5189e0E0a90670", // or proxy? 0xfdf1239e6e4d3422deadbc075b0160bdb3dfa369
    vaultFactoryAbi,
    provider
  );

  const numVaults = await vaultFactory.numVaults();
  console.log(numVaults);

  // const vaultFactory = VaultFactory.attach(resolverAddress);

  const vaults = await vaultFactory.vaults(0, 2);
  console.log(vaults);

  // const pk = process.env.PK;
  // if (!pk) {
  //   console.log("Please set your PK in .env file");
  //   return;
  // }

  // const signer = new ethers.Wallet(pk);

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

  const _signer = signer.connect(provider);

  const contract = new ethers.Contract(
    "0x7Af5148b733354FC25eAE912Ad5189e0E0a90670",
    abi,
    _signer
  );

  // const tx = await contract.deployVault(
  //   params.feeTiers,
  //   params.token0,
  //   params.token1,
  //   params.owner,
  //   params.init0,
  //   params.init1,
  //   params.manager,
  //   params.routers,
  //   false
  // );

  // const receipt = await tx.wait();
  // console.log(receipt);
};

deployVault();
