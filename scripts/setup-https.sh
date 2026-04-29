#!/bin/bash

set -euo pipefail

DOMAIN="${CHAT_DEMO_LOCAL_DOMAIN:-chat-local.housing.com}"

echo "🔐 Setting up HTTPS for local development..."
echo ""
echo "Domain: $DOMAIN"
echo ""

if ! command -v mkcert &> /dev/null; then
  echo "❌ mkcert is not installed"
  echo ""
  echo "Install it first:"
  echo "  macOS: brew install mkcert"
  echo "  Other: https://github.com/FiloSottile/mkcert"
  exit 1
fi

echo "📜 Installing local Certificate Authority (mkcert -install)..."
if ! mkcert -install; then
  echo ""
  echo "❌ mkcert -install failed."
  echo ""
  echo "This usually happens when mkcert's local CA files were created with the wrong ownership"
  echo "(e.g. by running mkcert via sudo once)."
  echo ""
  echo "Fix (macOS) — make the mkcert directory owned by your user, then retry:"
  echo "  sudo chown -R \"$(whoami)\":staff \"${HOME}/Library/Application Support/mkcert\""
  echo ""
  echo "Then run:"
  echo "  npm run setup:https"
  exit 1
fi
echo ""

mkdir -p certs

echo "🔑 Generating SSL certificates..."
mkcert -key-file certs/privatekey.pem -cert-file certs/fullchain.pem \
  "$DOMAIN" localhost 127.0.0.1 ::1

echo "✅ Certificates generated in ./certs/"
echo ""

if [ -n "${SUDO_USER:-}" ]; then
  echo "🔑 Fixing certificate file ownership..."
  SUDO_USER_GROUP=$(id -gn "$SUDO_USER" 2>/dev/null || echo "staff")
  chown "$SUDO_USER:$SUDO_USER_GROUP" certs/privatekey.pem certs/fullchain.pem || true
fi

echo ""

if grep -q "$DOMAIN" /etc/hosts 2>/dev/null; then
  echo "✅ Domain already present in /etc/hosts"
else
  echo "📝 Adding domain to /etc/hosts (requires sudo)..."
  echo "127.0.0.1 $DOMAIN" | sudo tee -a /etc/hosts > /dev/null
  echo "✅ Added: 127.0.0.1 $DOMAIN"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✨ HTTPS setup complete!"
echo ""
echo "Next steps:"
echo "  1) npm install"
echo "  2) NEXT_PUBLIC_PROD=true npm run dev:https"
echo ""
echo "Open:"
echo "  🌐 https://$DOMAIN"
echo "═══════════════════════════════════════════════════════════════"

