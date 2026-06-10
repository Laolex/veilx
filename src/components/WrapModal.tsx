import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import {
  useShield,
  useUnshield,
  useConfidentialBalance,
  usePublicKey,
  matchZamaError,
  ZamaSDKEvents,
  type TransactionResult,
  type ZamaSDKEvent,
} from "@zama-fhe/react-sdk";
import { formatUnits, parseUnits } from "viem";
import { SEPOLIA_ID, ERC20_ABI } from "../config";
import type { RegistryPair } from "../hooks/useRegistryPairs";
import { subscribeFheEvent } from "../lib/fheEvents";
import { StageTimer } from "../lib/telemetry";

interface Props {
  pair: RegistryPair;
  // Chain the pair was loaded from (RegistryGrid's viewChain) — may differ from
  // the connected wallet chain, since the registry is browsable cross-chain.
  pairChainId: number;
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

export function WrapModal({ pair, pairChainId, onClose }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [tab, setTab] = useState<Tab>("wrap");
  const [amount, setAmount] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [isError, setIsError] = useState(false);
  const [isDone, setIsDone] = useState(false);
  // Confidential balance stays hidden until the user explicitly signs to decrypt.
  const [revealed, setRevealed] = useState(false);
  // Set when a balance decrypt fails so the failure isn't a silent button reset.
  const [decryptError, setDecryptError] = useState("");
  // Seconds elapsed during an in-flight unwrap — powers the "wait a sec" hint so
  // a 1–3 min KMS wait reads as progressing, not dead.
  const [unwrapElapsed, setUnwrapElapsed] = useState(0);
  // True only while an unwrap is in flight — gates the global SDK event stream so
  // we don't pick up events from other operations (e.g. a wrap or a decrypt).
  const unwrapActiveRef = useRef(false);
  // Current unwrap stage — read by the catch block to produce phase-aware errors.
  const unwrapStageRef = useRef<string>("idle");
  // Timer for the in-flight unwrap (stage durations → console).
  const unwrapTimerRef = useRef<StageTimer | null>(null);

  // Pre-warm: mounting the modal kicks off the FHE public-key download (the
  // biggest cold-start cost) while the user is still typing an amount, so the
  // first encrypt doesn't pay for it. The CRS/public-params bits are computed
  // per-input by the SDK, so they can't be reliably pre-fetched by key here.
  const publicKey = usePublicKey();

  // #2 telemetry: time from modal open → public key cached/ready.
  const modalOpenAtRef = useRef(performance.now());
  const pkTimingLoggedRef = useRef(false);
  useEffect(() => {
    if (!pkTimingLoggedRef.current && publicKey.isSuccess && publicKey.data) {
      pkTimingLoggedRef.current = true;
      console.info("[VeilX][prewarm] public key ready", {
        sinceModalOpenMs: Math.round(performance.now() - modalOpenAtRef.current),
      });
    }
  }, [publicKey.isSuccess, publicKey.data]);

  const decimals = pair.decimals ?? 18;
  // Etherscan + reads must follow the pair's chain, not the wallet's — the pair
  // addresses only exist on pairChainId.
  const etherscanBase = pairChainId === SEPOLIA_ID ? "https://sepolia.etherscan.io" : "https://etherscan.io";
  const pairNetworkName = pairChainId === SEPOLIA_ID ? "Sepolia" : "Ethereum";
  // Shield/unshield + decrypt route through the connected chain (signer.getChainId);
  // if it doesn't match the pair's chain they'd target nonexistent addresses.
  const wrongChain = !!address && chainId !== pairChainId;

  // tokenAddress = the cToken (ERC-7984 wrapper) — SDK uses this as the
  // intended contract in the FHE input proof and calls underlying() internally
  // to find the ERC-20 for the approval step in shield.
  const { mutateAsync: shield, isPending: shielding } = useShield({
    tokenAddress: pair.confidentialTokenAddress,
  });

  const { mutateAsync: unshield, isPending: unshielding } = useUnshield({
    tokenAddress: pair.confidentialTokenAddress,
  });

  // enabled: false → never auto-decrypt. Decryption (which needs a wallet
  // signature) only runs when the user clicks "Sign to decrypt". refetch()
  // ignores `enabled`, so the manual trigger still works.
  const { data: confBalance, isFetching: confFetching, refetch: decryptBalance } = useConfidentialBalance(
    { tokenAddress: pair.confidentialTokenAddress },
    { enabled: false },
  );

  const { data: pubBalance, refetch: refetchPub } = useReadContract({
    address: pair.tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address!],
    chainId: pairChainId, // read from the pair's chain regardless of wallet chain
    query: { enabled: !!address },
  });

  // Hide a previously-revealed balance again if the wallet/account changes.
  useEffect(() => {
    setRevealed(false);
    setDecryptError("");
  }, [address, pair.confidentialTokenAddress]);

