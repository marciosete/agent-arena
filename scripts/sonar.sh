#!/bin/bash

# Run SonarQube analysis for one workspace, or all of them.
#
#   npm run sonar -- trader     # one project (note the "--")
#   npm run sonar:all           # every project
#   npm run sonar:full          # regenerate coverage, then every project
#
# Targets accept a project key, a folder name, or a path:
#   Punter | trader | betting | flags | pricing | simulator | contracts | bots
#
# The analysis token and host are read from infra/sonarqube/.env (gitignored)
# so you never pass them on the command line. Copy .env.example → .env and set:
#   SONAR_TOKEN=<a GLOBAL analysis token>   # scans all projects with one token
#   SONAR_HOST_URL=http://localhost:9000    # optional; this is the default
# Env vars already in your shell take precedence over the file.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../infra/sonarqube/.env"

WORKSPACES=(
  apps/punter-web
  apps/trader-ops
  services/betting
  services/flags
  services/pricing
  services/simulator
  contracts
  bots
)

usage() {
  echo "usage: npm run sonar -- <target>      (note the '--')"
  echo "       npm run sonar:all              scan every project"
  echo "       npm run sonar:full             coverage + every project"
  echo
  echo "targets: Punter trader betting flags pricing simulator contracts bots"
  echo "example: npm run sonar -- trader"
}

# Map a project key / folder name / path to a workspace directory.
resolve() {
  case "$1" in
    apps/punter-web | punter-web | punter | Punter) echo apps/punter-web ;;
    apps/trader-ops | trader-ops | trader) echo apps/trader-ops ;;
    services/betting | betting) echo services/betting ;;
    services/flags | flags) echo services/flags ;;
    services/pricing | pricing) echo services/pricing ;;
    services/simulator | simulator) echo services/simulator ;;
    contracts) echo contracts ;;
    bots) echo bots ;;
    *) return 1 ;;
  esac
}

target="${1:-}"
[ -z "${target}" ] && {
  usage
  exit 0
}

# Load .env without clobbering vars already set in the environment.
if [ -f "${ENV_FILE}" ]; then
  while IFS='=' read -r k v; do
    case "${k}" in '' | \#*) continue ;; esac
    [ -z "${!k:-}" ] && export "${k}=${v}"
  done <"${ENV_FILE}"
fi

: "${SONAR_TOKEN:?set SONAR_TOKEN (in infra/sonarqube/.env or the environment)}"
SONAR_HOST_URL="${SONAR_HOST_URL:-http://localhost:9000}"
export SONAR_TOKEN SONAR_HOST_URL

scan() {
  ws="$1"
  echo "🔎 scanning ${ws} → ${SONAR_HOST_URL}"
  (cd "${ws}" && npx --yes @sonar/scan -Dsonar.host.url="${SONAR_HOST_URL}")
}

if [ "${target}" = "all" ]; then
  failed=()
  for ws in "${WORKSPACES[@]}"; do
    scan "${ws}" || failed+=("${ws}")
  done
  if [ "${#failed[@]}" -gt 0 ]; then
    echo "❌ failed: ${failed[*]}"
    exit 1
  fi
  echo "✅ all ${#WORKSPACES[@]} workspaces scanned"
else
  ws="$(resolve "${target}")" || {
    echo "❌ unknown target: ${target}"
    echo
    usage
    exit 1
  }
  scan "${ws}"
fi
