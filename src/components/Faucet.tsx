import { useAccount, useReadContracts, useChainId } from "wagmi";
import { formatUnits } from "viem";
import { SEPOLIA_MOCKS, ERC20_ABI, SEPOLIA_ID, type KnownToken } from "../config";
import { useMint } from "../hooks/useMint";

function FaucetCard({ token, userAddress }: { token: KnownToken; userAddress: `0x${string}` }) {
  const { mint, isPending, isSuccess, error } = useMint(token.underlying, token.decimals);

  const { data: balResults } = useReadContracts({
    contracts: [
      {
        address: token.underlying,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [userAddress],
      },
    ],
    query: { refetchInterval: 10_000 },
  });

  const balance = balResults?.[0]?.result as bigint | undefined;
  const fmtBalance = balance !== undefined
    ? Number(formatUnits(balance, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "—";

  return (
    <div className="faucet-card">
      <div className="faucet-top">
        <div className="faucet-names">
          <div className="faucet-symbol">{token.symbol}</div>
          <div className="faucet-csymbol">→ {token.cSymbol}</div>
        </div>
        <div className="faucet-balance">
          <div className="faucet-bal-label">Balance</div>
          <div className="faucet-bal-val">{fmtBalance}</div>
        </div>
      </div>

      <button
        className={`faucet-btn ${isPending ? "loading" : ""} ${isSuccess ? "success" : ""}`}
        onClick={() => mint(userAddress, "1000")}
        disabled={isPending}
      >
        {isPending ? (
          <><span className="spinner" /> Minting…</>
        ) : isSuccess ? (
          "✓ Minted 1,000 tokens"
        ) : (
          `Mint 1,000 ${token.symbol}`
        )}
      </button>

      {error && (
        <div className="faucet-error">
          {(error as Error).message?.includes("revert") || (error as Error).message?.includes("execution reverted")
            ? "Mint not available for this token"
            : "Transaction failed — try again"
          }
        </div>
      )}
    </div>
  );
}

export function Faucet() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  if (chainId !== SEPOLIA_ID) {
    return (
      <section className="faucet-section">
        <div className="section-header">
          <h2 className="section-title">Faucet</h2>
        </div>
        <div className="faucet-notice">Switch to Sepolia to access the cTokenMock faucet.</div>
      </section>
    );
  }

  return (
    <section className="faucet-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Faucet</h2>
          <p className="section-sub">
            Mint test tokens for each cTokenMock underlying ERC-20 · 1,000 tokens per click · Sepolia only
          </p>
        </div>
      </div>

      {!isConnected ? (
        <div className="faucet-notice">Connect your wallet to use the faucet.</div>
      ) : (
        <div className="faucet-grid">
          {SEPOLIA_MOCKS.map((t) => (
            <FaucetCard key={t.underlying} token={t} userAddress={address!} />
          ))}
        </div>
      )}
    </section>
  );
}
