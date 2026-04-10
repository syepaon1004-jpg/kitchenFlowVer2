#!/usr/bin/env python3
"""
KitchenFlow PreToolUse Policy Firewall
- Read/Edit/MultiEdit/Write: 보호 경로 접근 차단
- Bash: 보호 경로 참조 명령만 차단 (일반 명령은 통과)
- Glob/Grep: 보호 경로를 대상으로 하는 조회 차단
- fail-closed: 예외 발생 시 exit 2
"""
import json
import shlex
import sys
from pathlib import Path

# --- 보호 대상 정의 ---

PROTECTED_EXACT = ("AGENTS.md", "CLAUDE.md")

PROTECTED_DIRS = (".harness", "docs/commander", "docs/rules", ".claude")

# Bash 명령 문자열/직렬화된 JSON에서 검색할 마커
PROTECTED_MARKERS = (
    "AGENTS.md", "CLAUDE.md",
    ".harness/", ".harness\\", ".harness",
    "docs/commander/", "docs/commander\\",
    "docs/rules/", "docs/rules\\",
    ".claude/", ".claude\\", ".claude",
)

# 보호 디렉토리 basename (심볼릭 없는 bare path 검사용)
PROTECTED_DIR_BASENAMES = {".harness", ".claude"}


# --- 유틸리티 ---

def block(msg: str) -> None:
    """차단: stderr 출력 + exit 2"""
    print(f"SECURITY_POLICY_VIOLATION: {msg}", file=sys.stderr)
    sys.exit(2)


def norm(cwd: Path, raw: str) -> Path:
    """경로 정규화 (심볼릭 링크 해소)"""
    p = Path(raw)
    if not p.is_absolute():
        p = cwd / p
    return p.resolve(strict=False)


def is_protected(cwd: Path, raw: str) -> bool:
    """정규화된 경로가 보호 대상인지 검사"""
    p = norm(cwd, raw)

    # 정확한 파일 매칭
    for name in PROTECTED_EXACT:
        if p == norm(cwd, name):
            return True

    # 보호 디렉토리 하위 매칭
    for d in PROTECTED_DIRS:
        dp = norm(cwd, d)
        try:
            p.relative_to(dp)
            return True
        except ValueError:
            pass

    return False


def is_agents_exception(cwd: Path, raw: str) -> bool:
    """Read 전용: .claude/agents/ 하위 파일은 서브에이전트 로딩을 위해 예외 허용"""
    p = norm(cwd, raw)
    agents_dir = norm(cwd, ".claude/agents")
    try:
        p.relative_to(agents_dir)
        return True
    except ValueError:
        return False


# --- 도구별 검사 ---

def check_file_tool(tool: str, cwd: Path, tool_input: dict) -> None:
    """Read/Edit/MultiEdit/Write: 보호 경로 접근 차단"""
    paths: list[str] = []

    # 1) 단일 file_path (Edit/Write/Read)
    fp = tool_input.get("file_path")
    if isinstance(fp, str):
        paths.append(fp)

    # 2) 배열 구조 탐색 (MultiEdit 방어적 파싱)
    for key in ("edits", "changes", "operations", "files"):
        v = tool_input.get(key)
        if isinstance(v, list):
            for item in v:
                if isinstance(item, dict) and isinstance(item.get("file_path"), str):
                    paths.append(item["file_path"])

    # 경로를 찾았으면 개별 검사
    if paths:
        for p in paths:
            if is_protected(cwd, p):
                # Read 전용 예외: .claude/agents/ 하위는 허용
                if tool == "Read" and is_agents_exception(cwd, p):
                    continue
                block(f"{tool} blocked: protected path {p}")
        return  # 모두 비보호 (또는 Read 예외) → 통과

    # 3) 경로를 못 찾았으면 직렬화 fallback (MultiEdit 스키마 불확실)
    payload = json.dumps(tool_input, ensure_ascii=False)
    for marker in PROTECTED_MARKERS:
        if marker in payload:
            block(f"{tool} payload references protected marker: {marker}")


