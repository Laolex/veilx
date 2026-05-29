import { Header } from "./components/Header";
import { RegistryGrid } from "./components/RegistryGrid";
import { Faucet } from "./components/Faucet";

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <RegistryGrid />
        <Faucet />
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <span>Built on <a href="https://zama.ai" target="_blank" rel="noopener noreferrer">Zama fhEVM</a> — ERC-7984 Confidential Token Standard</span>
          <span className="footer-links">
            <a href="https://docs.zama.ai" target="_blank" rel="noopener noreferrer">Docs</a>
            <a href="https://github.com/Laolex/zama-wrapper-registry" target="_blank" rel="noopener noreferrer">GitHub</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
