#!/usr/bin/env bash
# Run the full quality gate: typecheck → lint → unit tests → build.
# Usage:  ./check.sh   (or:  npm run check)
# Stops at the first failing step and prints which one failed.
set -euo pipefail
cd "$(dirname "$0")"

step() {
  printf '\n\033[1m▶ %s\033[0m\n' "$1"
  shift
  if ! "$@"; then
    printf '\n\033[31m✖ FAILED: %s\033[0m\n' "$*"
    exit 1
  fi
}

step "Typecheck"    npm run typecheck --silent
step "Lint"         npm run lint --silent
step "Unit tests"   npm run test --silent
step "Build"        npm run build --silent

printf '\n\033[32m✓ All checks passed\033[0m\n'