  const handleDecrypt = useCallback(async () => {
    if (wrongChain) return; // decryption is keyed by the connected chain — must match first
    setDecryptError("");
    setRevealed(true);
    try {
      // refetch() never throws — TanStack Query parks failures on result.error.
      const res = await decryptBalance();
      if (res.error) throw res.error;
    } catch (e) {
      console.error("[VeilX] confidential balance decrypt failed:", e);
      const msg = matchZamaError(e as Error, {
        SIGNING_REJECTED: () => "Signature cancelled",
        NO_CIPHERTEXT: () => "No confidential balance yet — wrap tokens first",
        RELAYER_REQUEST_FAILED: () => "Relayer unreachable — try again",
        _: (err: unknown) =>
          err instanceof Error && err.message ? `Decrypt failed: ${err.message}` : "Decrypt failed — try again",
      });
      setDecryptError(msg ?? "Decrypt failed — try again");
    }
  }, [decryptBalance, wrongChain]);

  // Surface the encrypt/proof window during unwrap. useUnshield's callbacks only
  // fire from phase-1 submit onward, leaving the slow client-side encryption +
  // relayer proof-verification as a silent spinner. The SDK's event stream
  // (encrypt:start/end) fills that gap. Gated by unwrapActiveRef + token match so
  // it never reacts to unrelated operations.
  useEffect(() => {
    const cToken = pair.confidentialTokenAddress.toLowerCase();
    return subscribeFheEvent((event: ZamaSDKEvent) => {
      if (!unwrapActiveRef.current) return;
      if (event.tokenAddress && event.tokenAddress.toLowerCase() !== cToken) return;
      switch (event.type) {
        case ZamaSDKEvents.EncryptStart:
          unwrapStageRef.current = "encrypting";
          unwrapTimerRef.current?.mark("encrypt_started");
          setStatusMsg("Encrypting amount…");
          break;
        case ZamaSDKEvents.EncryptEnd:
          unwrapStageRef.current = "verifying";
          unwrapTimerRef.current?.mark("encrypt_finished", { durationMs: event.durationMs });
          setStatusMsg("Verifying proof & submitting…");
          break;
        // phase1/phase2 transitions are handled by useUnshield's callbacks below.
      }
    });
  }, [pair.confidentialTokenAddress]);

  const isPending = shielding || unshielding;

