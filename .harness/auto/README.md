# .harness/auto — Automation Watcher

Kitchen Flow 본 하네스 v3.5.1 FINAL의 11-step 릴레이(Codex↔Claude Code)를
파일 시스템 기반으로 자동화하는 워처. sjb 개입은 (a) 태스크 투입
(b) Phase 3 승인 (c) 최종 확인 세 지점으로 한정한다.

## 빠른 시작

```powershell
# 터미널 A — 워처 기동
npm run harness:start

# 터미널 B — (옵션) 확장 Claude Code UI 사용 가능.
#   단, 워처가 작업 중일 때는 파일 수정 금지. WATCHER_BUSY 파일 확인.
```

워처는 프로젝트 루트에서 실행된다. `cwd`는 자동으로 루트 고정 —
`.claude/settings.json` 자동 로드가 전제.

## 태스크 투입

```
.harness/auto/phase_0/TASK-<ID>.md
```

파일 하나 저장으로 Phase 1 자동 시작. 내용은 사용자 요청 원문 마크다운.
파일명이 곧 추적 ID(`.md` 제외).

## 승인 게이트 (Phase 3)

Phase 3 Codex 검토가 끝나면 `.harness/auto/approvals/TASK-<ID>.pending`
파일이 생성된다. 내용을 검토한 뒤:

- **승인**: 같은 폴더에 `TASK-<ID>.approved` 파일 생성 → Phase 4 진행
- **거부**: `TASK-<ID>.rejected` 생성(사유 기재) → Phase 2 재실행

24시간 초과 시 로그에 경고만 남고 자동 실패는 하지 않는다(sjb 결정 대기).

## 중단/재개

- Ctrl+C로 워처 종료. `WATCHER_BUSY`는 워처가 삭제. 비정상 종료 시 수동 삭제.
- 재시작하면 `registry.json` 기반 복구 루틴이 `*_running` 상태 태스크를
  마지막 완료 Phase부터 재개한다.
- `registry.json` 손상 시 `registry.json.bak`에서 자동 복구 시도.

## Phase 4 — 단일 vs 분할 실행

Phase 3 Codex 검토 결과에 `## 분할 실행` 섹션이 포함된다. 이 섹션의 `분할 필요: yes/no`
라벨에 따라 Phase 4 실행 모드가 자동 선택된다.

- **분할 필요: no** → 기존대로 Phase 4 단일 실행. `phase_4/<TASK_ID>.md` 한 파일 생성.
- **분할 필요: yes** → `#### step_N` 블록을 순차 실행:
  1. 각 step마다 `phase_4_execute_step.txt` 템플릿이 렌더링되어 Claude에 전달.
     이전 step 결과(`{{PREVIOUS_STEPS_CONTENT}}`)가 포함됨.
  2. 결과는 `phase_4/<TASK_ID>_step<N>.md`에 저장.
  3. 마지막 step이 아니고 `config.phase4.midReview=true`면 Codex가 중간 평가 수행:
     `phase_4/<TASK_ID>_step<N>_review.md`에 결과 저장. 판정은 `계속 / 중단 / 재작업`.
     - `계속` → 다음 step 진행
     - `재작업` → 같은 step 1회 재실행(결과 파일 덮어쓰기)
     - `중단` → 에러로 처리, Phase 5 진입하지 않음
  4. 모든 step 통과 시 통합 산출물 `phase_4/<TASK_ID>.md` 작성 → Phase 5 트리거.

분할 제어는 `config.json`의 `phase4` 키:

```json
"phase4": {
  "allowSplit": true,    // false로 두면 분할 섹션이 있어도 항상 단일 실행
  "midReview": true,     // false면 중간 평가 없이 모든 step 순차 진행
  "maxSteps": 12         // step 상한(하드 cap). 초과분은 자르고 로그 남김
}
```

Phase 3 출력 템플릿 (`prompts/phase_3_review.txt`)은 각 step에 **전제 조건 / 목표 / 산출물**
세 줄을 강제한다. 파싱은 헤더/라벨 변형에 민감하므로 템플릿 수정 시 watcher.js
`parseSplitPlan` 정규식과 정합성을 유지해야 한다.

### 분할 실행 제약

- **권장 step 수 2~6**(템플릿에 명시), **상한 `maxSteps`(기본 12)**. 둘은 다른 의미:
  권장은 지휘관(Codex)이 지나치게 쪼개지 않도록 안내, 상한은 워처가 강제로 잘라내는 방어선.
- **재작업 판정은 1회 재실행으로 종결**. 즉 step_N의 중간 평가가 "재작업"이면 Claude를 한 번
  더 호출해 결과를 덮어쓴 뒤 **재평가 없이** 다음 step으로 진행한다. 무한 루프 방지가 목적.
  재작업 판정이 반복되는 패턴이면 Phase 2 세부계획 또는 분할 계획 자체를 재검토해야 한다.
