#!/bin/bash
# OQ Test Framework — Seed Hierarchy
# Usage: bash .testing/oq/api-helpers/seed-hierarchy.sh <plant_name> [plant_code]
#
# Creates a plant with a full ISA-95 hierarchy:
#   Plant → Department (Area) → Line → Station (Equipment)
#
# Handles 409 Conflict by looking up existing resources.
# Prints all created/found IDs at the end.
#
# Environment:
#   API_URL — Base API URL (default: http://localhost:8000/api/v1)
#   TOKEN   — JWT token (auto-sourced from auth.sh if not set)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_URL="${API_URL:-http://localhost:8000/api/v1}"

# --- Arguments ---
PLANT_NAME="${1:?Usage: seed-hierarchy.sh <plant_name> [plant_code]}"
PLANT_CODE="${2:-$(echo "$PLANT_NAME" | tr '[:lower:]' '[:upper:]' | tr ' ' '-' | head -c 10)}"

# --- Authenticate if needed ---
if [ -z "${TOKEN:-}" ]; then
  source "$SCRIPT_DIR/auth.sh"
fi

# --- Helper: extract JSON field ---
json_field() {
  local json="$1" field="$2"
  echo "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null
}

# --- Helper: extract ID from JSON ---
json_id() {
  local json="$1"
  echo "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null
}

# --- Helper: find plant by name from list ---
find_plant_by_name() {
  local name="$1"
  curl -s "$API_URL/plants/" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "
import sys, json
plants = json.load(sys.stdin)
for p in plants:
    if p['name'] == '$name':
        print(p['id'])
        sys.exit(0)
print('')
" 2>/dev/null
}

# --- Helper: find hierarchy node by name under a parent in a plant ---
find_hierarchy_node() {
  local plant_id="$1" name="$2" parent_id="${3:-}"
  curl -s "$API_URL/plants/$plant_id/hierarchies/" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "
import sys, json

def find_node(nodes, name, parent_id):
    for node in nodes:
        if node['name'] == name:
            return node['id']
        found = find_node(node.get('children', []), name, parent_id)
        if found:
            return found
    return None

tree = json.load(sys.stdin)
result = find_node(tree, '$name', '$parent_id')
print(result if result else '')
" 2>/dev/null
}

# =============================================
# Step 1: Create Plant
# =============================================
echo "--- Creating plant: $PLANT_NAME ($PLANT_CODE) ---"

PLANT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/plants/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PLANT_NAME\",\"code\":\"$PLANT_CODE\"}")

PLANT_HTTP_CODE=$(echo "$PLANT_RESPONSE" | tail -n1)
PLANT_BODY=$(echo "$PLANT_RESPONSE" | sed '$d')

if [ "$PLANT_HTTP_CODE" = "201" ]; then
  PLANT_ID=$(json_id "$PLANT_BODY")
  echo "  Created plant ID: $PLANT_ID"
elif [ "$PLANT_HTTP_CODE" = "409" ]; then
  echo "  Plant already exists, looking up..."
  PLANT_ID=$(find_plant_by_name "$PLANT_NAME")
  if [ -z "$PLANT_ID" ]; then
    echo "ERROR: Plant exists (409) but could not find by name"
    exit 1
  fi
  echo "  Found existing plant ID: $PLANT_ID"
else
  echo "ERROR: Failed to create plant (HTTP $PLANT_HTTP_CODE)"
  echo "  Response: $PLANT_BODY"
  exit 1
fi

# =============================================
# Step 2: Create Department (Area) node
# =============================================
DEPT_NAME="${PLANT_NAME} - Production"
echo "--- Creating department: $DEPT_NAME ---"

DEPT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/plants/$PLANT_ID/hierarchies/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$DEPT_NAME\",\"type\":\"Area\"}")

DEPT_HTTP_CODE=$(echo "$DEPT_RESPONSE" | tail -n1)
DEPT_BODY=$(echo "$DEPT_RESPONSE" | sed '$d')

