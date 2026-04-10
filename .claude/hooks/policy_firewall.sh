#!/bin/bash
# .claude/hooks/policy_firewall.sh
# Wrapper: python3 실패 시에도 fail-closed (exit 2) 보장

# CLAUDE_PROJECT_DIR 미설정 시 즉시 차단
[ -n "${CLAUDE_PROJECT_DIR:-}" ] || {
    echo "SECURITY_POLICY_VIOLATION: CLAUDE_PROJECT_DIR missing" >&2
    exit 2
}

python3 "$CLAUDE_PROJECT_DIR"/.claude/hooks/policy_firewall.py
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 2 ]; then
    exit $EXIT_CODE
fi

# python3 미설치, 스크립트 오류 등 → 강제 차단
echo "SECURITY_POLICY_VIOLATION: firewall script failed (exit $EXIT_CODE)" >&2
exit 2