  // Tick the elapsed counter while an unwrap is running; reset when it ends.
  useEffect(() => {
    if (!unshielding) {
      setUnwrapElapsed(0);
      return;
    }
    setUnwrapElapsed(0);
    const started = performance.now();
    const t = setInterval(() => {
      setUnwrapElapsed(Math.floor((performance.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [unshielding]);

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
      // Auto-refresh so the result is visible without a page reload: the public
      // balance drops immediately; the confidential balance is re-decrypted only
      // if the user had already revealed it (avoids a surprise signature prompt).
      refetchPub();
      if (revealed) decryptBalance();
    } catch (e) {
      console.error("[VeilX] wrap failed:", e);
      const msg = matchZamaError(e as Error, {
        SIGNING_REJECTED: () => "Transaction cancelled",
        INSUFFICIENT_ERC20_BALANCE: () => `Not enough ${pair.symbol ?? "tokens"} — mint more from the Faucet`,
        APPROVAL_FAILED: () => "ERC-20 approval failed — try again",
        TRANSACTION_REVERTED: () => "Wrap transaction reverted — check your balance and try again",
        ERC20_READ_FAILED: () => "Could not read your token balance — check your network/RPC and try again",
        RELAYER_REQUEST_FAILED: () => "Relayer unreachable — check your connection",
        CONFIGURATION: () => "SDK misconfigured for this network — reload the page and try again",
        _: (err: unknown) =>
          (err instanceof Error ? err.message : String(err)) || "Wrap failed",
      });
      setIsError(true);
      setStatusMsg(msg ?? "Wrap failed");
    }
  }, [amount, address, shield, decimals, pair.symbol, refetchPub, revealed, decryptBalance]);

  const handleUnwrap = useCallback(async () => {
    if (!amount || !address) return;
    resetStatus();
    // Initial label; the encrypt:start/end events refine it during the slow
    // pre-submit window, then useUnshield's callbacks take over for phase 1/2.
    setStatusMsg("Preparing unwrap…");
    unwrapActiveRef.current = true;
    unwrapStageRef.current = "preparing";
    const timer = new StageTimer("unwrap");
    unwrapTimerRef.current = timer;
    timer.mark("started");
    try {
      const result = await unshield({
        amount: parseUnits(amount, decimals),
        skipBalanceCheck: true,
        onUnwrapSubmitted: (hash: string | undefined) => {
          unwrapStageRef.current = "phase1";
          timer.mark("phase1_submitted");
          if (hash) setTxHash(hash);
          setStatusMsg("Phase 1 submitted — waiting for KMS decryption…");
        },
        onFinalizing: () => {
          unwrapStageRef.current = "phase2";
          timer.mark("phase2_started");
          setStatusMsg("Phase 2: finalizing withdrawal…");
        },
        onFinalizeSubmitted: (hash: string | undefined) => {
          unwrapStageRef.current = "finalize";
          timer.mark("finalize_submitted");
          if (hash) setTxHash(hash);
          setStatusMsg("Finalize submitted, confirming…");
        },
      });
      if (result) setTxHash((result as TransactionResult).txHash);
      timer.mark("finalized");
      timer.summary("completed");
      setIsDone(true);
      setStatusMsg("Unwrap complete!");
      refetchPub();
      if (revealed) decryptBalance();
    } catch (e) {
      const stage = unwrapStageRef.current;
      console.error(`[VeilX] unwrap failed at stage="${stage}":`, e);
      timer.mark("failed", { stage });
      timer.summary("failed", { stage });
      // Phase-aware messages: users care whether it's progressing or dead, and
      // *where* it died — proof step vs phase 1 (burn) vs phase 2 (finalize).
      const msg = matchZamaError(e as Error, {
        SIGNING_REJECTED: () => "Transaction cancelled",
        INSUFFICIENT_CONFIDENTIAL_BALANCE: () => `Not enough ${pair.cSymbol ?? "cTokens"} — wrap tokens first`,
        NO_CIPHERTEXT: () => "No confidential balance — wrap tokens first",
        BALANCE_CHECK_UNAVAILABLE: () => "Click 'Sign to decrypt' to verify your balance first",
        ENCRYPTION_FAILED: () => "Encryption failed — reload the page and try again",
        RELAYER_REQUEST_FAILED: () =>
          stage === "encrypting" || stage === "verifying"
            ? "Proof verification failed — relayer unreachable or timed out (>120s)"
            : "Relayer unreachable — check your connection",
        TRANSACTION_REVERTED: () =>
          stage === "phase2" || stage === "finalize"
            ? "Phase 2 (finalize) reverted — withdrawal not released; try again"
            : "Phase 1 (burn) reverted — ensure you have wrapped tokens and try again",
        _: (err: unknown) => {
          const base = err instanceof Error ? err.message : String(err);
          if (stage === "encrypting" || stage === "verifying") return `Proof step failed${base ? `: ${base}` : " — encryption/proof error"}`;
          if (stage === "phase1") return `Phase 1 failed${base ? `: ${base}` : " — burn did not confirm"}`;
          if (stage === "phase2" || stage === "finalize") return `Finalize failed${base ? `: ${base}` : " — withdrawal did not complete"}`;
          return base || "Unwrap failed";
        },
      });
      setIsError(true);
      setStatusMsg(msg ?? "Unwrap failed");
    } finally {
      unwrapActiveRef.current = false;
      unwrapStageRef.current = "idle";
      unwrapTimerRef.current = null;
    }
  }, [amount, address, unshield, decimals, pair.cSymbol, refetchPub, revealed, decryptBalance]);

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
              {wrongChain
                ? <span className="loading-dots">Switch to {pairNetworkName}</span>
                : confFetching
                  ? <span className="loading-dots">Decrypting…</span>
                  : revealed && confBalance !== undefined
                    ? fmtBalance(confBalance, decimals)
                    : <button className="decrypt-btn" onClick={handleDecrypt}>Sign to decrypt ↗</button>
              }
            </div>
            {decryptError && !confFetching && <div className="decrypt-error">{decryptError}</div>}
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

        {/* Action — swap for a network-switch prompt when wallet is on the wrong chain */}
        {wrongChain ? (
          <button
            className="action-btn"
            onClick={() => switchChain({ chainId: pairChainId })}
            disabled={switching}
          >
            {switching && <span className="spinner" />}
            {switching ? "Switching…" : `Switch to ${pairNetworkName} to continue`}
          </button>
        ) : (
          <button
            className={`action-btn ${isPending ? "loading" : ""} ${isDone ? "success" : ""} ${isError ? "error" : ""}`}
            onClick={tab === "wrap" ? handleWrap : handleUnwrap}
            disabled={isPending || isDone || !amount || !address}
          >
            {isPending && <span className="spinner" />}
            {btnLabel}
          </button>
        )}

        {/* "Wait a sec" — reassurance during the long KMS/finalize wait */}
        {unshielding && (
          <div className="kms-wait">
            <span className="kms-wait-spinner" />
            <span className="kms-wait-text">
              {unwrapElapsed < 150
                ? <>Wait a sec — Sepolia's KMS is decrypting your amount on-chain. Unwraps usually take <strong>1–3 min</strong>.</>
                : <>Still going — the testnet's running slow, but your unwrap is alive and will finish.</>
              }
              {" "}<span className="kms-wait-elapsed">{unwrapElapsed}s elapsed</span>
            </span>
          </div>
        )}

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
