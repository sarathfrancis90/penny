#!/bin/bash
# Penny Mobile — Full Test Suite
# Run this after each phase to ensure nothing is broken.
#
# Usage:
#   ./scripts/run_tests.sh          # Run all tests
#   ./scripts/run_tests.sh unit     # Run only unit tests
#   ./scripts/run_tests.sh e2e      # Run only integration/E2E tests

set -e
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

run_unit() {
  echo -e "${BLUE}═══ Unit Tests ═══${NC}"
  flutter test test/ --reporter expanded
  echo -e "${GREEN}✓ Unit tests passed${NC}\n"
}

run_e2e() {
  echo -e "${BLUE}═══ Integration / E2E Tests ═══${NC}"
  flutter test integration_test/ -d booted --reporter expanded
  echo -e "${GREEN}✓ Integration tests passed${NC}\n"
}

case "${1:-all}" in
  unit)    run_unit ;;
  e2e)     run_e2e ;;
  all)
    echo -e "${BLUE}╔═══════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Penny Mobile — Full Test Suite  ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════╝${NC}\n"
    run_unit
    run_e2e
    echo -e "${GREEN}╔═══════════════════════════════════╗${NC}"
    echo -e "${GREEN}║       All tests passed!           ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════╝${NC}"
    ;;
  *)
    echo "Usage: $0 [unit|e2e|all]"
    exit 1
    ;;
esac
