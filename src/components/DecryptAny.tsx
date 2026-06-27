import { useState, useCallback, useEffect, type KeyboardEvent } from "react";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { useConfidentialBalance, matchZamaError } from "@zama-fhe/react-sdk";
import { isAddress, formatUnits } from "viem";
import { SEPOLIA_ID, MAINNET_ID, ERC20_ABI } from "../config";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

// Decrypt the connected wallet's confidential balance for ANY ERC-7984 token —
// not only registry pairs. Paste a wrapper address, sign the EIP-712 grant, and
// the relayer userDecrypts your balance client-side (visible only to you).
export function DecryptAny() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const valid = isAddress(input);
  const token = (valid ? input : ZERO) as `0x${string}`;
  // Decryption is keyed by the connected chain; only Sepolia/Mainnet are wired.
  const supportedChain = chainId === SEPOLIA_ID || chainId === MAINNET_ID;
  const netName = chainId === MAINNET_ID ? "Ethereum" : "Sepolia";

  // Best-effort decimals for display — most ERC-7984 tokens expose decimals();
  // fall back to 18 if the call reverts.
  const { data: decimals } = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: valid },
  });
  const dec = typeof decimals === "number" ? decimals : 18;

  // enabled:false → never auto-decrypt; refetch() runs only on explicit click.
  const { data: balance, isFetching, refetch } = useConfidentialBalance(
    { tokenAddress: token },
    { enabled: false },
  );

  // Hide any prior reveal when the target address, account, or chain changes.
  useEffect(() => {
    setRevealed(false);
    setErrorMsg("");
  }, [input, address, chainId]);

  const handleDecrypt = useCallback(async () => {
    if (!valid || !supportedChain) return;
    setErrorMsg("");
    setRevealed(true);
    try {
      const res = await refetch(); // refetch() parks failures on result.error
      if (res.error) throw res.error;
    } catch (e) {
      console.error("[VeilX] decrypt-any failed:", e);
      const msg = matchZamaError(e as Error, {
        SIGNING_REJECTED: () => "Signature cancelled",
        NO_CIPHERTEXT: () =>
          "No confidential balance — you hold none here, or this isn't an ERC-7984 token",
        RELAYER_REQUEST_FAILED: () => "Relayer unreachable — try again",
        _: (err: unknown) =>
          err instanceof Error && err.message
            ? `Decrypt failed: ${err.message}`
            : "Decrypt failed — is this a valid ERC-7984 token on this network?",
      });
      setErrorMsg(msg ?? "Decrypt failed");
      setRevealed(false);
    }
  }, [valid, supportedChain, refetch]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && valid && supportedChain && !isFetching) handleDecrypt();
  };

  return (
    <div className="lookup-bar">
      <div className={`lookup-input-wrap ${input && !valid ? "invalid" : ""}`}>
        <span className="lookup-icon">🔎</span>
        <input
          className="lookup-input"
          type="text"
          spellCheck={false}
          placeholder="Decrypt any ERC-7984 — paste a token address"
          value={input}
          onChange={(e) => setInput(e.target.value.trim())}
          onKeyDown={onKeyDown}
        />
        {!isConnected ? (
          <span className="lookup-hint">Connect wallet</span>
        ) : !supportedChain ? (
          <button className="lookup-btn" onClick={() => switchChain({ chainId: SEPOLIA_ID })} disabled={switching}>
            {switching ? "Switching…" : "Switch to Sepolia"}
          </button>
        ) : (
          <button className="lookup-btn" onClick={handleDecrypt} disabled={!valid || isFetching}>
            {isFetching && <span className="spinner" />}
            {isFetching ? "Decrypting…" : "Decrypt ↗"}
          </button>
        )}
      </div>

      {revealed && !isFetching && balance !== undefined && (
        <div className="lookup-result">
          Your balance on {netName}:{" "}
          <strong>{Number(formatUnits(balance, dec)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</strong>
        </div>
      )}
      {(errorMsg || (input && !valid)) && !isFetching && (
        <div className="lookup-error">{errorMsg || "Not a valid address."}</div>
      )}
    </div>
  );
}
