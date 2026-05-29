import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { ERC20_ABI } from "../config";

export function useMint(tokenAddress: `0x${string}`, decimals: number) {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  function mint(to: `0x${string}`, amount = "1000") {
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [to, parseUnits(amount, decimals)],
    });
  }

  return { mint, isPending: isPending || isConfirming, isSuccess, txHash, error };
}
