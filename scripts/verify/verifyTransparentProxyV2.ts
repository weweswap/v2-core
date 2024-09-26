import hre, { ethers } from "hardhat";

const ArrakisVaultABI = [
  {
    inputs: [
      {
        internalType: "contract IUniswapV3Factory",
        name: "factory_",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "version",
        type: "uint8",
      },
    ],
    name: "Initialized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "burnAmount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "burnAmount1",
        type: "uint256",
      },
    ],
    name: "LPBurned",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint24[]",
        name: "feeTiers",
        type: "uint24[]",
      },
    ],
    name: "LogAddPools",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address[]",
        name: "routers",
        type: "address[]",
      },
    ],
    name: "LogBlacklistRouters",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "burnAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0Out",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1Out",
        type: "uint256",
      },
    ],
    name: "LogBurn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "fee0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "fee1",
        type: "uint256",
      },
    ],
    name: "LogCollectedFees",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "mintAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0In",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1In",
        type: "uint256",
      },
    ],
    name: "LogMint",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "uint128",
                name: "liquidity",
                type: "uint128",
              },
              {
                components: [
                  {
                    internalType: "int24",
                    name: "lowerTick",
                    type: "int24",
                  },
                  {
                    internalType: "int24",
                    name: "upperTick",
                    type: "int24",
                  },
                  {
                    internalType: "uint24",
                    name: "feeTier",
                    type: "uint24",
                  },
                ],
                internalType: "struct Range",
                name: "range",
                type: "tuple",
              },
            ],
            internalType: "struct PositionLiquidity[]",
            name: "burns",
            type: "tuple[]",
          },
          {
            components: [
              {
                internalType: "uint128",
                name: "liquidity",
                type: "uint128",
              },
              {
                components: [
                  {
                    internalType: "int24",
                    name: "lowerTick",
                    type: "int24",
                  },
                  {
                    internalType: "int24",
                    name: "upperTick",
                    type: "int24",
                  },
                  {
                    internalType: "uint24",
                    name: "feeTier",
                    type: "uint24",
                  },
                ],
                internalType: "struct Range",
                name: "range",
                type: "tuple",
              },
            ],
            internalType: "struct PositionLiquidity[]",
            name: "mints",
            type: "tuple[]",
          },
          {
            components: [
              {
                internalType: "bytes",
                name: "payload",
                type: "bytes",
              },
              {
                internalType: "address",
                name: "router",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "amountIn",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expectedMinReturn",
                type: "uint256",
              },
              {
                internalType: "bool",
                name: "zeroForOne",
                type: "bool",
              },
            ],
            internalType: "struct SwapPayload",
            name: "swap",
            type: "tuple",
          },
          {
            internalType: "uint256",
            name: "minBurn0",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "minBurn1",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "minDeposit0",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "minDeposit1",
            type: "uint256",
          },
        ],
        indexed: false,
        internalType: "struct Rebalance",
        name: "rebalanceParams",
        type: "tuple",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "swapDelta0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "swapDelta1",
        type: "uint256",
      },
    ],
    name: "LogRebalance",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address[]",
        name: "pools",
        type: "address[]",
      },
    ],
    name: "LogRemovePools",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "minter",
        type: "address",
      },
    ],
    name: "LogRestrictedMint",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "init0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "init1",
        type: "uint256",
      },
    ],
    name: "LogSetInits",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "newManager",
        type: "address",
      },
    ],
    name: "LogSetManager",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint16",
        name: "managerFeeBPS",
        type: "uint16",
      },
    ],
    name: "LogSetManagerFeeBPS",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address[]",
        name: "routers",
        type: "address[]",
      },
    ],
    name: "LogWhitelistRouters",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    name: "LogWithdrawManagerBalance",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint24[]",
        name: "feeTiers_",
        type: "uint24[]",
      },
    ],
    name: "addPools",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "routers_",
        type: "address[]",
      },
    ],
    name: "blacklistRouters",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "burnAmount_",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "receiver_",
        type: "address",
      },
    ],
    name: "burn",
    outputs: [
      {
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "collectFees",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "subtractedValue",
        type: "uint256",
      },
    ],
    name: "decreaseAllowance",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "factory",
    outputs: [
      {
        internalType: "contract IUniswapV3Factory",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "feeManager",
    outputs: [
      {
        internalType: "contract IFeeManager",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPools",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRanges",
    outputs: [
      {
        components: [
          {
            internalType: "int24",
            name: "lowerTick",
            type: "int24",
          },
          {
            internalType: "int24",
            name: "upperTick",
            type: "int24",
          },
          {
            internalType: "uint24",
            name: "feeTier",
            type: "uint24",
          },
        ],
        internalType: "struct Range[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRouters",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "addedValue",
        type: "uint256",
      },
    ],
    name: "increaseAllowance",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "init0",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "init1",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "name_",
        type: "string",
      },
      {
        internalType: "string",
        name: "symbol_",
        type: "string",
      },
      {
        components: [
          {
            internalType: "uint24[]",
            name: "feeTiers",
            type: "uint24[]",
          },
          {
            internalType: "address",
            name: "token0",
            type: "address",
          },
          {
            internalType: "address",
            name: "token1",
            type: "address",
          },
          {
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "init0",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "init1",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "manager",
            type: "address",
          },
          {
            internalType: "address[]",
            name: "routers",
            type: "address[]",
          },
        ],
        internalType: "struct InitializePayload",
        name: "params_",
        type: "tuple",
      },
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "manager",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "managerBalance0",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "managerBalance1",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "managerFeeBPS",
    outputs: [
      {
        internalType: "uint16",
        name: "",
        type: "uint16",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "mintAmount_",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "receiver_",
        type: "address",
      },
    ],
    name: "mint",
    outputs: [
      {
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "uint128",
                name: "liquidity",
                type: "uint128",
              },
              {
                components: [
                  {
                    internalType: "int24",
                    name: "lowerTick",
                    type: "int24",
                  },
                  {
                    internalType: "int24",
                    name: "upperTick",
                    type: "int24",
                  },
                  {
                    internalType: "uint24",
                    name: "feeTier",
                    type: "uint24",
                  },
                ],
                internalType: "struct Range",
                name: "range",
                type: "tuple",
              },
            ],
            internalType: "struct PositionLiquidity[]",
            name: "burns",
            type: "tuple[]",
          },
          {
            components: [
              {
                internalType: "uint128",
                name: "liquidity",
                type: "uint128",
              },
              {
                components: [
                  {
                    internalType: "int24",
                    name: "lowerTick",
                    type: "int24",
                  },
                  {
                    internalType: "int24",
                    name: "upperTick",
                    type: "int24",
                  },
                  {
                    internalType: "uint24",
                    name: "feeTier",
                    type: "uint24",
                  },
                ],
                internalType: "struct Range",
                name: "range",
                type: "tuple",
              },
            ],
            internalType: "struct PositionLiquidity[]",
            name: "mints",
            type: "tuple[]",
          },
          {
            components: [
              {
                internalType: "bytes",
                name: "payload",
                type: "bytes",
              },
              {
                internalType: "address",
                name: "router",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "amountIn",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expectedMinReturn",
                type: "uint256",
              },
              {
                internalType: "bool",
                name: "zeroForOne",
                type: "bool",
              },
            ],
            internalType: "struct SwapPayload",
            name: "swap",
            type: "tuple",
          },
          {
            internalType: "uint256",
            name: "minBurn0",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "minBurn1",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "minDeposit0",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "minDeposit1",
            type: "uint256",
          },
        ],
        internalType: "struct Rebalance",
        name: "rebalanceParams_",
        type: "tuple",
      },
    ],
    name: "rebalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "pools_",
        type: "address[]",
      },
    ],
    name: "removePools",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "restrictedMint",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "feeManager_",
        type: "address",
      },
    ],
    name: "setFeeManager",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "init0_",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "init1_",
        type: "uint256",
      },
    ],
    name: "setInits",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "manager_",
        type: "address",
      },
    ],
    name: "setManager",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "managerFeeBPS_",
        type: "uint16",
      },
    ],
    name: "setManagerFeeBPS",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "minter_",
        type: "address",
      },
    ],
    name: "setRestrictedMint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [
      {
        internalType: "contract IERC20",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [
      {
        internalType: "contract IERC20",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount0Owed_",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount1Owed_",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    name: "uniswapV3MintCallback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "routers_",
        type: "address[]",
      },
    ],
    name: "whitelistRouters",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawManagerBalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

async function main() {
  const iface = new ethers.utils.Interface(ArrakisVaultABI);

  //   [
  //     [
  //         "10000"
  //     ],
  //     "0x6b9bb36519538e0c073894e964e90172e1c0b41f",
  //     "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  //     "0x627e03ddcb7186cd01364d00c489f701983aa9ae",
  //     "7979000000000000000000",
  //     "1000000",
  //     "0x627e03ddcb7186cd01364d00c489f701983aa9ae",
  //     []
  // ]

  // const numVaults = 0;
  const name = "WEWESwap Vault V1 WEWE/USDC";
  const symbol = "WEWEv1-1";
  const param = {
    // Get params from TX https://base.blockscout.com/tx/0x9e7b94ab71e3d6263d6e9eae91358f558abed0886677a710617bb694151c7a10
    feeTiers: [10000],
    token0: "0x6b9bb36519538e0c073894e964e90172e1c0b41f",
    token1: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    owner: "0x627e03ddcb7186cd01364d00c489f701983aa9ae",
    init0: "7979000000000000000000",
    init1: "1000000",
    manager: "0x627e03ddcb7186cd01364d00c489f701983aa9ae",
    routers: [],
  };
  const data = iface.encodeFunctionData("initialize", [name, symbol, param]);
  console.log("data", data);
  await hre.run("verify:verify", {
    address: "0x6bAffADA267Ef0FbdDEFc05592271bED9a0B4a5E",
    constructorArguments: [
      "0xAE3C7554F53D58ae301d2a66dF352A5936B19372", // GET FROM BEACON DEPLOY
      "0x27CaAE96101c86E10aB85C393aE236C895C464aF", // PROXY NOT IMPLEMENTATION
      data,
    ], // Implementation, owne
  });
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