def check_bash(cwd: Path, cmd: str) -> None:
    """Bash: 보호 경로 참조 명령만 차단. 일반 명령은 통과."""

    # 1) 문자열 레벨: 보호 마커 포함 여부
    for marker in PROTECTED_MARKERS:
        if marker in cmd:
            block(f"Bash references protected marker '{marker}'")

    # 2) 토큰 레벨: 경로 정규화 후 보호 디렉토리 하위 검사
    try:
        tokens = shlex.split(cmd, posix=True)
    except ValueError:
        # shlex 파싱 실패 → fail-closed
        block(f"Bash command parse failed (fail-closed): {cmd[:80]}")

    for t in tokens:
        if t.startswith("-"):
            continue  # 옵션 플래그 스킵
        # bare basename 검사 (예: "ls .harness", "ls .claude")
        if t in PROTECTED_DIR_BASENAMES or t in PROTECTED_EXACT:
            block(f"Bash references protected path: {t}")
        # 모든 비플래그 토큰에 대해 경로 정규화 후 보호 대상 검사
        if is_protected(cwd, t):
            block(f"Bash references protected path: {t}")


def check_read_like_tool(tool: str, cwd: Path, tool_input: dict) -> None:
    """Glob/Grep: 보호 경로를 대상으로 하는 조회 차단."""

    # 1) 경로 필드 (path, glob) → 마커 + 경로 정규화 검사
    for key in ("path", "glob"):
        val = tool_input.get(key)
        if isinstance(val, str):
            if val in PROTECTED_DIR_BASENAMES or val in PROTECTED_EXACT:
                block(f"{tool} references protected path in {key}: {val}")
            for marker in PROTECTED_MARKERS:
                if marker in val:
                    block(f"{tool} references protected marker '{marker}' in {key}")
            if is_protected(cwd, val):
                block(f"{tool} references protected path in {key}: {val}")

    # 2) pattern 필드 → 도구별 분리 처리
    pattern = tool_input.get("pattern")
    if isinstance(pattern, str):
        if tool == "Glob":
            # Glob의 pattern은 파일 경로 글롭 → 경로성 입력으로 검사
            if pattern in PROTECTED_DIR_BASENAMES or pattern in PROTECTED_EXACT:
                block(f"Glob references protected path in pattern: {pattern}")
            for marker in PROTECTED_MARKERS:
                if marker in pattern:
                    block(f"Glob pattern references protected marker '{marker}'")
            # 모든 literal 세그먼트를 추출하여 path와 합성 검사
            base = tool_input.get("path", "") or ""
            segments = [
                s for s in pattern.replace("\\", "/").split("/")
                if s and "*" not in s and "?" not in s and "[" not in s and "{" not in s
            ]
            for seg in segments:
                # base + segment 합성
                if base:
                    candidate = f"{base}/{seg}"
                else:
                    candidate = seg
                if is_protected(cwd, candidate):
                    block(
                        f"Glob pattern segment resolves to protected path: {candidate} "
                        f"(from path='{base}', pattern='{pattern}')"
                    )
                # segment가 보호 대상 basename이면 직접 차단
                if seg in PROTECTED_DIR_BASENAMES or seg in PROTECTED_EXACT:
                    block(f"Glob pattern contains protected name: {seg}")
        else:
            # Grep의 pattern은 내용 검색 regex → 마커 문자열 검사만
            for marker in PROTECTED_MARKERS:
                if marker in pattern:
                    block(f"{tool} pattern references protected marker '{marker}'")


# --- 메인 ---

def main() -> None:
    try:
        data = json.load(sys.stdin)
        cwd = Path(data.get("cwd", ".")).resolve(strict=False)
        tool = data.get("tool_name", "")
        ti = data.get("tool_input", {}) or {}

        if tool in {"Read", "Edit", "MultiEdit", "Write"}:
            check_file_tool(tool, cwd, ti)
        elif tool == "Bash":
            check_bash(cwd, str(ti.get("command", "")))
        elif tool in {"Glob", "Grep"}:
            check_read_like_tool(tool, cwd, ti)
        # 검사 통과 → 정상 종료
        sys.exit(0)

    except SystemExit:
        raise
    except Exception as e:
        # 파싱/내부 오류 → fail-closed
        block(f"firewall internal error: {e}")


if __name__ == "__main__":
    main()
