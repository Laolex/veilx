"use client";

import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage, SepoliaConfig, MainnetConfig, type GenericSigner } from "@zama-fhe/react-sdk";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig, SEPOLIA_ID, MAINNET_ID } from "./config";
import { WagmiCompatSigner } from "./signer";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

const signer = new WagmiCompatSigner({ config: wagmiConfig }) as unknown as GenericSigner;

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [SEPOLIA_ID]: {
      ...SepoliaConfig,
      relayerUrl: `${window.location.origin}/api/relay/${SEPOLIA_ID}/v2`,
    },
    [MAINNET_ID]: {
      ...MainnetConfig,
      relayerUrl: `${window.location.origin}/api/relay/${MAINNET_ID}/v2`,
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
