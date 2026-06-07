import { sepolia, mainnet } from "wagmi/chains";
import { http, createConfig } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// ── Chain config ──────────────────────────────────────────────────────────────

export const SEPOLIA_ID = sepolia.id;   // 11155111
export const MAINNET_ID = mainnet.id;  // 1

// .trim() guards against a trailing newline pasted into a Vercel env var — an
// untrimmed RPC URL or projectId causes opaque fetch/ENS failures.
const SEPOLIA_RPC = (import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com").trim();
const MAINNET_RPC = (import.meta.env.VITE_MAINNET_RPC_URL ?? "https://ethereum-rpc.publicnode.com").trim();

export const wagmiConfig = getDefaultConfig({
  appName: "VeilX",
  projectId: (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "veilx").trim(),
  chains: [sepolia, mainnet],
  transports: {
    [SEPOLIA_ID]: http(SEPOLIA_RPC),
    [MAINNET_ID]: http(MAINNET_RPC),
  },
  ssr: false,
});

export const SEPOLIA_RPC_URL = SEPOLIA_RPC;
export const MAINNET_RPC_URL = MAINNET_RPC;

// ── Registry addresses ────────────────────────────────────────────────────────

export const REGISTRY_ADDRESS: Record<number, `0x${string}`> = {
  [SEPOLIA_ID]: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
  [MAINNET_ID]: "0xeb5015fF021DB115aCe010f23F55C2591059bBA0",
};

// ── Known Sepolia cTokenMocks and their underlying ERC-20s ───────────────────
// Underlying ERC-20 tokens have a public mint(address,uint256) — 1M per call

export interface KnownToken {
  symbol: string;
  cSymbol: string;
  underlying: `0x${string}`;   // mintable ERC-20
  wrapper: `0x${string}`;      // ERC-7984 cToken
  decimals: number;
  isMock: true;
}

export const SEPOLIA_MOCKS: KnownToken[] = [
  {
    symbol: "USDCMock",
    cSymbol: "cUSDCMock",
    underlying: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF",
    wrapper: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    decimals: 6,
    isMock: true,
  },
  {
    symbol: "USDTMock",
    cSymbol: "cUSDTMock",
    underlying: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0",
    wrapper: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
    decimals: 6,
    isMock: true,
  },
  {
    symbol: "WETHMock",
    cSymbol: "cWETHMock",
    underlying: "0xff54739b16576FA5402F211D0b938469Ab9A5f3F",
    wrapper: "0x46208622DA27d91db4f0393733C8BA082ed83158",
    decimals: 18,
    isMock: true,
  },
  {
    symbol: "BRONMock",
    cSymbol: "cBRONMock",
    underlying: "0xFf021fB13cA64e5354c62c954b949a88cfDEb25E",
    wrapper: "0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891",
    decimals: 18,
    isMock: true,
  },
  {
    symbol: "ZAMAMock",
    cSymbol: "cZAMAMock",
    underlying: "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57",
    wrapper: "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB",
    decimals: 18,
    isMock: true,
  },
  {
    symbol: "tGBPMock",
    cSymbol: "ctGBPMock",
    underlying: "0x93c931278A2aad1916783F952f94276eA5111442",
    wrapper: "0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC",
    decimals: 18,
    isMock: true,
  },
  {
    symbol: "XAUtMock",
    cSymbol: "cXAUtMock",
    underlying: "0x24377AE4AA0C45ecEe71225007f17c5D423dd940",
    wrapper: "0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7",
    decimals: 18,
    isMock: true,
  },
];

// ── Registry ABI ──────────────────────────────────────────────────────────────

export const REGISTRY_ABI = [
  {
    name: "getTokenConfidentialTokenPairs",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "tokenAddress", type: "address" },
          { name: "confidentialTokenAddress", type: "address" },
          { name: "isValid", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getTokenConfidentialTokenPairsLength",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getTokenConfidentialToken",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenAddress", type: "address" }],
    outputs: [
      { name: "confidentialTokenAddress", type: "address" },
      { name: "isValid", type: "bool" },
    ],
  },
] as const;

// ── ERC-20 ABI (subset for reads + mint) ─────────────────────────────────────

export const ERC20_ABI = [
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
