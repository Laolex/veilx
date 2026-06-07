import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The Zama relayer SDK pins its Web Worker request timeout to 30s
// (`const r=3e4`). The unwrap flow's input-proof verification is an async job
// the SDK polls for, and the testnet relayer routinely takes longer than 30s
// to finish — so ENCRYPT is cancelled mid-poll and unwrap fails. encrypt()
// exposes no way to override that timeout, so we lift the ceiling to 120s at
// build time. Done as a Vite transform (not a node_modules edit or
// patch-package) so it survives Vercel's clean `npm install`.
function bumpZamaWorkerTimeout(): Plugin {
  return {
    name: "bump-zama-worker-timeout",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("@zama-fhe/sdk") && code.includes("const r=3e4;")) {
        // eslint-disable-next-line no-console
        console.log(`[bump-zama-worker-timeout] 30s → 120s in ${id.split("/node_modules/").pop()}`);
        return { code: code.replace("const r=3e4;", "const r=12e4;"), map: null };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [bumpZamaWorkerTimeout(), react()],
  optimizeDeps: {
    // @zama-fhe/sdk holds the `const r=3e4;` worker timeout that
    // bumpZamaWorkerTimeout() rewrites. If it gets esbuild-prebundled, the Vite
    // transform hook never runs on it (dev would keep the 30s timeout and break
    // unwrap). Excluding it — plus its /query subpath — keeps both packages in
    // the plugin pipeline so the patch applies in dev as well as prod.
    exclude: ["@zama-fhe/react-sdk", "@zama-fhe/sdk", "@zama-fhe/sdk/query"],
  },
  build: {
    target: "es2022",
  },
  worker: {
    format: "es",
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
});
