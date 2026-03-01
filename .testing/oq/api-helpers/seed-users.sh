#!/bin/bash
# OQ Test Framework — Seed Test Users
# Usage: bash .testing/oq/api-helpers/seed-users.sh
#
# Creates 4 OQ test users with specific roles:
#   oq-operator   / OqTest123! → operator
#   oq-supervisor / OqTest123! → supervisor
#   oq-engineer   / OqTest123! → engineer
#   oq-admin      / OqTest123! → admin
#
# Each user is assigned their role at the first active plant.
# Handles 409 Conflict (user already exists) gracefully.
#
# Environment:
#   API_URL — Base API URL (default: http://localhost:8000/api/v1)
#   TOKEN   — JWT token (auto-sourced from auth.sh if not set)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_URL="${API_URL:-http://localhost:8000/api/v1}"

# --- Authenticate as admin ---
if [ -z "${TOKEN:-}" ]; then
  source "$SCRIPT_DIR/auth.sh"
fi

# --- Get first active plant ID ---
echo "--- Finding active plant ---"

PLANTS_RESPONSE=$(curl -s "$API_URL/plants/?active_only=true" \
  -H "Authorization: Bearer $TOKEN")

PLANT_ID=$(echo "$PLANTS_RESPONSE" | python3 -c "
import sys, json
plants = json.load(sys.stdin)
if plants:
    print(plants[0]['id'])
else:
    print('')
" 2>/dev/null)

if [ -z "$PLANT_ID" ]; then
  echo "ERROR: No active plants found. Create a plant first."
  exit 1
fi

echo "  Using plant ID: $PLANT_ID"
echo ""

# --- Helper: create user and assign role ---
# Returns 0 on success, 1 on failure
create_user_with_role() {
  local username="$1"
  local password="$2"
  local email="$3"
  local role="$4"
  local plant_id="$5"

  echo "--- Creating user: $username (role=$role) ---"

  # Step 1: Create the user
  CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/users/" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"email\":\"$email\",\"password\":\"$password\"}")

  CREATE_HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
  CREATE_BODY=$(echo "$CREATE_RESPONSE" | sed '$d')

  if [ "$CREATE_HTTP_CODE" = "201" ]; then
    USER_ID=$(echo "$CREATE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
    echo "  Created user ID: $USER_ID"
  elif [ "$CREATE_HTTP_CODE" = "409" ]; then
    echo "  User already exists, looking up..."
    # Find user by listing all users and filtering by username
    USER_ID=$(curl -s "$API_URL/users/?search=$username" \
      -H "Authorization: Bearer $TOKEN" | \
      python3 -c "
import sys, json
users = json.load(sys.stdin)
for u in users:
    if u['username'] == '$username':
        print(u['id'])
        sys.exit(0)
print('')
" 2>/dev/null)

    if [ -z "$USER_ID" ]; then
      echo "  ERROR: User exists (409) but could not find by username"
      return 1
    fi
    echo "  Found existing user ID: $USER_ID"
  else
    echo "  ERROR: Failed to create user (HTTP $CREATE_HTTP_CODE)"
    echo "  Response: $CREATE_BODY"
    return 1
  fi

  # Step 2: Assign plant role
  echo "  Assigning role '$role' at plant $plant_id..."

  ROLE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/users/$USER_ID/roles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"plant_id\":$plant_id,\"role\":\"$role\"}")

  ROLE_HTTP_CODE=$(echo "$ROLE_RESPONSE" | tail -n1)
  ROLE_BODY=$(echo "$ROLE_RESPONSE" | sed '$d')

  if [ "$ROLE_HTTP_CODE" = "200" ]; then
    echo "  Role assigned successfully"
  else
    echo "  WARN: Role assignment returned HTTP $ROLE_HTTP_CODE (may already be assigned)"
    # Role assignment via POST is an upsert — it updates if exists.
    # Non-200 is unusual but not necessarily fatal.
  fi

  echo ""
  return 0
}

# =============================================
# Create all 4 OQ test users
# =============================================

PASSWORD="OqTest123!"
CREATED=0
FAILED=0

if create_user_with_role "oq-operator" "$PASSWORD" "oq-operator@test.local" "operator" "$PLANT_ID"; then
  CREATED=$((CREATED + 1))
else
  FAILED=$((FAILED + 1))
fi

if create_user_with_role "oq-supervisor" "$PASSWORD" "oq-supervisor@test.local" "supervisor" "$PLANT_ID"; then
  CREATED=$((CREATED + 1))
else
  FAILED=$((FAILED + 1))
fi

if create_user_with_role "oq-engineer" "$PASSWORD" "oq-engineer@test.local" "engineer" "$PLANT_ID"; then
  CREATED=$((CREATED + 1))
else
  FAILED=$((FAILED + 1))
fi

if create_user_with_role "oq-admin" "$PASSWORD" "oq-admin@test.local" "admin" "$PLANT_ID"; then
  CREATED=$((CREATED + 1))
else
  FAILED=$((FAILED + 1))
fi

# =============================================
# Summary
# =============================================
echo "========================================="
echo "  User Seeding Complete"
echo "========================================="
echo "  Plant ID:  $PLANT_ID"
echo "  Created:   $CREATED users"
echo "  Failed:    $FAILED users"
echo ""
echo "  Credentials:"
echo "    oq-operator   / $PASSWORD  (operator)"
echo "    oq-supervisor / $PASSWORD  (supervisor)"
echo "    oq-engineer   / $PASSWORD  (engineer)"
echo "    oq-admin      / $PASSWORD  (admin)"
echo "========================================="
