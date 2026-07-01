#!/usr/bin/env bash
# Quality gate hook. Wired to SubagentStop for implementer/debugger agents so a
# subagent cannot report "done" while the build is broken. Exit code 2 blocks the
# stop and feeds stderr back to the agent to fix.
set -uo pipefail

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || cd "$(git rev-parse --show-toplevel)" || exit 0

fail=0

echo "[gate] typecheck…" >&2
if ! npm run --silent typecheck >/tmp/openshare-gate-tsc.log 2>&1; then
  echo "[gate] FAIL typecheck:" >&2
  tail -n 40 /tmp/openshare-gate-tsc.log >&2
  fail=1
fi

echo "[gate] unit tests…" >&2
if ! npm run --silent test >/tmp/openshare-gate-test.log 2>&1; then
  echo "[gate] FAIL tests:" >&2
  tail -n 40 /tmp/openshare-gate-test.log >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "[gate] blocking stop: fix the failures above before reporting done." >&2
  exit 2
fi

echo "[gate] PASS" >&2
exit 0
