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
]);

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  });

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const data =
    contentType.includes("application/octet-stream") || contentType.includes("binary")
      ? await response.arrayBuffer()
      : await response.text();

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
