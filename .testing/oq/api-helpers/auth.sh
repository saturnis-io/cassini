#!/bin/bash
# OQ Test Framework — Authentication Helper
# Usage: source .testing/oq/api-helpers/auth.sh [username] [password]
#
# Gets a JWT token and exports it as $TOKEN.
# Used by other seed scripts via `source`.
#
# Environment:
#   API_URL — Base API URL (default: http://localhost:8000/api/v1)

API_URL="${API_URL:-http://localhost:8000/api/v1}"
USERNAME="${1:-admin}"
PASSWORD="${2:-admin}"

RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

export TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to get auth token for $USERNAME"
  echo "Response: $RESPONSE"
  return 1 2>/dev/null || exit 1
fi

echo "Authenticated as $USERNAME"
