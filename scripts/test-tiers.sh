#!/bin/bash

# Test script for tiered pricing API access
# Usage: ./scripts/test-tiers.sh [BASE_URL]

set -e

# Configuration
BASE_URL="${1:-http://localhost:5000}"
TEST_EMAIL="tier_test_user@example.com"

echo "🚀 Starting Tiered Pricing Tests..."
echo "Base URL: $BASE_URL"
echo ""

# Check required environment variables
if [ -z "$STRIPE_SECRET_KEY" ]; then
  echo "⚠️  Warning: STRIPE_SECRET_KEY not set (webhook test will be skipped)"
fi

if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
  echo "⚠️  Warning: STRIPE_WEBHOOK_SECRET not set (webhook test will be skipped)"
fi

# ----------------------------------------------------------------
# TEST CASE A: FREE TIER - API ACCESS BLOCKED
# ----------------------------------------------------------------
echo ""
echo "--- Test A: Free Tier - API Access Should Be Blocked ---"

# Try to access an Enterprise-only API endpoint without auth
RES_FREE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/embedded/sign-url" \
  -H "Content-Type: application/json" \
  -d '{"template_id": "test", "signer_email": "test@test.com", "signer_name": "Test"}')

HTTP_CODE=$(echo "$RES_FREE" | tail -n1)
BODY=$(echo "$RES_FREE" | head -n -1)

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "✅ API Blocked correctly (HTTP $HTTP_CODE)"
  echo "   Response: $BODY"
else
  echo "❌ FAILED: Expected 401 or 403, got HTTP $HTTP_CODE"
  echo "   Response: $BODY"
fi

# ----------------------------------------------------------------
# TEST CASE B: BULK SEND - ENTERPRISE FEATURE GATE
# ----------------------------------------------------------------
echo ""
echo "--- Test B: Bulk Send - Enterprise Feature Gate ---"

# Try to access bulk send endpoint without Enterprise subscription
RES_BULK=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/bulk-batches" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RES_BULK" | tail -n1)
BODY=$(echo "$RES_BULK" | head -n -1)

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Bulk Send blocked for unauthenticated users (HTTP 401)"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "✅ Bulk Send blocked for non-Enterprise users (HTTP 403)"
  echo "   Response: $BODY"
else
  echo "ℹ️  Got HTTP $HTTP_CODE - may need authentication to test properly"
  echo "   Response: $BODY"
fi

# ----------------------------------------------------------------
# TEST CASE C: DATA RESIDENCY - ENTERPRISE FEATURE GATE
# ----------------------------------------------------------------
echo ""
echo "--- Test C: Data Residency - Enterprise Feature Gate ---"

# GET endpoint is available to authenticated users (returns current settings)
RES_RESIDENCY_GET=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/user/data-region" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RES_RESIDENCY_GET" | tail -n1)

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Data Residency GET blocked for unauthenticated users (HTTP 401)"
else
  echo "ℹ️  Data Residency GET returned HTTP $HTTP_CODE"
fi

# PATCH endpoint requires Enterprise tier (this is the protected endpoint)
RES_RESIDENCY_PATCH=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/api/user/data-region" \
  -H "Content-Type: application/json" \
  -d '{"dataRegion": "US"}')

HTTP_CODE=$(echo "$RES_RESIDENCY_PATCH" | tail -n1)
BODY=$(echo "$RES_RESIDENCY_PATCH" | head -n -1)

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Data Residency PATCH blocked for unauthenticated users (HTTP 401)"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "✅ Data Residency PATCH blocked for non-Enterprise users (HTTP 403)"
  echo "   Response: $BODY"
else
  echo "ℹ️  Data Residency PATCH returned HTTP $HTTP_CODE"
  echo "   Response: $BODY"
fi

# ----------------------------------------------------------------
# TEST CASE D: HEALTH CHECK
# ----------------------------------------------------------------
echo ""
echo "--- Test D: Health Check ---"

RES_HEALTH=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/auth/user")

HTTP_CODE=$(echo "$RES_HEALTH" | tail -n1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Server is responding (HTTP $HTTP_CODE)"
else
  echo "❌ Server may be down (HTTP $HTTP_CODE)"
fi

# ----------------------------------------------------------------
# TEST CASE E: WEBHOOK SIGNATURE TEST (if secrets available)
# ----------------------------------------------------------------
if [ -n "$STRIPE_SECRET_KEY" ] && [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
  echo ""
  echo "--- Test E: Webhook Endpoint ---"
  
  # Test that webhook endpoint exists and rejects invalid signatures
  RES_WEBHOOK=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/webhooks/stripe" \
    -H "Content-Type: application/json" \
    -H "Stripe-Signature: invalid_signature" \
    -d '{"type": "test"}')
  
  HTTP_CODE=$(echo "$RES_WEBHOOK" | tail -n1)
  
  if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Webhook rejects invalid signatures (HTTP $HTTP_CODE)"
  else
    echo "ℹ️  Webhook returned HTTP $HTTP_CODE"
  fi
fi

# ----------------------------------------------------------------
# INTERACTIVE TESTS (with cookie)
# ----------------------------------------------------------------
echo ""
echo "--- Interactive Tests (requires login) ---"
echo ""
echo "To test with authentication, first login and get your session cookie:"
echo ""
echo "  1. Login via browser and copy your 'connect.sid' cookie value"
echo "  2. Run tests with cookie:"
echo ""
echo "     COOKIE='connect.sid=your_session_id' ./scripts/test-tiers.sh"
echo ""

if [ -n "$COOKIE" ]; then
  echo "Testing with provided cookie..."
  echo ""
  
  # Get current user info
  RES_USER=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/auth/user" \
    -H "Cookie: $COOKIE")
  
  HTTP_CODE=$(echo "$RES_USER" | tail -n1)
  BODY=$(echo "$RES_USER" | head -n -1)
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Authenticated as:"
    echo "$BODY" | jq -r '. | "   Email: \(.email)\n   Account Type: \(.accountType)"' 2>/dev/null || echo "   $BODY"
    
    ACCOUNT_TYPE=$(echo "$BODY" | jq -r '.accountType' 2>/dev/null)
    
    # Test feature access based on account type
    echo ""
    echo "Testing feature access for account type: $ACCOUNT_TYPE"
    
    # Test bulk send access
    RES_BULK_AUTH=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/bulk-batches" \
      -H "Cookie: $COOKIE")
    
    HTTP_CODE=$(echo "$RES_BULK_AUTH" | tail -n1)
    
    if [ "$ACCOUNT_TYPE" = "enterprise" ]; then
      if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Bulk Send: Accessible for Enterprise user"
      else
        echo "❌ Bulk Send: Should be accessible for Enterprise (got HTTP $HTTP_CODE)"
      fi
    else
      if [ "$HTTP_CODE" = "403" ]; then
        echo "✅ Bulk Send: Correctly blocked for $ACCOUNT_TYPE user"
      elif [ "$HTTP_CODE" = "200" ]; then
        echo "❌ Bulk Send: Should be blocked for $ACCOUNT_TYPE user!"
      else
        echo "ℹ️  Bulk Send: HTTP $HTTP_CODE"
      fi
    fi
    
  else
    echo "❌ Authentication failed (HTTP $HTTP_CODE)"
    echo "   Make sure your cookie is valid"
  fi
fi

echo ""
echo "🏁 Tests Complete."
