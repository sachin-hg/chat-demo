/* eslint-disable no-console */
const https = require("https");
const httpProxy = require("http-proxy");
const fs = require("fs");

const PORT = Number(process.env.HTTPS_PORT ?? 443);
const TARGET = process.env.NEXT_DEV_TARGET ?? "http://localhost:3000";
const KEY_PATH = process.env.SSL_KEY_PATH || "./certs/privatekey.pem";
const CERT_PATH = process.env.SSL_CERT_PATH || "./certs/fullchain.pem";

if (process.env.USE_HTTPS !== "true") {
  console.error("USE_HTTPS must be true for dev-https-proxy.cjs");
  process.exit(1);
}

let key;
let cert;
try {
  key = fs.readFileSync(KEY_PATH);
  cert = fs.readFileSync(CERT_PATH);
} catch (e) {
  console.error("Failed to read SSL certificate files.");
  console.error(`Expected:\n- ${KEY_PATH}\n- ${CERT_PATH}`);
  console.error("Run: npm run setup:https");
  process.exit(1);
}

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  ws: true,
  xfwd: true,
  changeOrigin: false, // preserve original Host header (chat-local.housing.com)
});

proxy.on("error", (err, req, res) => {
  const msg = `Proxy error: ${err?.message ?? String(err)}`;
  console.error(msg);
  if (res && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
  }
  try {
    res.end(msg);
  } catch (_) {}
});

const server = https.createServer({ key, cert }, (req, res) => {
  proxy.web(req, res);
});

// WebSocket upgrades (Next.js HMR, etc.)
server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head);
});

server.listen(PORT, () => {
  const host = process.env.CHAT_DEMO_LOCAL_DOMAIN || "chat-local.housing.com";
  const portDisplay = PORT === 443 ? "" : `:${PORT}`;
  console.log(`[HTTPS] Local TLS proxy listening on ${PORT}`);
  console.log(`[HTTPS] Forwarding -> ${TARGET}`);
  console.log(`[HTTPS] Open: https://${host}${portDisplay}`);
});

