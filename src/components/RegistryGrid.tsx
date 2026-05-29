import { useState } from "react";
import { useChainId } from "wagmi";
import { useRegistryPairs, RegistryPair } from "../hooks/useRegistryPairs";
import { SEPOLIA_ID, MAINNET_ID, REGISTRY_ADDRESS } from "../config";
import { WrapModal } from "./WrapModal";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function copyAddr(addr: string) {
  navigator.clipboard.writeText(addr).catch(() => {});
}

function PairCard({
  pair,
  chainId,
  onWrap,
}: {
  pair: RegistryPair;
  chainId: number;
  onWrap: (pair: RegistryPair) => void;
}) {
  const etherscanBase =
    chainId === SEPOLIA_ID
      ? "https://sepolia.etherscan.io"
      : "https://etherscan.io";

  const symbol = pair.symbol ?? shortAddr(pair.tokenAddress);
  const cSymbol = pair.cSymbol ?? shortAddr(pair.confidentialTokenAddress);

  return (
    <div className={`pair-card ${!pair.isValid ? "revoked" : ""}`} style={{ animationDelay: `${Math.random() * 0.2}s` }}>
      <div className="pair-card-top">
        <div className="pair-symbols">
          <div className="token-badge">{symbol}</div>
          <div className="arrow-line">
            <span className="arrows">⇄</span>
          </div>
          <div className="token-badge conf">{cSymbol}</div>
        </div>
        <span className={`validity-badge ${pair.isValid ? "valid" : "revoked"}`}>
          {pair.isValid ? "✓ Active" : "✗ Revoked"}
        </span>
      </div>

      {pair.name && <div className="pair-name">{pair.name}</div>}

      <div className="addr-chips">
        <button
          className="addr-chip"
          onClick={() => copyAddr(pair.tokenAddress)}
          title={pair.tokenAddress}
        >
          ERC-20: {shortAddr(pair.tokenAddress)}
          <span className="copy-icon">⎘</span>
        </button>
        <button
          className="addr-chip conf"
          onClick={() => copyAddr(pair.confidentialTokenAddress)}
          title={pair.confidentialTokenAddress}
        >
          cToken: {shortAddr(pair.confidentialTokenAddress)}
          <span className="copy-icon">⎘</span>
        </button>
      </div>

      <div className="pair-actions">
        <a
          className="eth-link"
          href={`${etherscanBase}/address/${pair.tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Etherscan ↗
        </a>
        {pair.isValid && (
          <button className="wrap-btn" onClick={() => onWrap(pair)}>
            Wrap / Unwrap
          </button>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="pair-card skeleton">
      <div className="skel-line wide" />
      <div className="skel-line" />
      <div className="skel-line narrow" />
    </div>
  );
}

export function RegistryGrid() {
  const chainId = useChainId();
  const [viewChain, setViewChain] = useState(chainId);
  const { pairs, isLoading, error, registryAddr } = useRegistryPairs(viewChain);
  const [selectedPair, setSelectedPair] = useState<RegistryPair | null>(null);

  const etherscanBase =
    viewChain === SEPOLIA_ID
      ? "https://sepolia.etherscan.io"
      : "https://etherscan.io";

  return (
    <section className="registry-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Wrapper Registry</h2>
          <p className="section-sub">
            All registered ERC-20 ↔ ERC-7984 confidential token pairs
            {registryAddr && (
              <> · <a className="registry-link" href={`${etherscanBase}/address/${registryAddr}`} target="_blank" rel="noopener noreferrer">
                {shortAddr(registryAddr)} ↗
              </a></>
            )}
          </p>
        </div>
        <div className="chain-toggle">
          <button
            className={`chain-btn ${viewChain === SEPOLIA_ID ? "active" : ""}`}
            onClick={() => setViewChain(SEPOLIA_ID)}
          >
            <span className="net-dot sepolia" /> Sepolia
          </button>
          <button
            className={`chain-btn ${viewChain === MAINNET_ID ? "active" : ""}`}
            onClick={() => setViewChain(MAINNET_ID)}
          >
            <span className="net-dot mainnet" /> Ethereum
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          Failed to load registry: {(error as Error).message}
        </div>
      )}

      <div className="pairs-grid">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : pairs.length === 0 && !error
            ? <div className="empty-state">No wrapper pairs found on this network.</div>
            : pairs.map((p) => (
              <PairCard
                key={`${p.tokenAddress}-${p.confidentialTokenAddress}`}
                pair={p}
                chainId={viewChain}
                onWrap={setSelectedPair}
              />
            ))
        }
      </div>

      {pairs.length > 0 && !isLoading && (
        <div className="registry-stats">
          <span>{pairs.filter((p) => p.isValid).length} active pairs</span>
          <span>·</span>
          <span>{pairs.filter((p) => !p.isValid).length} revoked</span>
          <span>·</span>
          <span>{pairs.length} total</span>
        </div>
      )}

      {selectedPair && (
        <WrapModal pair={selectedPair} onClose={() => setSelectedPair(null)} />
      )}
    </section>
  );
}
