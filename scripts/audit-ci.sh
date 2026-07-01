#!/bin/bash

# audit-ci.sh - Security audit for CI/CD pipeline
# Fails the build if critical or high vulnerabilities are found in production dependencies

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Security Audit - Dependency Vulnerability Check         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check production dependencies for high/critical vulnerabilities
echo "[1/3] Checking production dependencies for vulnerabilities..."
PROD_AUDIT=$(npm audit --production --json 2>/dev/null || true)

# Parse the audit results
PROD_CRITICAL=$(echo "$PROD_AUDIT" | jq '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo 0)
PROD_HIGH=$(echo "$PROD_AUDIT" | jq '.metadata.vulnerabilities.high // 0' 2>/dev/null || echo 0)
PROD_MODERATE=$(echo "$PROD_AUDIT" | jq '.metadata.vulnerabilities.moderate // 0' 2>/dev/null || echo 0)
PROD_LOW=$(echo "$PROD_AUDIT" | jq '.metadata.vulnerabilities.low // 0' 2>/dev/null || echo 0)

echo "  Production Dependencies:"
echo "    Critical: $PROD_CRITICAL"
echo "    High:     $PROD_HIGH"
echo "    Moderate: $PROD_MODERATE"
echo "    Low:      $PROD_LOW"
echo ""

# Check all dependencies (including dev)
echo "[2/3] Checking all dependencies (including dev)..."
ALL_AUDIT=$(npm audit --json 2>/dev/null || true)

ALL_CRITICAL=$(echo "$ALL_AUDIT" | jq '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo 0)
ALL_HIGH=$(echo "$ALL_AUDIT" | jq '.metadata.vulnerabilities.high // 0' 2>/dev/null || echo 0)
ALL_MODERATE=$(echo "$ALL_AUDIT" | jq '.metadata.vulnerabilities.moderate // 0' 2>/dev/null || echo 0)
ALL_LOW=$(echo "$ALL_AUDIT" | jq '.metadata.vulnerabilities.low // 0' 2>/dev/null || echo 0)

echo "  All Dependencies (including dev):"
echo "    Critical: $ALL_CRITICAL"
echo "    High:     $ALL_HIGH"
echo "    Moderate: $ALL_MODERATE"
echo "    Low:      $ALL_LOW"
echo ""

# Determine pass/fail based on production vulnerabilities
echo "[3/3] Evaluating security posture..."
echo ""

# CI/CD Thresholds
THRESHOLD_CRITICAL=0  # No critical vulnerabilities allowed in production
THRESHOLD_HIGH=0      # No high vulnerabilities allowed in production
THRESHOLD_MODERATE=5  # Allow up to 5 moderate vulnerabilities in production

# Generate detailed report
if [ "$PROD_CRITICAL" -gt "$THRESHOLD_CRITICAL" ] || [ "$PROD_HIGH" -gt "$THRESHOLD_HIGH" ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ SECURITY GATE: FAILED                                ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Critical/High vulnerabilities found in production dependencies!"
    echo ""
    echo "To fix:"
    echo "  1. Run: npm audit fix --production"
    echo "  2. If that doesn't work, manually update affected packages"
    echo "  3. Review: npm audit --production"
    echo ""

    # Show vulnerable packages
    echo "Vulnerable packages:"
    npm audit --production 2>/dev/null | grep -E "Critical|High" | head -10 || true
    echo ""

    exit 1
elif [ "$PROD_MODERATE" -gt "$THRESHOLD_MODERATE" ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ⚠️  SECURITY GATE: WARNING                               ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Too many moderate vulnerabilities in production ($PROD_MODERATE > $THRESHOLD_MODERATE)"
    echo "Continuing with warning - please address these soon."
    echo ""
else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ✅ SECURITY GATE: PASSED                                ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    if [ "$PROD_MODERATE" -gt 0 ] || [ "$PROD_LOW" -gt 0 ]; then
        echo "Note: Found $PROD_MODERATE moderate and $PROD_LOW low severity vulnerabilities"
        echo "These are within acceptable thresholds."
    else
        echo "No vulnerabilities found in production dependencies! 🎉"
    fi
fi

# Always show dev dependency issues as info (non-blocking)
DEV_ISSUES=$((ALL_CRITICAL + ALL_HIGH - PROD_CRITICAL - PROD_HIGH))
if [ "$DEV_ISSUES" -gt 0 ]; then
    echo ""
    echo "ℹ️  Note: $DEV_ISSUES critical/high vulnerabilities exist in dev dependencies"
    echo "   These don't affect production but should be addressed."
fi

echo ""
echo "For detailed report, run: npm audit"
echo ""
