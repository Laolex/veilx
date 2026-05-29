import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId, useSwitchChain } from "wagmi";
import { sepolia, mainnet } from "wagmi/chains";
import { SEPOLIA_ID, MAINNET_ID } from "../config";

export function Header() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">
          <div className="logo-icon">V</div>
          <div>
            <div className="logo-title">VeilX</div>
            <div className="logo-sub">Powered by Zama fhEVM</div>
          </div>
        </div>

        <div className="header-right">
          <div className="network-switcher">
            <button
              className={`net-btn ${chainId === SEPOLIA_ID ? "active" : ""}`}
              onClick={() => switchChain({ chainId: SEPOLIA_ID })}
            >
              <span className="net-dot sepolia" />
              Sepolia
            </button>
            <button
              className={`net-btn ${chainId === MAINNET_ID ? "active" : ""}`}
              onClick={() => switchChain({ chainId: MAINNET_ID })}
            >
              <span className="net-dot mainnet" />
              Ethereum
            </button>
          </div>
          <ConnectButton accountStatus="address" showBalance={false} />
        </div>
      </div>
    </header>
  );
}
