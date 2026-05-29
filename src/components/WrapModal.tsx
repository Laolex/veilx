import { useState, useCallback } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import {
  useShield,
  useUnshield,
  useConfidentialBalance,
  matchZamaError,
  type TransactionResult,
} from "@zama-fhe/react-sdk";
import { formatUnits, parseUnits } from "viem";
import { SEPOLIA_ID, ERC20_ABI } from "../config";
import type { RegistryPair } from "../hooks/useRegistryPairs";

interface Props {
  pair: RegistryPair;
  onClose: () => void;
}

type Tab = "wrap" | "unwrap";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtBalance(raw: bigint | undefined, decimals = 18) {
  if (raw === undefined) return "—";
  const n = Number(formatUnits(raw, decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function WrapModal({ pair, onClose }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [tab, setTab] = useState<Tab>("wrap");
  const [amount, setAmount] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [isError, setIsError] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const decimals = pair.decimals ?? 18;
  const etherscanBase = chainId === SEPOLIA_ID ? "https://sepolia.etherscan.io" : "https://etherscan.io";

  const { mutateAsync: shield, isPending: shielding } = useShield({
    tokenAddress: pair.tokenAddress,
    wrapperAddress: pair.confidentialTokenAddress,
  });

  const { mutateAsync: unshield, isPending: unshielding } = useUnshield({
    tokenAddress: pair.tokenAddress,
    wrapperAddress: pair.confidentialTokenAddress,
  });

  const { data: confBalance, isLoading: confLoading } = useConfidentialBalance({
    tokenAddress: pair.confidentialTokenAddress,
  });

  const { data: pubBalance } = useReadContract({
    address: pair.tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  const isPending = shielding || unshielding;

  function resetStatus() {
    setStatusMsg("");
    setIsError(false);
    setIsDone(false);
    setTxHash(undefined);
  }

  const handleWrap = useCallback(async () => {
    if (!amount || !address) return;
    resetStatus();
    setStatusMsg("Approving and shielding…");
    try {
      const result = await shield({ amount: parseUnits(amount, decimals) });
      if (result) setTxHash((result as TransactionResult).txHash);
      setIsDone(true);
      setStatusMsg("Wrap complete!");
    } catch (e) {
      const msg = matchZamaError(e as Error, {
        SIGNING_REJECTED: () => "Transaction cancelled",
        INSUFFICIENT_ERC20_BALANCE: () =>
          `Not enough ${pair.symbol ?? "tokens"}`,
        _: (err: unknown) =>
          (err instanceof Error ? err.message : String(err)) || "Wrap failed",
      });
      setIsError(true);
      setStatusMsg(msg ?? "Wrap failed");
    }
  }, [amount, address, shield, decimals, pair.symbol]);

  const handleUnwrap = useCallback(async () => {
    if (!amount || !address) return;
    resetStatus();
    setStatusMsg("Phase 1: requesting unwrap…");
    try {
      const result = await unshield({
        amount: parseUnits(amount, decimals),
        onUnwrapSubmitted: (hash: string | undefined) => {
          if (hash) setTxHash(hash);
          setStatusMsg("Phase 1 submitted — waiting for KMS decryption…");
        },
        onFinalizing: () => setStatusMsg("Phase 2: finalizing withdrawal…"),
        onFinalizeSubmitted: (hash: string | undefined) => {
          if (hash) setTxHash(hash);
          setStatusMsg("Finalize submitted, confirming…");
        },
      });
      if (result) setTxHash((result as TransactionResult).txHash);
      setIsDone(true);
      setStatusMsg("Unwrap complete!");
    } catch (e) {
      const msg = matchZamaError(e as Error, {
        SIGNING_REJECTED: () => "Transaction cancelled",
        INSUFFICIENT_CONFIDENTIAL_BALANCE: () =>
          `Not enough ${pair.cSymbol ?? "cTokens"}`,
        NO_CIPHERTEXT: () => "No confidential balance — wrap tokens first",
        BALANCE_CHECK_UNAVAILABLE: () => "Sign to verify balance first",
        _: (err: unknown) =>
          (err instanceof Error ? err.message : String(err)) || "Unwrap failed",
      });
      setIsError(true);
      setStatusMsg(msg ?? "Unwrap failed");
    }
  }, [amount, address, unshield, decimals, pair.cSymbol]);

  function setMax() {
    if (tab === "wrap" && pubBalance !== undefined) {
      setAmount(formatUnits(pubBalance as bigint, decimals));
    } else if (tab === "unwrap" && confBalance !== undefined) {
      setAmount(formatUnits(confBalance, decimals));
    }
  }

  const btnLabel = (() => {
    if (isPending) return statusMsg || (tab === "wrap" ? "Wrapping…" : "Unwrapping…");
    if (isDone) return "✓ Done";
    if (isError) return "Try again";
    return tab === "wrap" ? `Wrap ${pair.symbol ?? "tokens"}` : `Unwrap ${pair.cSymbol ?? "cTokens"}`;
  })();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="pair-badge">{pair.symbol ?? shortAddr(pair.tokenAddress)}</span>
            <span className="pair-arrow">↔</span>
            <span className="pair-badge conf">{pair.cSymbol ?? shortAddr(pair.confidentialTokenAddress)}</span>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Balances */}
        <div className="balance-row">
          <div className="balance-box">
            <div className="balance-label">Public ({pair.symbol ?? "ERC-20"})</div>
            <div className="balance-value">
              {pubBalance !== undefined ? fmtBalance(pubBalance as bigint, decimals) : "—"}
            </div>
          </div>
          <div className="balance-box conf">
            <div className="balance-label">Confidential ({pair.cSymbol ?? "cToken"})</div>
            <div className="balance-value">
              {confLoading
                ? <span className="loading-dots">Decrypting…</span>
                : confBalance !== undefined
                  ? fmtBalance(confBalance, decimals)
                  : <span className="muted">Sign to decrypt</span>
              }
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${tab === "wrap" ? "active" : ""}`}
            onClick={() => { setTab("wrap"); resetStatus(); }}
          >
            Wrap → Confidential
          </button>
          <button
            className={`tab ${tab === "unwrap" ? "active" : ""}`}
            onClick={() => { setTab("unwrap"); resetStatus(); }}
          >
            Unwrap ← Public
          </button>
        </div>

        {/* Amount */}
        <div className="amount-row">
          <input
            className="amount-input"
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); resetStatus(); }}
            disabled={isPending}
          />
          <button className="max-btn" onClick={setMax} disabled={isPending}>MAX</button>
        </div>

        {/* Action */}
        <button
          className={`action-btn ${isPending ? "loading" : ""} ${isDone ? "success" : ""} ${isError ? "error" : ""}`}
          onClick={tab === "wrap" ? handleWrap : handleUnwrap}
          disabled={isPending || !amount || !address}
        >
          {isPending && <span className="spinner" />}
          {btnLabel}
        </button>

        {/* Status/error message */}
        {statusMsg && (isDone || isError) && (
          <div className={`status-msg ${isDone ? "done" : "error"}`}>{statusMsg}</div>
        )}

        {/* Tx link */}
        {txHash && (
          <a className="tx-link" href={`${etherscanBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
            View on Etherscan ↗
          </a>
        )}

        {/* Unwrap two-step note */}
        {tab === "unwrap" && (
          <div className="unwrap-note">
            Unwrap is a two-step process: Phase 1 submits the unwrap request; Phase 2 finalizes after the KMS decrypts the amount. Both steps are handled automatically.
          </div>
        )}

        {/* Addresses */}
        <div className="addr-grid">
          <div className="addr-item">
            <span className="addr-label">Underlying ERC-20</span>
            <a className="addr-val" href={`${etherscanBase}/address/${pair.tokenAddress}`} target="_blank" rel="noopener noreferrer">
              {shortAddr(pair.tokenAddress)} ↗
            </a>
          </div>
          <div className="addr-item">
            <span className="addr-label">Confidential Wrapper</span>
            <a className="addr-val" href={`${etherscanBase}/address/${pair.confidentialTokenAddress}`} target="_blank" rel="noopener noreferrer">
              {shortAddr(pair.confidentialTokenAddress)} ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
