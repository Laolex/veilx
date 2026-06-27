import { useReadContract, useReadContracts, useChainId } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, ERC20_ABI, CUSTOM_PAIRS } from "../config";

export interface RegistryPair {
  tokenAddress: `0x${string}`;
  confidentialTokenAddress: `0x${string}`;
  isValid: boolean;
  // "onchain" = read from the Wrappers Registry; "local" = from CUSTOM_PAIRS config
  source: "onchain" | "local";
  // enriched
  symbol?: string;
  name?: string;
  cSymbol?: string;
  cName?: string;
  decimals?: number;
}

export function useRegistryPairs(chainId?: number) {
  const connectedChain = useChainId();
  const chain = chainId ?? connectedChain;
  const registryAddr = REGISTRY_ADDRESS[chain];

  const { data: rawPairs, isLoading, error } = useReadContract({
    address: registryAddr,
    abi: REGISTRY_ABI,
    functionName: "getTokenConfidentialTokenPairs",
    chainId: chain,
    query: { staleTime: 60_000 },
  });

  // Batch-read underlying ERC-20 metadata for each pair
  const metaCalls = (rawPairs ?? []).flatMap((p) => [
    { address: p.tokenAddress, abi: ERC20_ABI, functionName: "symbol" as const, chainId: chain },
    { address: p.tokenAddress, abi: ERC20_ABI, functionName: "name" as const, chainId: chain },
    { address: p.tokenAddress, abi: ERC20_ABI, functionName: "decimals" as const, chainId: chain },
    { address: p.confidentialTokenAddress, abi: ERC20_ABI, functionName: "symbol" as const, chainId: chain },
    { address: p.confidentialTokenAddress, abi: ERC20_ABI, functionName: "name" as const, chainId: chain },
  ]);

  const { data: metaResults } = useReadContracts({
    contracts: metaCalls,
    query: { enabled: (rawPairs?.length ?? 0) > 0, staleTime: 300_000 },
  });

  const onchainPairs: RegistryPair[] = (rawPairs ?? []).map((p, i) => {
    const base = i * 5;
    return {
      tokenAddress: p.tokenAddress,
      confidentialTokenAddress: p.confidentialTokenAddress,
      isValid: p.isValid,
      source: "onchain",
      symbol: metaResults?.[base]?.result as string | undefined,
      name: metaResults?.[base + 1]?.result as string | undefined,
      decimals: metaResults?.[base + 2]?.result as number | undefined,
      cSymbol: metaResults?.[base + 3]?.result as string | undefined,
      cName: metaResults?.[base + 4]?.result as string | undefined,
    };
  });

  // Hybrid merge: append local CUSTOM_PAIRS, skipping any whose confidential token
  // is already registered on-chain (on-chain is the source of truth and wins).
  const onchainCAddrs = new Set(
    onchainPairs.map((p) => p.confidentialTokenAddress.toLowerCase()),
  );
  const localPairs: RegistryPair[] = (CUSTOM_PAIRS[chain] ?? [])
    .filter((c) => !onchainCAddrs.has(c.confidentialTokenAddress.toLowerCase()))
    .map((c) => ({
      tokenAddress: c.tokenAddress,
      confidentialTokenAddress: c.confidentialTokenAddress,
      isValid: true,
      source: "local",
      symbol: c.symbol,
      name: c.name,
      cSymbol: c.cSymbol,
      decimals: c.decimals,
    }));

  const pairs: RegistryPair[] = [...onchainPairs, ...localPairs];

  return { pairs, isLoading, error, registryAddr };
}