- "중단" 판정 시 통합 산출물 `<TASK_ID>.md`를 생성하지 않으므로 **Phase 5 자동 진입은 차단**된다.
  `errors/<TASK_ID>.log`와 `debug/` 덤프를 검토한 뒤 sjb가 재투입 결정.

## 디렉토리 구조

```
.harness/auto/
├─ watcher.js          # 워처 본체
├─ config.json         # 경로/타임아웃/규칙 라우팅
├─ package.json        # chokidar 의존성 (이 폴더 격리)
├─ prompts/            # 5개 Phase 템플릿
├─ plans-library/      # sjb 사전 작성 정교한 계획서 (선택)
├─ phase_0/            # 태스크 투입 지점
├─ phase_1/..phase_5/  # 각 Phase 산출물
├─ approvals/          # 승인 게이트
├─ errors/             # 실패 로그 (append)
├─ debug/              # 실제 주입 프롬프트 덤프
├─ registry.json       # 태스크 상태 레지스트리 (gitignore)
└─ WATCHER_BUSY        # 작업 중 flag (gitignore)
```

## 디버깅 순서

1. `errors/<TASK_ID>.log` — 최근 실패 스택/stderr
2. `debug/<TASK_ID>_phase<N>_<engine>.txt` — 실제 주입된 프롬프트 전문
3. `debug/_watcher.log` — 워처 이벤트 타임라인
4. `registry.json` — 각 태스크의 마지막 상태
5. Phase 3 승인률 낮으면 `prompts/phase_2_plan.txt` 재튜닝 신호

## Claude Code 확장 프로그램과의 공존 규칙

워처가 작업 중일 때 `.harness/auto/WATCHER_BUSY` 파일이 존재한다.

- **확장 Claude Code 사용 시**: 파일을 쓸 수 있는 요청 전에 이 파일 존재 확인.
  존재하면 수정 거부하거나 워처 정지 후 재시도.
- `.harness/auto/` 내부 파일은 **어떤 경우에도 확장 Claude가 직접 수정 금지**.
  이 경로는 워처 전용.
- 확장 Claude에게 읽기 전용 작업만 시킬 때는 `--permission-mode plan` 사용 권장.

## 권한/보안

- Claude 호출은 `--permission-mode acceptEdits`까지. `bypassPermissions` 금지.
- `.claude/hooks/policy_firewall.py`의 정책을 우회하지 않음.
- 기존 하네스 12개 파일(`CLAUDE.md`, `AGENTS.md`, `.claude/**`, `docs/rules/**`,
  `docs/worker/**`, `docs/commander/**`)은 워처가 **읽기만** 한다. 예외는
  Phase 5 종료 후 `docs/worker/LEARNINGS.md`와 `docs/commander/LEARNINGS.md`에
  학습 한 줄 append뿐이며, 이는 `config.json`에 명시된 경로에 한한다.

## CLI 전제 조건

- `codex` (v0.122+) 와 `claude` CLI가 PATH에 있고 인증되어 있어야 한다.
- Windows: 바이너리 이름에 자동으로 `.cmd` 접미사가 붙음.
- 인증 확인: 터미널에서 `codex exec "ping"`, `claude -p "ping"` 각 1회 성공 필요.

## 템플릿 변수 규약

각 `prompts/phase_*.txt`에서 사용 가능한 변수:

- `{{TASK_ID}}` — 추적 ID
- `{{ORIGINAL_REQUEST}}` — `phase_0/<TASK_ID>.md` 원문
- `{{PHASE_1_CONTENT}}`..`{{PHASE_5_CONTENT}}` — 각 Phase 산출물
- `{{RULES_FILES}}` — `config.json.rulesRouting.always` 파일들 연결 내용
- `{{LEARNINGS}}` — 엔진이 Codex면 commander, Claude면 worker 학습 파일
- `{{MISTAKES}}` — 동일 규칙
- `{{BUILD_TEST_RESULT}}` — Phase 5에서만 주입 (`npm run build`, `npm test` 결과)

## 알려진 한계

- 동시 처리 1건(직렬 큐). 병렬은 v2에서 git worktree 기반 설계 필요.
- 토큰/비용 자동 추적 없음. stdout의 `tokens used` 문자열만 로그.
- LAST_SESSION.md 자동 갱신은 하지 않음 — 세션 종료 시 `/session-end` 수동 실행.
- CLAUDE.md `--permission-mode acceptEdits`로 실행되므로 파일 수정 가능.
  정책 방화벽은 `.claude/hooks/policy_firewall.py`가 담당.
