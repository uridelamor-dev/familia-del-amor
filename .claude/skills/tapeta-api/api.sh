#!/usr/bin/env bash
# Prueba la API de La Tapeta con login automático y pretty-print.
# Uso:   api.sh <endpoint> [usuario] [método] [json-body]
# Ej:    api.sh reservas
#        api.sh leads encargado
#        api.sh reservas direccion POST '{"local":"La Tapeta - Blanes","personas":4,...}'
# Vars:  BASE (def http://localhost:3000)
set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
EP="${1:?uso: api.sh <endpoint> [usuario] [método] [json-body]}"
USER_="${2:-direccion}"
METHOD="${3:-GET}"
BODY="${4:-}"

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_\",\"password\":\"tapeta2024\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
[ -z "$TOKEN" ] && { echo "❌ login falló como '$USER_' (¿server arrancado en $BASE?)"; exit 1; }

EP="${EP#/}"; EP="${EP#api/}"   # acepta 'reservas', '/reservas' o 'api/reservas'
if [ "$METHOD" = GET ]; then
  curl -s "$BASE/api/$EP" -H "Authorization: Bearer $TOKEN" \
    | python3 -m json.tool 2>/dev/null || echo "(respuesta no-JSON)"
else
  curl -s -X "$METHOD" "$BASE/api/$EP" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d "$BODY" \
    | python3 -m json.tool 2>/dev/null || echo "(respuesta no-JSON)"
fi
