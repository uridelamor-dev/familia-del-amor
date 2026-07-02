#!/usr/bin/env bash
# Reinicia La Tapeta: libera puerto 3000, mata chrome/puppeteer, borra el lock de
# WhatsApp-web.js, relanza server.js en una Terminal nueva y hace health-check.
set -uo pipefail
ROOT="$HOME/Desktop/latapeta"

echo "→ Liberando puerto 3000…"
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1
echo "→ Cerrando chrome/puppeteer…"
pkill -f chrome 2>/dev/null; pkill -f puppeteer 2>/dev/null
echo "→ Borrando SingletonLock de WhatsApp…"
rm -f "$ROOT/.wwebjs_auth/session/SingletonLock"

echo "→ Arrancando server.js en Terminal nueva…"
osascript -e 'tell application "Terminal" to activate' \
          -e "tell application \"Terminal\" to do script \"cd $ROOT && node server.js\""

echo "→ Esperando al arranque…"
sleep 3
echo "→ Health check:"
curl -s http://localhost:3000/api/health && echo
open http://localhost:3000
echo "✓ Reinicio lanzado. Si WhatsApp pide QR, re-linkar (se desconecta en cada redeploy)."
