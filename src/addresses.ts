/* eslint-disable @typescript-eslint/naming-convention */
export interface Addresses {
  UniswapV3Factory: string;
  SwapRouter: string;
  SwapRouter02: string;
  QuoterV2: string;
  WETH: string;
  WMATIC: string;
  USDC: string;
  ArrakisV2Implementation: string;
  ArrakisV2Beacon: string;
  ArrakisV2Factory: string;
  ArrakisV2Helper: string;
  ArrakisV2Resolver: string;
}

export const getAddresses = (network: string): Addresses => {
  switch (network) {
    case "hardhat":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        SwapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
        QuoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ArrakisV2Implementation: "0x7F346F1eB7a65fF83f51B3FD76dCc70979e6DF38",
        ArrakisV2Beacon: "0x1D91F6D917ec51dE53A5789c34fFF777a58759B6",
        ArrakisV2Factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
        ArrakisV2Helper: "0x89E4bE1F999E3a58D16096FBe405Fc2a1d7F07D6",
        ArrakisV2Resolver: "0x535C5fDf31477f799366DF6E4899a12A801cC7b8",
      };
    case "base":
      return {
        UniswapV3Factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        SwapRouter: "",
        SwapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
        QuoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
        WETH: "0x4200000000000000000000000000000000000006",
        WMATIC: "",
        USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        ArrakisV2Implementation: "0x33443B4942581d0Aa6F0E1076eaA18ed72C07a2D",
        ArrakisV2Beacon: "0xA1DBa91D55D75a8Eb1E6C40053cb264ec072EFe2",
        ArrakisV2Factory: "0x31b383B929d7Dd30299854aa82Bc8112fa23990b",
        ArrakisV2Helper: "0x8c294f4e6bdeEB8967D67a7c4a7C56b3d30653d9",
        ArrakisV2Resolver: "0x8512828605abC5c10d58254B25921E7a5735012c",
      };
    default:
      throw new Error(`No addresses for Network: ${network}`);
  }
};
