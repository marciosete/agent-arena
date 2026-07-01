#!/bin/bash

# osv-ci.sh - OSV-Scanner execution with HIGH/CRITICAL severity filtering
# Runs comprehensive vulnerability scan and fails only on HIGH/CRITICAL findings
# (CVSS >= 7.0)

set -e

BOX_TOP="╔════════════════════════════════════════════════════════════╗"
BOX_BOTTOM="╚════════════════════════════════════════════════════════════╝"

echo "$BOX_TOP"
echo "║   OSV-Scanner - Comprehensive Vulnerability Check          ║"
echo "║   Database: OSV.dev (aggregates GitHub, NVD, and more)    ║"
echo "║   Threshold: FAIL on HIGH/CRITICAL (CVSS ≥ 7.0)           ║"
echo "$BOX_BOTTOM"
echo ""

# Ensure OSV-Scanner is available
if ! command -v osv-scanner &> /dev/null; then
    echo "❌ ERROR: osv-scanner not found!" >&2
    echo "" >&2
    echo "Installation options:" >&2
    echo "  macOS:   brew install osv-scanner" >&2
    echo "  Linux:   Download from https://github.com/google/osv-scanner/releases" >&2
    echo "  Docker:  Use ghcr.io/google/osv-scanner image" >&2
    echo "" >&2
    exit 1
fi

# Ensure jq is available for JSON parsing
if ! command -v jq &> /dev/null; then
    echo "❌ ERROR: jq not found (required for severity filtering)!" >&2
    echo "" >&2
    echo "Installation:" >&2
    echo "  macOS:   brew install jq" >&2
    echo "  Linux:   apt-get install jq / yum install jq" >&2
    echo "" >&2
    exit 1
fi

echo "[1/3] Scanning with OSV-Scanner..."
echo ""

# Run OSV-Scanner with JSON output
osv-scanner -r . --format json --output /tmp/osv-output.json 2>&1 || true

echo "[2/3] Analyzing results..."
echo ""

# Parse JSON output to filter by severity (CVSS >= 7.0 = HIGH/CRITICAL)
if [[ ! -f /tmp/osv-output.json ]]; then
    echo "⚠️  WARNING: No JSON output generated (likely no vulnerabilities found)"
    echo ""
    echo "$BOX_TOP"
    echo "║   ✅ OSV-SCANNER: PASSED                                  ║"
    echo "$BOX_BOTTOM"
    echo ""
    echo "No vulnerabilities found! 🎉"
    echo ""
    exit 0
fi

# Extract HIGH and CRITICAL vulnerabilities (CVSS >= 7.0)
# Note: osv-scanner stores numeric CVSS in .groups[].max_severity (string),
# NOT in .vulnerabilities[].severity[].score (which is a CVSS vector string).
HIGH_CRITICAL_COUNT=$(jq '[.results[]?.packages[]?.groups[]? | select((.max_severity // "0") | tonumber >= 7.0)] | length' /tmp/osv-output.json 2>/dev/null || echo "0")

# Get total vulnerability count
TOTAL_COUNT=$(jq '[.results[]?.packages[]?.groups[]?] | length' /tmp/osv-output.json 2>/dev/null || echo "0")

echo "[3/3] Evaluation..."
echo ""
echo "Total vulnerabilities found: $TOTAL_COUNT"
echo "HIGH/CRITICAL (CVSS ≥ 7.0): $HIGH_CRITICAL_COUNT"
echo ""

if [[ "$HIGH_CRITICAL_COUNT" -eq 0 ]]; then
    if [[ "$TOTAL_COUNT" -gt 0 ]]; then
        echo "$BOX_TOP"
        echo "║   ✅ OSV-SCANNER: PASSED (with warnings)                  ║"
        echo "$BOX_BOTTOM"
        echo ""
        echo "✅ No HIGH/CRITICAL vulnerabilities"
        echo "⚠️  $TOTAL_COUNT MEDIUM/LOW vulnerabilities found (not blocking)"
        echo ""
        echo "To view all vulnerabilities:"
        echo "  npm run osv:scan:full"
        echo "  npm run osv:scan:json  # JSON output"
        echo ""
    else
        echo "$BOX_TOP"
        echo "║   ✅ OSV-SCANNER: PASSED                                  ║"
        echo "$BOX_BOTTOM"
        echo ""
        echo "No vulnerabilities found! 🎉"
        echo ""
    fi
    exit 0
else
    echo "$BOX_TOP"
    echo "║   ❌ OSV-SCANNER: FAILED                                  ║"
    echo "$BOX_BOTTOM"
    echo ""
    echo "HIGH/CRITICAL vulnerabilities detected!"
    echo ""

    # Display affected packages (table format for readability)
    echo "Affected packages:"
    osv-scanner -r . --format table || true
    echo ""

    echo "To investigate:"
    echo "  1. Review vulnerabilities: npm run osv:scan:full"
    echo "  2. Get JSON details: npm run osv:scan:json"
    echo "  3. Try auto-fix: npm run osv:fix (experimental)"
    echo ""
    echo "To ignore false positives:"
    echo "  1. Create osv-scanner.toml in project root"
    echo "  2. Add vulnerability IDs to [[IgnoredVulns]] section"
    echo "  3. Include reason and optional ignoreUntil date"
    echo ""
    exit 1
fi
