export const config = { runtime: "edge" };

const RELAYER_URLS = {
  "11155111": process.env.ZAMA_RELAYER_SEPOLIA ?? "https://relayer.testnet.zama.org",
  "1": process.env.ZAMA_RELAYER_MAINNET ?? "https://relayer.mainnet.zama.org",
};

const FORWARD_HEADERS = new Set([
  "content-type",
  "accept",
  "accept-encoding",
  "x-zama-client",
  "zama-sdk-version",
  "zama-sdk-name",
  "authorization",
]);

function isTextContentType(ct) {
  if (!ct) return false;
  return (
    ct.includes("application/json") ||
    ct.includes("text/") ||
    ct.includes("application/x-www-form-urlencoded")
  );
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const url = new URL(req.url);
  // path: /api/relay/<chainId>/<rest>
  const parts = url.pathname.replace(/^\/api\/relay\/?/, "").split("/");
  const chainId = parts[0];
  const rest = "/" + parts.slice(1).join("/");

  const origin = RELAYER_URLS[chainId];
  if (!origin) {
    return new Response(`Unsupported chain: ${chainId}`, { status: 400 });
  }

  const target = `${origin}${rest}${url.search ?? ""}`;

  const fwdHeaders = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (FORWARD_HEADERS.has(k.toLowerCase())) fwdHeaders.set(k, v);
  }

  const response = await fetch(target, {
    method: req.method,
    headers: fwdHeaders,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    duplex: "half",
  });

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  // Default to arrayBuffer — only decode as text when we're certain it's text.
  // Binary data (protobuf, WASM params, proofs) must not be decoded as UTF-8.
  const data = isTextContentType(contentType)
    ? await response.text()
    : await response.arrayBuffer();

  return new Response(data, {
    status: response.status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "content-type": contentType,
      "ZAMA-SDK-VERSION": response.headers.get("ZAMA-SDK-VERSION") ?? "",
      "ZAMA-SDK-NAME": response.headers.get("ZAMA-SDK-NAME") ?? "",
    },
  });
}
