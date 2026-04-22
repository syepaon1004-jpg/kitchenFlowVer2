# KitchenFlow — 실수 기록

> 반복하지 않기 위한 실수 로그.
> 3회 이상 반복 시 CLAUDE.md 규칙 승격 대상.

## 포맷
```
## YYYY-MM-DD — 실수 한 줄 요약
**상황**: 어떤 작업 중이었는지
**잘못한 것**: 구체적으로 무엇을 잘못했는지
**올바른 방법**: 앞으로 어떻게 해야 하는지
**반복 횟수**: N회
```

---

## 2026-04-07 — 지휘관(메인)이 서브에이전트 위임 없이 코드 직접 수정
**상황**: GridEditor 박스 종횡비를 in-game 서랍판과 일치시키는 작업 (4개 파일 수정).
**잘못한 것**: CLAUDE.md "🎯 작업 구조 — 지휘관 + 서브에이전트" 규칙은 모든 코드 수정을 서브에이전트에 위임하라고 명시하지만, 메인이 4개 파일을 직접 Edit 도구로 수정함.
**원인**: 서브에이전트(general-purpose) 2회 위임 모두 시스템 차원의 plan mode가 강제 활성화되어 Edit/Write 도구 호출이 차단됨. sub-agent의 시스템 메시지가 "plan mode supersede"라고 명시해 명시적 우회 지시도 무효. 환경 차원의 차단이라 sub-agent 위임 경로 자체가 동작 불능.
**완화 조치**: 사용자에게 상황 보고 후 직접 수정 승인(B 옵션)을 받은 뒤 진행. tsc + build 모두 통과 확인.
**올바른 방법 (다음 세션)**: 
  1. sub-agent의 plan mode 강제 활성 원인 파악 필요 (settings.json / hooks / 환경 변수 점검).
  2. 원인 해결 전까지는 사용자 승인을 받은 경우에 한해 직접 수정을 허용하되, 매번 본 파일에 기록.
  3. CLAUDE.md "🎯 작업 구조" 섹션에 "sub-agent 환경이 동작 불능일 때의 fallback" 조항 추가 검토.
**반복 횟수**: 1회

## 2026-04-07 — 서브에이전트 plan mode 강제 진입으로 "지휘관+서브에이전트" 구조 폐기
**상황**: CLAUDE.md "🎯 작업 구조 — 지휘관 + 서브에이전트" 섹션이 모든 코드 수정을 서브에이전트에 위임하도록 규정하고 있었음.
**잘못한 것**: 시스템 레벨에서 서브에이전트가 plan mode로 강제 진입하므로, 위임받은 서브에이전트가 코드 수정을 수행할 수 없어 구조가 작동 불능 상태였음. CLAUDE.md 텍스트로 우회 불가.
**올바른 방법**: CLAUDE.md를 단일 에이전트(메인) + 강화된 원칙 체크리스트 + Plan/Verify 2회 자가 검증 구조로 교체. "📋 작업 프로세스" 섹션과 "🎯 지휘관+서브에이전트" 섹션을 삭제하고 "🎯 강화된 단일 에이전트" 섹션으로 통합. 금지사항 중 체크리스트와 중복되는 항목 제거.
**반복 횟수**: 1회

## 2026-04-18 — CSS 인라인 하드코딩 반복
**상황**: TASK-126에서 gap:4px/120px/#fff, TASK-127에서 max-width:480px를 리터럴로 작성.
**잘못한 것**: CSS 변수가 존재하는 값을 하드코딩. TASK-127에서는 `--content-max-width`가 있음에도 `480px`로 작성.
**올바른 방법**: CSS 작성 시 모든 수치/색상에 대해 gameVariables.css 변수 존재 여부를 먼저 확인. 변수가 없으면 가장 가까운 의미의 변수(`--spacing-2xs`, `calc(var(--content-max-width)/N)`, `var(--game-card-bg)`)를 사용.
**반복 횟수**: 2회 — CLAUDE.md 규칙 승격 검토 대상

## 2026-04-18 — 지시서 write set 밖 학습 파일을 Phase 4에서 수정 (2회 반복)
**상황**: TASK-126, TASK-125 모두 Phase 4 학습 파일 갱신 단계.
**잘못한 것**: CLAUDE.md Phase 4 절차에 "LAST_SESSION.md 갱신"이 포함되어 있어 기계적으로 수정했으나, 지시서가 명시한 변경 대상 파일 목록과 충돌. extra_changes=true 판정.
**올바른 방법**: 지시서의 변경 대상 파일 목록이 CLAUDE.md Phase 4 절차보다 우선. 학습 파일 갱신은 세션 종료(/session-end) 시점에 수행하고, Phase 4 실행 결과 보고에서는 write set만 보고.
**반복 횟수**: 2회

## 2026-04-18 — PracticeAdminPage.tsx에 인라인 style 속성 사용
**상황**: TASK-20260418-125 step-group drilldown tacit card 내부 레이아웃
**잘못한 것**: `style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}`로 인라인 스타일 + 하드코딩 px 사용. self-reviewer 1회차에서 발견.
**올바른 방법**: CSS module 클래스(`.adminTacitHeader`)로 정의하고 CSS 변수(`var(--spacing-sm)`) 사용. JSX에 `style=` 속성 작성 전 반드시 CSS module 클래스로 대체 가능한지 먼저 확인.
**반복 횟수**: 1회 (CSS 하드코딩 실수는 TASK-126 포함 2회째)

## 2026-04-19 — plan 파일에서 `__tests__` 경로가 markdown bold로 렌더링되어 "tests"로 표시
**상황**: TASK-20260419-129 plan 제출 1차 — `[src/lib/practice/__tests__/adminView.test.ts](...)` 형태로 작성한 링크의 display text에서 `__tests__`가 markdown strong emphasis로 해석되어 렌더링 시 `src/lib/practice/**tests**/adminView.test.ts`가 "src/lib/practice/tests/adminView.test.ts"로 보임.
**잘못한 것**: 지시서/실제 경로는 `__tests__`(언더스코어 각 2개) 인데, 렌더된 plan만 읽으면 테스트 디렉터리가 `tests/`로 보여 새 파일 생성 유도 가능. 평가자가 "테스트 파일 경로 오기"로 판정.
**올바른 방법**: markdown 링크 display text 내부에 `__` 포함 시 `\_\_tests\_\_`로 escape하거나 display text 자체를 분리해 "디렉터리명 `__tests__`"처럼 별도 명시. URL 쪽은 원래 그대로 작성해도 됨(rendering 영향 없음).
**반복 횟수**: 1회
