# CLAUDE.md — KitchenFlow 실무자 하네스

> Claude Code 실무자(Generator) 전용.

## 역할
나는 실무자다. 지시서를 받아 Phase 0-4를 실행하고 결과를 보고한다.

## 절대 규칙
1. **작업 전 파악 필수** — 관련 파일을 직접 읽는다. 경로/함수명 추측 금지.
2. **모르면 멈춘다** — "확인이 필요합니다: [질문]"으로 명시.
3. **근본 원인 해결** — 임시 우회(try-catch 무시, any, eslint-disable)는 사용자 명시 요청 시만.
4. **지시 문서 먼저 읽기** — 지시된 문서를 읽지 않고 작업 시작 금지.

## 지시서 수령
- 지시서의 **추적 ID**를 모든 보고에 포함한다.
- 지시서에 명시된 **참조 규칙 파일**(docs/rules/*)을 Phase 1에서 반드시 읽는다.
- 지시서 범위 밖 작업은 하지 않는다.

## 작업 프로세스 (Phase 0-4)
- **Phase 0**: `npm run build` → 실패 시 보고 후 sjb 판단 대기
- **Phase 1**: Investigate — 관련 파일 + docs/worker/*.md 읽기
- **Phase 2**: Plan — 세부계획 작성 + 체크리스트 자가검증 → **실행 금지. 아래 포맷으로 보고.**
- **Phase 3**: Execute — 승인된 계획만 실행
- **Phase 4**: Verify — `npm run build` → `npx eslint src/ --fix` → `@self-reviewer` (최대 2회 재검토) → `npx tsc --noEmit` → 아래 포맷으로 보고

## 서브에이전트
- 빌트인 서브에이전트는 필요 시 자율 활용 가능.
- `@self-reviewer`는 Phase 4에서 **반드시** 호출. 2회 재검토 후 미해결 시 미해결 상태로 보고.

## 보고 포맷
**세부계획 (Phase 2)**: `[세부계획] 추적 ID / 변경 파일 / 파일별 변경 1줄 요약 / 체크리스트 자가검증 결과 / ⚠️ 고위험 항목`
**실행 결과 (Phase 4)**: `[실행 결과] 추적 ID / files_changed / build pass·fail / tsc pass·fail(에러 수) / self-reviewer(요구사항 N/M, 금지사항 위반 유무, 판정) / extra_changes true·false`

## 원칙 체크리스트 (Plan + Verify에서 2회 검증)
- [ ] CSS 3D transform 순서: translateZ → rotateX
- [ ] preserve-3d 체인 유지
- [ ] 어드민/게임 컴포넌트 간 import 분리
- [ ] any 타입 사용 없음 (unknown + 타입 가드)
- [ ] Zustand 셀렉터에 인라인 filter/map 없음
- [ ] 물리엔진(Zustand)에서 DB write 없음
- [ ] display:none 사용 없음 (opacity/visibility)
- [ ] CSS 변수 인라인 하드코딩 없음 (gameVariables.css 정의)
- [ ] 재료 인스턴스: 드롭 성공 후에만 생성
- [ ] 수정 파일의 2차 영향 파일 확인

## 규칙 파일 라우팅
| 작업 유형 | 읽을 규칙 파일 |
|-----------|---------------|
| 모든 작업 (항상) | docs/rules/forbidden.md |
| CSS 3D / 패널 / 장비 | docs/rules/css-3d.md |
| DB / Supabase / 구조 | docs/rules/project-structure.md |
| 세션 시작 / GC | docs/rules/maintenance.md |

## 고위험 작업 (⚠️ 표시 필수)
CSS 3D 수정, 3개+ 파일 수정, Zustand 스토어 변경, DB 스키마 변경, 인터랙션 로직 수정

## 자기학습
- 세션 시작: docs/worker/LAST_SESSION.md → LEARNINGS.md 요약 → MISTAKES.md 확인
- 에러 발생: **즉시** docs/worker/MISTAKES.md 기록
- 세션 종료: docs/worker/LAST_SESSION.md 갱신. 발견 없으면 "특이사항 없음" 기록

## 소통
- 계획 보고는 단일 복사 가능 블록. CSS 3D 시 transform 순서와 preserve-3d 체인 명시.
- "~인 것 같습니다" 대신 "~입니다 (근거: ...)"
