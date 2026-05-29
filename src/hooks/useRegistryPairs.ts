import { useReadContract, useReadContracts, useChainId } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, ERC20_ABI } from "../config";

export interface RegistryPair {
  tokenAddress: `0x${string}`;
  confidentialTokenAddress: `0x${string}`;
  isValid: boolean;
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

  const pairs: RegistryPair[] = (rawPairs ?? []).map((p, i) => {
    const base = i * 5;
    return {
      tokenAddress: p.tokenAddress,
      confidentialTokenAddress: p.confidentialTokenAddress,
      isValid: p.isValid,
      symbol: metaResults?.[base]?.result as string | undefined,
      name: metaResults?.[base + 1]?.result as string | undefined,
      decimals: metaResults?.[base + 2]?.result as number | undefined,
      cSymbol: metaResults?.[base + 3]?.result as string | undefined,
      cName: metaResults?.[base + 4]?.result as string | undefined,
    };
  });

  return { pairs, isLoading, error, registryAddr };
}
