"use client";

import { ReactNode, useMemo } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage, type GenericSigner } from "@zama-fhe/react-sdk";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig, SEPOLIA_ID, MAINNET_ID, SEPOLIA_RPC_URL, MAINNET_RPC_URL } from "./config";
import { WagmiCompatSigner } from "./signer";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

const signer = new WagmiCompatSigner({ config: wagmiConfig }) as unknown as GenericSigner;

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [SEPOLIA_ID]: {
      relayerUrl: `${window.location.origin}/api/relay/${SEPOLIA_ID}`,
      network: SEPOLIA_RPC_URL,
    },
    [MAINNET_ID]: {
      relayerUrl: `${window.location.origin}/api/relay/${MAINNET_ID}`,
      network: MAINNET_RPC_URL,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#7c3aed",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
        >
          <ZamaProvider
            relayer={relayer}
            signer={signer}
            storage={indexedDBStorage}
            keypairTTL={2_592_000}
          >
            {children}
          </ZamaProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