if [ "$DEPT_HTTP_CODE" = "201" ]; then
  DEPT_ID=$(json_id "$DEPT_BODY")
  echo "  Created department ID: $DEPT_ID"
elif [ "$DEPT_HTTP_CODE" = "422" ] || [ "$DEPT_HTTP_CODE" = "409" ]; then
  echo "  Department may already exist, looking up..."
  DEPT_ID=$(find_hierarchy_node "$PLANT_ID" "$DEPT_NAME")
  if [ -z "$DEPT_ID" ] || [ "$DEPT_ID" = "None" ]; then
    echo "ERROR: Department conflict but could not find by name"
    exit 1
  fi
  echo "  Found existing department ID: $DEPT_ID"
else
  echo "ERROR: Failed to create department (HTTP $DEPT_HTTP_CODE)"
  echo "  Response: $DEPT_BODY"
  exit 1
fi

# =============================================
# Step 3: Create Line node under Department
# =============================================
LINE_NAME="Line 1"
echo "--- Creating line: $LINE_NAME ---"

LINE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/plants/$PLANT_ID/hierarchies/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"parent_id\":$DEPT_ID,\"name\":\"$LINE_NAME\",\"type\":\"Line\"}")

LINE_HTTP_CODE=$(echo "$LINE_RESPONSE" | tail -n1)
LINE_BODY=$(echo "$LINE_RESPONSE" | sed '$d')

if [ "$LINE_HTTP_CODE" = "201" ]; then
  LINE_ID=$(json_id "$LINE_BODY")
  echo "  Created line ID: $LINE_ID"
elif [ "$LINE_HTTP_CODE" = "422" ] || [ "$LINE_HTTP_CODE" = "409" ]; then
  echo "  Line may already exist, looking up..."
  LINE_ID=$(find_hierarchy_node "$PLANT_ID" "$LINE_NAME")
  if [ -z "$LINE_ID" ] || [ "$LINE_ID" = "None" ]; then
    echo "ERROR: Line conflict but could not find by name"
    exit 1
  fi
  echo "  Found existing line ID: $LINE_ID"
else
  echo "ERROR: Failed to create line (HTTP $LINE_HTTP_CODE)"
  echo "  Response: $LINE_BODY"
  exit 1
fi

# =============================================
# Step 4: Create Station (Equipment) node under Line
# =============================================
STATION_NAME="Station A"
echo "--- Creating station: $STATION_NAME ---"

STATION_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/plants/$PLANT_ID/hierarchies/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"parent_id\":$LINE_ID,\"name\":\"$STATION_NAME\",\"type\":\"Equipment\"}")

STATION_HTTP_CODE=$(echo "$STATION_RESPONSE" | tail -n1)
STATION_BODY=$(echo "$STATION_RESPONSE" | sed '$d')

if [ "$STATION_HTTP_CODE" = "201" ]; then
  STATION_ID=$(json_id "$STATION_BODY")
  echo "  Created station ID: $STATION_ID"
elif [ "$STATION_HTTP_CODE" = "422" ] || [ "$STATION_HTTP_CODE" = "409" ]; then
  echo "  Station may already exist, looking up..."
  STATION_ID=$(find_hierarchy_node "$PLANT_ID" "$STATION_NAME")
  if [ -z "$STATION_ID" ] || [ "$STATION_ID" = "None" ]; then
    echo "ERROR: Station conflict but could not find by name"
    exit 1
  fi
  echo "  Found existing station ID: $STATION_ID"
else
  echo "ERROR: Failed to create station (HTTP $STATION_HTTP_CODE)"
  echo "  Response: $STATION_BODY"
  exit 1
fi

# =============================================
# Summary
# =============================================
echo ""
echo "========================================="
echo "  Hierarchy Seeded Successfully"
echo "========================================="
echo "  PLANT_ID:   $PLANT_ID"
echo "  DEPT_ID:    $DEPT_ID"
echo "  LINE_ID:    $LINE_ID"
echo "  STATION_ID: $STATION_ID"
echo "========================================="

# Export for use in other scripts
export PLANT_ID DEPT_ID LINE_ID STATION_ID
