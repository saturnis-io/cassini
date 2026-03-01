#!/bin/bash
# OQ Test Framework — Seed Characteristics
# Usage: bash .testing/oq/api-helpers/seed-characteristics.sh <station_node_id> <name> [chart_type] [subgroup_size] [usl] [lsl] [target]
#
# Creates a characteristic under an existing hierarchy (station) node.
#
# Arguments:
#   station_node_id — Hierarchy node ID to attach the characteristic to
#   name            — Characteristic name (e.g., "Bore Diameter")
#   chart_type      — "xbar_r" (default), "xbar_s", "cusum", "ewma", "p", "np", "c", "u"
#   subgroup_size   — Number of measurements per sample (default: 5)
#   usl             — Upper Specification Limit (optional)
#   lsl             — Lower Specification Limit (optional)
#   target          — Target/nominal value (optional)
#
# Prints the created characteristic ID.
#
# Environment:
#   API_URL — Base API URL (default: http://localhost:8000/api/v1)
#   TOKEN   — JWT token (auto-sourced from auth.sh if not set)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_URL="${API_URL:-http://localhost:8000/api/v1}"

# --- Arguments ---
HIERARCHY_ID="${1:?Usage: seed-characteristics.sh <station_node_id> <name> [chart_type] [subgroup_size] [usl] [lsl] [target]}"
CHAR_NAME="${2:?Usage: seed-characteristics.sh <station_node_id> <name> [chart_type] [subgroup_size] [usl] [lsl] [target]}"
CHART_TYPE="${3:-xbar_r}"
SUBGROUP_SIZE="${4:-5}"
USL="${5:-}"
LSL="${6:-}"
TARGET="${7:-}"

# --- Authenticate if needed ---
if [ -z "${TOKEN:-}" ]; then
  source "$SCRIPT_DIR/auth.sh"
fi

# --- Determine data_type and advanced chart_type from the chart_type argument ---
# Attribute charts: p, np, c, u
# Advanced charts: cusum, ewma (these go into chart_type field)
# Standard variable charts: xbar_r, xbar_s (no chart_type field needed)
DATA_TYPE="variable"
ATTRIBUTE_CHART_TYPE=""
ADVANCED_CHART_TYPE=""

case "$CHART_TYPE" in
  p|np|c|u)
    DATA_TYPE="attribute"
    ATTRIBUTE_CHART_TYPE="$CHART_TYPE"
    ;;
  cusum|ewma)
    DATA_TYPE="variable"
    ADVANCED_CHART_TYPE="$CHART_TYPE"
    ;;
  xbar_r|xbar_s|*)
    DATA_TYPE="variable"
    ;;
esac

# --- Build JSON payload ---
PAYLOAD=$(python3 -c "
import json
payload = {
    'hierarchy_id': $HIERARCHY_ID,
    'name': '$CHAR_NAME',
    'data_type': '$DATA_TYPE',
    'subgroup_size': $SUBGROUP_SIZE,
}

# Spec limits (only if provided)
usl = '$USL'
lsl = '$LSL'
target = '$TARGET'
if usl:
    payload['usl'] = float(usl)
if lsl:
    payload['lsl'] = float(lsl)
if target:
    payload['target_value'] = float(target)

# Attribute chart type
attr_type = '$ATTRIBUTE_CHART_TYPE'
if attr_type:
    payload['attribute_chart_type'] = attr_type
    # Attribute charts need a default_sample_size
    payload['default_sample_size'] = $SUBGROUP_SIZE

# Advanced chart type (CUSUM/EWMA)
adv_type = '$ADVANCED_CHART_TYPE'
if adv_type:
    payload['chart_type'] = adv_type
    if adv_type == 'cusum':
        if target:
            payload['cusum_target'] = float(target)
        payload['cusum_k'] = 0.5
        payload['cusum_h'] = 5.0
    elif adv_type == 'ewma':
        payload['ewma_lambda'] = 0.2
        payload['ewma_l'] = 2.7

print(json.dumps(payload))
")

echo "--- Creating characteristic: $CHAR_NAME (type=$CHART_TYPE, n=$SUBGROUP_SIZE) ---"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/characteristics/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  CHAR_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
  echo "  Created characteristic ID: $CHAR_ID"
elif [ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "422" ]; then
  # Try to find existing characteristic by name under this hierarchy node
  echo "  Characteristic may already exist, looking up..."
  CHAR_ID=$(curl -s "$API_URL/characteristics/?hierarchy_id=$HIERARCHY_ID&limit=100" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('items', data) if isinstance(data, dict) else data
for c in items:
    if c['name'] == '$CHAR_NAME':
        print(c['id'])
        sys.exit(0)
print('')
" 2>/dev/null)

  if [ -z "$CHAR_ID" ]; then
    echo "ERROR: Characteristic conflict but could not find by name"
    echo "  Response: $BODY"
    exit 1
  fi
  echo "  Found existing characteristic ID: $CHAR_ID"
else
  echo "ERROR: Failed to create characteristic (HTTP $HTTP_CODE)"
  echo "  Response: $BODY"
  exit 1
fi

# =============================================
# Summary
# =============================================
echo ""
echo "========================================="
echo "  Characteristic Seeded Successfully"
echo "========================================="
echo "  CHAR_ID:        $CHAR_ID"
echo "  Name:           $CHAR_NAME"
echo "  Chart Type:     $CHART_TYPE"
echo "  Subgroup Size:  $SUBGROUP_SIZE"
if [ -n "$USL" ]; then echo "  USL:            $USL"; fi
if [ -n "$LSL" ]; then echo "  LSL:            $LSL"; fi
if [ -n "$TARGET" ]; then echo "  Target:         $TARGET"; fi
echo "========================================="

# Export for use in other scripts
export CHAR_ID
