"use client";

import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage, SepoliaConfig, MainnetConfig, type GenericSigner } from "@zama-fhe/react-sdk";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig, SEPOLIA_ID, MAINNET_ID } from "./config";
import { WagmiCompatSigner } from "./signer";
import { publishFheEvent } from "./lib/fheEvents";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

const signer = new WagmiCompatSigner({ config: wagmiConfig }) as unknown as GenericSigner;

// Multi-threaded WASM proof generation. Without this the relayer SDK runs
// single-threaded, and a single euint64 input-proof exceeds the worker's 30s
// ENCRYPT timeout (breaking unwrap, the only flow that encrypts client-side).
// Requires cross-origin isolation (our COOP same-origin + COEP credentialless
// headers); the SDK auto-falls back to single-thread if SharedArrayBuffer is
// unavailable. 4–8 is the documented sweet spot.
const FHE_THREADS = Math.min(
  8,
  Math.max(4, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4),
);

// Hit the Zama relayer directly. It already serves correct CORS
// (Access-Control-Allow-Origin reflects our origin; input-proof preflight
// returns 200), and CORS-mode fetches are exempt from COEP-credentialless's
// CORP requirement — so no proxy is needed. The previous /api/relay edge-proxy
// hop (cold start + body streaming + full-response buffering) added enough
// latency to push the heavy input-proof call past the SDK's hard 30s ENCRYPT
// timeout, which is what broke unwrap. SepoliaConfig/MainnetConfig already
// default relayerUrl to https://relayer.{testnet,mainnet}.zama.org/v2.
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  threads: FHE_THREADS,
  transports: {
    [SEPOLIA_ID]: { ...SepoliaConfig },
    [MAINNET_ID]: { ...MainnetConfig },
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
            // Fan SDK lifecycle events out to component subscribers (WrapModal
            // surfaces the encrypt/proof window that useUnshield callbacks omit).
            onEvent={publishFheEvent}
          >
            {children}
          </ZamaProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
