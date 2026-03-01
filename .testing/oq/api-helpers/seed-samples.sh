#!/bin/bash
# OQ Test Framework — Seed Samples
# Usage: bash .testing/oq/api-helpers/seed-samples.sh <char_id> <count> [mean] [std_dev]
#
# Submits random sample data to a characteristic using the SPC engine.
# Each sample contains subgroup_size measurements drawn from N(mean, std_dev).
#
# Arguments:
#   char_id   — Characteristic ID to submit samples to
#   count     — Number of subgroups (samples) to submit
#   mean      — Center of the normal distribution (default: 10.0)
#   std_dev   — Standard deviation of measurements (default: 0.02)
#
# The script auto-detects the characteristic's subgroup_size via GET.
#
# Environment:
#   API_URL — Base API URL (default: http://localhost:8000/api/v1)
#   TOKEN   — JWT token (auto-sourced from auth.sh if not set)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_URL="${API_URL:-http://localhost:8000/api/v1}"

# --- Arguments ---
CHAR_ID="${1:?Usage: seed-samples.sh <char_id> <count> [mean] [std_dev]}"
COUNT="${2:?Usage: seed-samples.sh <char_id> <count> [mean] [std_dev]}"
MEAN="${3:-10.0}"
STD_DEV="${4:-0.02}"

# --- Authenticate if needed ---
if [ -z "${TOKEN:-}" ]; then
  source "$SCRIPT_DIR/auth.sh"
fi

# --- Get characteristic details to determine subgroup_size ---
echo "--- Fetching characteristic $CHAR_ID details ---"

CHAR_RESPONSE=$(curl -s "$API_URL/characteristics/$CHAR_ID" \
  -H "Authorization: Bearer $TOKEN")

SUBGROUP_SIZE=$(echo "$CHAR_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('subgroup_size', 1))
" 2>/dev/null)

DATA_TYPE=$(echo "$CHAR_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data_type', 'variable'))
" 2>/dev/null)

if [ -z "$SUBGROUP_SIZE" ] || [ "$SUBGROUP_SIZE" = "" ]; then
  echo "ERROR: Could not determine subgroup_size for characteristic $CHAR_ID"
  echo "  Response: $CHAR_RESPONSE"
  exit 1
fi

echo "  Subgroup size: $SUBGROUP_SIZE"
echo "  Data type: $DATA_TYPE"
echo ""

# --- Generate all sample payloads using python3, then submit ---
echo "--- Submitting $COUNT samples (mean=$MEAN, std_dev=$STD_DEV) ---"

# Generate all samples as JSON lines using python3
SAMPLES_JSON=$(python3 -c "
import json, random
random.seed(42)  # Reproducible for OQ testing

char_id = $CHAR_ID
count = $COUNT
mean = $MEAN
std_dev = $STD_DEV
subgroup_size = $SUBGROUP_SIZE
data_type = '$DATA_TYPE'

for i in range(count):
    if data_type == 'attribute':
        # For attribute charts, generate defect counts
        # Use Poisson-like distribution for defects
        measurements = [max(0, round(random.gauss(mean, std_dev))) for _ in range(subgroup_size)]
    else:
        # For variable charts, generate normal measurements
        measurements = [round(random.gauss(mean, std_dev), 6) for _ in range(subgroup_size)]

    payload = {
        'characteristic_id': char_id,
        'measurements': measurements,
    }
    print(json.dumps(payload))
")

# Submit each sample one at a time
SUCCESS=0
FAILED=0
TOTAL_MEASUREMENTS=0

while IFS= read -r SAMPLE_PAYLOAD; do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/samples/" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$SAMPLE_PAYLOAD")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" = "201" ]; then
    SUCCESS=$((SUCCESS + 1))
    TOTAL_MEASUREMENTS=$((TOTAL_MEASUREMENTS + SUBGROUP_SIZE))
    # Progress indicator every 10 samples
    if [ $((SUCCESS % 10)) -eq 0 ]; then
      echo "  Submitted $SUCCESS / $COUNT samples..."
    fi
  else
    FAILED=$((FAILED + 1))
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "  WARN: Sample $((SUCCESS + FAILED)) failed (HTTP $HTTP_CODE): $BODY"
  fi
done <<< "$SAMPLES_JSON"

# =============================================
# Summary
# =============================================
echo ""
echo "========================================="
echo "  Sample Seeding Complete"
echo "========================================="
echo "  Characteristic:       $CHAR_ID"
echo "  Subgroups submitted:  $SUCCESS"
echo "  Subgroups failed:     $FAILED"
echo "  Total measurements:   $TOTAL_MEASUREMENTS"
echo "  Distribution:         N($MEAN, $STD_DEV)"
echo "========================================="
