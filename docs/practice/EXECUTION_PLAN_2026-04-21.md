# KitchenFlow Execution Plan
작성일: 2026-04-21
상태: Working Draft v3
역할: KitchenFlow 메뉴연습/시뮬레이터 재구성을 실제 구현 단계로 나누어 수행하기 위한 실행계획서
기준 문서:
- `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`
- `docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md`
- `docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md`
- `docs/practice/CURRENT_CODE_INVENTORY_2026-04-21.md`
- `docs/practice/SIM_REGRESSION_CHECKLIST_2026-04-21.md`

## 1. 목적
이 문서는 이미 고정된 제품 방향을 실제 코드 변경 순서로 변환하기 위한 실행 문서다.
핵심 목표는 아래 두 가지를 동시에 만족시키는 것이다.

1. 시뮬레이터와 메뉴연습이 `같은 주방 / 같은 장비 컴포넌트 / 같은 물리-틱 런타임` 을 공유하게 만든다
2. 시뮬레이터는 회귀 없이 유지하면서, 메뉴연습을 `별도 rules adapter + practice admin + ghost/tacit layer` 로 재구성한다

## 2. 실행 원칙
- 방향성은 더 이상 이 문서에서 바꾸지 않는다
- 각 Phase는 `이전 Phase의 산출물 위에만` 올라간다
- sim 회귀가 발생하면 다음 Phase로 진행하지 않는다
- practice의 텍스트형 임시 세션 UI는 즉시 삭제하지 않고, shared kitchen 기반 practice session이 검증된 뒤 제거한다
- 공용 shell 추출은 허용되지만, sim의 plate_order 의미와 주문 흐름은 바꾸지 않는다
- Phase별 변경은 가능하면 `작게 merge 가능한 단위` 로 유지한다

## 3. 운영 규칙과 결정 게이트
이 실행계획서는 Claude Code가 Phase를 연속 질주하지 않도록 `결정 게이트` 를 전제로 한다.

운영 규칙:
- Phase 2, Phase 3, Phase 4 는 본 구현 전에 반드시 `스켈레톤/구조 초안` 을 먼저 제출한다
- 스켈레톤 초안에는 `파일 배치`, `주입 방식`, `session boot 위치`, `삭제/유지 자산`, `검증 방식` 이 포함되어야 한다
- 사용자 승인 전에는 해당 Phase의 본 구현에 들어가지 않는다
- 각 Phase 종료 시 Claude Code 는 `다음 Phase 로 진행해도 되는지` 중간 보고를 한다
- 기준 문서 5종과 완료된 이전 Phase 요약을 읽지 않고 다음 Phase 를 시작하지 않는다

Phase별 결정 게이트:
- Gate A, Phase 2 진입 전: shared shell 모듈 배치 / adapter 주입 방식 / session boot 위치 확정
- Gate B, Phase 3 진입 전: practice adapter 책임 분할 / practiceStore 재사용 범위 / 거절 사유 결정 트리 확정
- Gate C, Phase 4 진입 전: old practice session fallback 유지 범위 / shared kitchen session 교체 범위 확정
- Gate D, Phase 5 진입 전: empty-payload pour guide 노출 / 다중 step group UI 정책 / guide 강도 정책 확정

## 4. 방향성 오해 방지 규칙
이 문서는 Claude Code가 아래처럼 잘못 해석하지 못하도록 읽혀야 한다.

금지 해석:
- practice를 별도 텍스트 학습 앱으로 유지하는 해석
- practice session을 현재 `PracticeSessionPage` 텍스트 UI 위에서 확장하는 해석
- same kitchen을 `비슷한 화면을 하나 더 만드는 것` 으로 해석하는 방식
- sim 코드를 보호한다는 이유로 shared shell 추출 자체를 포기하는 해석
- practice engine을 sim plate_order 엔진에 억지로 맞추는 해석
- populated 상태에서 practice admin 동선을 다시 숨기는 해석

반드시 유지할 해석:
- shared 대상은 `주방 화면 + 장비 컴포넌트 + 물리/틱 엔진` 이다
- 분리 대상은 `rules adapter + practice session state + ghost/tacit layer + practice admin` 이다
- 현재 practice session 구현은 최종형이 아니라 `부분 재사용 가능한 자산이 섞인 과도기 산출물` 이다

## 5. 비목표
- 이번 실행계획의 목표는 sim/practice 판별엔진 통합이 아니다
- sim admin과 practice admin을 합치지 않는다
- practice를 별도 텍스트 학습 앱으로 유지하지 않는다
- practice 전용 물리 엔진이나 장비 컴포넌트를 새로 만들지 않는다

## 6. 성공 기준
- 로그인 -> 매장 선택 -> 모드 선택 -> 사용자 선택 흐름이 안정적으로 정리된다
- practice session이 shared kitchen 위에서 동작한다
- practice는 recipe node 엔진을 사용하고 sim은 기존 엔진을 유지한다
- ghost guide가 legal actions 기반으로 동작한다
- step tacit knowledge가 현재 열린 step group 기준으로 노출된다
- populated 상태에서도 practice admin 진입이 유지된다
- sim regression checklist를 통과한다

## 7. 현재 잘못 구현된 Practice Session 처리 원칙
현재 practice session은 `엔진/세션 상태/순수 helper` 와 `텍스트형 세션 화면` 이 뒤섞인 과도기 구현이다.
따라서 이 영역은 `통째 재사용` 도 `통째 삭제` 도 하지 않는다.

처리 원칙:
- engine, runtime hydration/dehydration, session persistence는 `재사용 후보`
- text-first page composition과 placeholder CSS는 `교체 대상`
- session-specific pure helper는 `shared kitchen overlay에 맞게 축소/이식`
- old practice session route는 Phase 7 전까지 fallback 용도로만 유지

### 7.1 재사용 / 교체 / 제거 분류
| 대상 | 현재 역할 | 판정 | 처리 방식 |
|---|---|---|---|
| `src/lib/practice/engine/*` | recipe node 판정 엔진 | 재사용 | shared shell 기반 practice adapter에서 계속 사용 |
| `src/lib/practice/runtime.ts` | hydrate/dehydrate/derived 계산 | 재사용 | adapter 친화 형태로 유지/보강 |
| `src/stores/practiceStore.ts` | session bootstrap + persist + engine 연결 | 부분 재사용 | adapter/session bootstrap 중심으로 리팩터링 |
| `src/lib/practice/sessionView.ts` | step/tacit/group helper | 부분 재사용 | string formatting은 축소, group/tacit selection 로직은 이식 |
| `src/pages/practice/PracticeSessionPage.tsx` | 현재 텍스트형 session UI | 교체 | shared kitchen 기반 session surface로 대체 |
| `src/pages/practice/PracticePlaceholder.module.css` | 텍스트형 practice session 스타일 | 제거 예정 | Phase 7에서 정리 |
| `src/pages/practice/PracticeMenuPage.tsx` | 메뉴 상세/연습 시작 진입 | 재사용 | practice entry와 admin CTA 복구 쪽으로 보강 |
| `src/pages/practice/PracticePage.tsx` | practice 목록/빈 상태 | 재사용 | populated 상태 CTA 유지 방향으로 보강 |
| `src/pages/practice/PracticeAdminPage.tsx` | practice authoring | 재사용 | 동선/검증 UX를 보강 |
| `src/lib/practice/menuView.ts` | bundle-only 메뉴 상세 VM | 재사용 | browse/detail 계층에서 유지 |
| `src/lib/practice/adminView.ts` | admin VM | 재사용 | admin authoring 계층에서 유지 |

### 7.2 핵심 판단
현재 잘못된 것은 `practice engine 자체`보다 `practice session의 표면과 흐름` 이다.
따라서 효율적인 전략은 아래다.

1. 엔진/저장/authoring 자산은 최대한 살린다
2. 텍스트형 session page는 최종형으로 발전시키지 않고 교체한다
3. shared kitchen 전환이 끝난 뒤 old session UI만 제거한다

## 8. 의존성 맵
실행 순서는 아래 의존성을 따른다.

1. 상위 흐름 정리
2. shared shell 경계 추출
3. practice adapter / practice session runtime 결합
4. practice session UI 전환
5. ghost/tacit layer 연결
6. practice admin 동선/authoring 복구
7. 정리 및 회귀 검증

즉 `shared shell 추출 전` 에 practice session을 최종형으로 옮기지 않는다.
또한 `practice adapter가 닫히기 전` 에 ghost/tacit UI를 붙이지 않는다.

## 9. Phase 개요
| Phase | 목표 | 선행 조건 | 종료 조건 |
|---|---|---|---|
| Phase 0 | 기준선 고정 및 회귀 방어 | 없음 | 작업 기준 문서와 sim 회귀 기준 확정 |
| Phase 1 | 상위 웹 플로우 정리 | Phase 0 | 로그인/매장/모드/사용자 흐름 안정화 |
| Phase 2 | shared kitchen shell 경계 추출 | Phase 1 | sim/practice가 공용 shell을 볼 수 있는 구조 형성 |
| Phase 3 | practice rules adapter / store / session bootstrap | Phase 2 | practice engine이 shared shell에 붙을 준비 완료 |
| Phase 4 | practice session을 shared kitchen 위로 이전 | Phase 3 | 텍스트형 practice session 탈피 |
| Phase 5 | ghost guide / step tacit layer 연결 | Phase 4 | 학습 UX가 shared kitchen 위에서 작동 |
| Phase 6 | practice admin 및 관리 동선 복구 | Phase 4 | populated 상태에서도 authoring 진입 가능 |
| Phase 7 | 정리, 삭제, 회귀 검증 | Phase 5, 6 | old session 경로 정리 및 최종 검증 완료 |

## 10. Phase 0 — 기준선 고정 및 회귀 방어
### 목표
- 구현자가 기준 문서를 오해 없이 볼 수 있게 기준선을 고정한다
- sim regression을 초기에 방어한다
- legacy practice session 자산의 처분 전략을 고정한다

### 작업
- 기준 문서 5종을 구현 기준으로 명시한다
- `SIM_REGRESSION_CHECKLIST_2026-04-21.md` 를 Phase별 중단 조건 문서로 사용한다
- current code inventory 기준으로 shared / sim-only / practice-only 경계를 다시 대조한다
- 현재 practice session 자산을 `재사용 / 부분 재사용 / 교체 / 제거` 로 분류한다
- 현재 시점의 `build / lint / tsc / practice tests` 실행 가능 여부를 확인하고 baseline 으로 기록한다
- 실행계획서에서 참조하는 모든 vitest 경로의 실재 여부를 확인하고 baseline 에 기록한다
- sim 회귀 검증 중 자동화 가능한 항목과 사용자 수동 검증이 필요한 항목을 분리한다

### 예상 변경 범위
- 문서만

### 검증
- 기준 문서 참조 경로가 모두 유효한지 확인
- sim regression checklist와 current code inventory가 충돌하지 않는지 확인
- `PracticeSessionPage` 를 최종형으로 확장하지 않는다는 판단이 문서에 명시됐는지 확인
- 자동 검증 가능 항목 목록과 수동 검증 필요 항목 목록이 분리되었는지 확인

### 중단 조건
- shared runtime 후보와 sim-only 로직 경계가 불명확하면 Phase 1로 가지 않는다
- legacy practice session 처분 전략이 닫히지 않으면 Phase 1로 가지 않는다

## 11. Phase 1 — 상위 웹 플로우 정리
### 목표
로그인 -> 매장 선택 -> 모드 선택 -> 사용자 선택 흐름을 제품 의도에 맞게 정리한다.

### 핵심 문제
- 로그인 전에 mode 선택이 앞에 오는 경로
- practice 진입 시 selectedStore / selectedUser 전제가 흔들리는 경로
- populated 상태에서 practice admin 진입이 사라지는 경로

### 작업
- 상위 진입 라우트 정리
- 로그인/공개 라우트와 보호 라우트의 목적지 정합성 수정
- 매장 선택 이후 mode 선택, mode 선택 이후 사용자 선택 흐름 정리
- practice 일반 사용자 흐름과 practice admin 흐름 분리
- populated 상태 practice 메뉴 목록에서도 항상 관리 진입 CTA 유지

### 주요 대상 파일
- `src/router.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/JoinPage.tsx`
- `src/pages/AvatarSelectPage.tsx`
- `src/pages/practice/PracticePage.tsx`
- `src/pages/practice/PracticeMenuPage.tsx`

### 산출물
- 상위 플로우가 제품 의도와 일치하는 라우트 구조
- practice browse/session/admin 전제 조건 정리

### 검증
- 로그인 전 mode-first 진입이 제거되었는지 확인
- selectedStore 없이 practice browse 진입 불가 확인
- selectedUser 없이 practice session 시작 불가 확인
- 관리자와 일반 사용자 모두 practice 진입 경로 확인
- `rg -n "/practice|/sim|Navigate|selectedStore|selectedUser" src/router.tsx src/pages/HomePage.tsx src/pages/JoinPage.tsx src/pages/AvatarSelectPage.tsx src/pages/practice/PracticePage.tsx src/pages/practice/PracticeMenuPage.tsx` 결과가 의도와 충돌하지 않는지 확인

### 롤백 전략
- route swap 전까지 기존 sim 경로는 유지
- practice entry 변경이 sim 경로를 건드리면 즉시 되돌리고 분리 재설계

### 중단 조건
- sim 진입 흐름이 흔들리거나 selectedUser/selectedStore 전제가 다시 깨지면 Phase 2 금지

## 12. Phase 2 — Shared Kitchen Shell 경계 추출
### 목표
현재 `GamePage` 중심 구조에서 shared kitchen runtime과 sim-specific rules를 분리한다.

### Gate A — Phase 2 진입 전 확정
이 Phase에 들어가기 전 아래 구조 결정을 먼저 제출하고 승인받는다.

- 공용 shell React 레이어는 `src/components/game/shared-shell/*` 에 둔다
- mode adapter 인터페이스 및 factory/helper 는 `src/lib/kitchen-mode/*` 에 둔다
- adapter 주입 방식은 `React Context` (`KitchenModeAdapterContext`) 로 고정한다
- session boot 은 `route-level page component` 에서 수행하고, boot 완료 후 shared shell 에 adapter를 제공한다
- `useEquipmentStore`, `useGameTick` 같은 shared runtime 레이어는 adapter를 직접 import 하지 않는다
- sim / practice page 는 각각 adapter를 생성하되, shell 내부는 mode-specific store를 직접 import 하지 않는다

### 작업
- `GamePage` 에서 shared shell 후보와 sim-specific 비즈니스 로직을 분리
- `GameKitchenView` 와 공용 HUD 앵커를 mode-agnostic shell로 끌어올릴 경계 정의
- shared runtime이 담당할 것과 adapter가 담당할 것을 코드 수준으로 분리
- `KitchenModeAdapter` 가 들어갈 자리와 session boot 경계 형성

### 주요 대상 파일
- `src/pages/GamePage.tsx`
- `src/components/game/GameKitchenView.tsx`
- `src/stores/equipmentStore.ts`
- `src/hooks/useGameTick.ts`
- 공용 shell 신설 파일들

### 산출물
- shared kitchen shell
- sim rules adapter를 꽂을 수 있는 분리 지점
- practice rules adapter가 들어올 수 있는 동일한 인터페이스 자리

### 검증
- 장비 렌더링, 선택, 핸드바, 물리 tick이 shared runtime 경계에 남아 있는지 확인
- sim plate_order, scoring, order flow가 shared shell 안으로 새어 들어가지 않았는지 확인
- `same kitchen / same equipment / same tick engine` 원칙이 코드 구조에 반영되었는지 확인
- `rg -n "plate_order|useOrderGenerator|scoringStore|practiceStore" src/components/game/shared-shell src/lib/kitchen-mode` 결과를 확인해 shared shell 쪽에 sim/practice 전용 로직이 새어들지 않았는지 검증
- `rg -n "KitchenModeAdapterContext|SharedKitchenShell|boot\\(" src/components/game/shared-shell src/lib/kitchen-mode src/pages` 결과로 주입 경로와 boot 위치가 Gate A와 일치하는지 검증

### 롤백 전략
- shared shell 추출은 sim behavior를 바꾸지 않는 범위로만 단계적으로 수행
- 특정 추출이 sim을 흔들면 adapter 경계만 남기고 추출 범위를 줄인다

### 중단 조건
- sim 주방 상호작용 의미가 바뀌거나 regression checklist 핵심 항목이 흔들리면 즉시 중단
- Gate A와 다른 구조로 구현하려는 시도가 나오면 즉시 중단하고 승인 재요청

## 13. Phase 3 — Practice Rules Adapter / Store / Session Bootstrap
### 목표
practice engine을 shared kitchen에 연결할 최소 실행 단위를 만든다.

### Gate B — Phase 3 진입 전 확정
- practice adapter는 `src/lib/practice/engine/*` 와 `src/lib/practice/runtime.ts` 를 재사용하는 thin adapter 로 간다
- `practiceStore` 는 session bootstrap / persist orchestration 중심으로 유지하고, rules 계산 자체는 adapter/engine 으로 둔다
- `sessionView.ts` 는 text-first formatting helper 와 step/tacit selection helper 를 분리한 뒤 후자만 재사용한다
- `PracticeSessionPage.tsx` 는 이 Phase에서 최종 UI로 확장하지 않는다
- 거절 사유 우선순위 결정 트리를 이 Phase 전에 확정한다
- 11절, 12절, 14절의 단계 -> `rejection_code` 매핑이 문서와 코드에서 일치해야 한다

### 작업
- practice mode adapter 구현
- practice session boot context 정리
- practice runtime state와 shared runtime state의 결합 지점 구현
- `practiceStore` 를 adapter 친화 구조로 정리
- recipe node engine 조회/세션 상태/ legal action enumeration 경로 연결
- 기존 `practiceStore` 의 session persistence / resume / complete-abandon 흐름은 살리고, text-first page 전제를 제거한다
- `sessionView.ts` 계열 helper 중 group/tacit selection 로직은 재사용하고, 텍스트형 액션 포맷터 의존은 분리한다

### 주요 대상 파일
- `src/stores/practiceStore.ts`
- `src/lib/practice/queries.ts`
- practice adapter / engine 연결 파일 신설
- `src/pages/practice/PracticeSessionPage.tsx` 의 데이터 결합부

### 산출물
- shared shell이 practice adapter를 통해 legal actions, step groups, rejection, ghost state를 읽을 수 있는 상태

### 검증
- selectedStore / selectedUser / menuId 기반 세션 boot가 되는지 확인
- practice adapter가 shared runtime state와 충돌 없이 legal actions를 계산하는지 확인
- engine spec의 `deco-first`, `empty-payload pour`, `enumerateLegal*` 규칙이 adapter에서 빠지지 않았는지 확인
- `npx vitest run src/lib/practice/engine/__tests__/phaseAdvance.test.ts`
- `npx vitest run src/lib/practice/engine/__tests__/ingredientAdd.test.ts`
- `npx vitest run src/lib/practice/__tests__/sessionView.test.ts`
- adapter 층에서 `enumerateLegalActions()` 와 `tryPlace/tryPerformAction/tryPour` 의 legal/illegal 결과가 같은 시나리오에서 일치하는지 수동 시나리오 3개 이상 대조
- 예시 2 순서 검증 시나리오를 수행한다:
  - 밥 1 성공
  - 참기름 2 성공
  - 깨 5 시도 -> `rejection_code = step_not_open`
  - 붓기 성공 -> 내부 `3 -> 4 -> 4` 연속 판정 순서가 문서와 일치
  - 깨 5 성공
- deco-first 검증 시나리오를 수행한다:
  - 빈 `serving.bowl.main` 에 깨 투입 시도
  - `rejection_code = deco_requires_base`

### 롤백 전략
- UI를 shared shell로 완전히 전환하기 전에 adapter를 독립 검증
- adapter가 불안정하면 old practice session route는 유지한 채 engine 결합만 고친다

### 중단 조건
- legal action enumeration과 실제 try* 판정이 다르게 나오면 Phase 4 금지

## 14. Phase 4 — Practice Session Shared Kitchen 전환
### 목표
기존 텍스트형 practice session을 shared kitchen 기반 practice session으로 대체한다.

### Gate C — Phase 4 진입 전 확정
- old `PracticeSessionPage.tsx` 는 route wiring / bootstrap 외에는 최종형 자산으로 취급하지 않는다
- fallback route 는 Phase 7 전까지 유지하되, 새 기능은 old session view에 추가하지 않는다
- shared kitchen practice session 의 최소 surface 는 `shared shell + practice overlay + rejection surface + guide hooks` 로 정의한다
- placeholder CSS 는 transitional asset 이며, 같은 주방 session 전환이 끝나면 제거 대상으로 고정한다

### 작업
- `/practice/session/:sessionId` 를 shared kitchen shell 기반 화면으로 전환
- practice mode용 HUD / overlay / rejection surface 연결
- old text-first legal action UI를 최종형에서 제거
- same kitchen 상에서 practice-specific 상태 요약을 표시
- 기존 `PracticeSessionPage.tsx` 는 화면 뼈대 기준으로 재사용하지 않고, session boot / route wiring만 필요한 만큼 이식한다
- `PracticePlaceholder.module.css` 는 transitional asset로 간주하고 새 shared-kitchen overlay 스타일로 대체한다

### 주요 대상 파일
- `src/pages/practice/PracticeSessionPage.tsx`
- shared shell 관련 컴포넌트
- practice overlay 컴포넌트 신설

### 산출물
- 메뉴연습이 같은 주방에서 실행되는 최종형 session surface

### 검증
- practice session이 `GameKitchenView` 계열 공용 표면 위에서 동작하는지 확인
- 텍스트 리스트형 액션 UI에 의존하지 않고, shared kitchen 상호작용으로 진행 가능한지 확인
- sim session과 장면/장비/틱이 동일하게 공유되는지 확인
- `rg -n "formatLegalAction|formatFriendlyAction|guidePanel|availableActions|possibleActions" src/pages/practice/PracticeSessionPage.tsx src/components/game/shared-shell src/components/practice` 결과를 확인해 old text-first action rendering 의존이 남지 않았는지 검증

### 롤백 전략
- old practice session 화면은 Phase 7 전까지 완전 삭제하지 않는다
- shared kitchen practice session이 불안정하면 route를 임시로 old view에 되돌릴 수 있게 유지
- 다만 old view는 fallback 용도일 뿐, 그 위에 새 기능을 계속 쌓지 않는다

### 중단 조건
- practice session 전환이 sim shell을 깨거나, practice 자체가 same-kitchen 원칙을 만족하지 못하면 중단

## 15. Phase 5 — Ghost Guide / Step Tacit Layer 연결
### 목표
practice engine 상태를 학습 UX로 연결한다.

### Gate D — Phase 5 진입 전 확정
이 Phase 전에 아래 정책을 사용자 승인으로 닫는다.

1. empty-payload pour 의 ghost guide 노출 방식
2. 여러 step group 동시 활성 시 UI 노출 정책
3. recommendation / Full-Hint-Off 강도 정책

### 작업
- `enumerateLegalActions()` 기반 ghost guide 연결
- `open_step_group_ids` / `primary_open_step_group_id` 기반 step 패널 연결
- 현재 열린 step group 기준 tacit knowledge 패널 연결
- recommendation / Full-Hint-Off 강도 정책 구현
- empty-payload pour를 guide에서 어떻게 보여줄지 정책 반영

### 주요 대상 파일
- practice overlay / guide 컴포넌트
- step/tacit panel 컴포넌트
- practice adapter의 guide/view model 반환부

### 산출물
- practice session에서 현재 가능한 행동과 학습 콘텐츠가 engine state와 직접 연결된 UX

### 검증
- guide가 엔진이 실제로 거절할 행동을 보여주지 않는지 확인
- 현재 열린 step group과 tacit panel이 일치하는지 확인
- deco-first / pour / branch 상황에서 guide가 틀린 권고를 하지 않는지 확인
- `npx vitest run src/lib/practice/__tests__/sessionView.test.ts`
- guide 표시 행동과 `enumerateLegalActions()` 결과를 1:1 로 대조하는 수동 시나리오 점검
- empty-payload pour 케이스에서 guide 표기가 Gate D 정책과 일치하는지 확인

### 롤백 전략
- guide 강도는 `Off` 가능하게 유지
- tacit panel과 ghost guide는 engine state가 안정된 뒤 순차적으로 붙인다

### 중단 조건
- guide와 engine legal actions가 불일치하면 Phase 6 금지

## 16. Phase 6 — Practice Admin 및 관리 동선 복구
### 목표
practice authoring이 빈 상태와 populated 상태 모두에서 안정적으로 접근 가능하도록 복구한다.

### 작업
- practice menu 목록 / 상세에서 항상 관리 진입 CTA 유지
- practice admin의 메뉴 생성 / 수정 / step group / tacit / media authoring 흐름 정리
- practice admin 검증 단계와 practice session 검증 경로 연결

### 주요 대상 파일
- `src/pages/practice/PracticeAdminPage.tsx`
- `src/pages/practice/PracticePage.tsx`
- `src/pages/practice/PracticeMenuPage.tsx`
- practice admin 관련 view/query 파일

### 산출물
- populated 상태에서도 사라지지 않는 메뉴 생성/수정 흐름
- practice authoring과 same-kitchen practice session 검증이 이어지는 관리 UX

### 검증
- 메뉴가 1개 이상 있어도 항상 새 메뉴 추가 가능
- 기존 메뉴 수정 진입이 항상 가능
- 관리자 권한 흐름이 일반 사용자 practice 흐름과 충돌하지 않는지 확인
- `rg -n "연습 메뉴 관리|새 메뉴|관리|admin" src/pages/practice/PracticePage.tsx src/pages/practice/PracticeMenuPage.tsx src/pages/practice/PracticeAdminPage.tsx` 로 populated/empty 양쪽 진입 CTA 존재 확인

### 롤백 전략
- authoring 기능은 browse/session 전환과 독립적으로 머지 가능하게 유지

### 중단 조건
- 관리 동선 수정이 일반 practice 진입을 깨거나 admin 아닌 사용자에게 노출되면 중단

## 17. Phase 7 — 정리, 삭제, 최종 회귀 검증
### 목표
임시 경로와 과도기 UI를 정리하고 최종 검증을 완료한다.

### 작업
- old text-first practice session UI 제거 또는 비노출 처리
- 불필요한 practice 임시 코드 정리
- shared shell / adapter 경계 주석 정리
- docs/worker 세션 기록 업데이트
- 최종 build / lint / tsc / test / sim regression 수행

### 제거 대상
- shared kitchen 전환 뒤 더 이상 필요 없는 `PracticePlaceholder.module.css`
- old text-first practice session composition 잔재
- session page 내부의 텍스트형 legal action 포맷 전용 렌더링

### 산출물
- 최종 practice session이 same-kitchen 기반으로 고정된 코드베이스
- sim 비회귀 확인 결과

### 검증
- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`
- `npx vitest run src/lib/practice/engine/__tests__/phaseAdvance.test.ts`
- `npx vitest run src/lib/practice/engine/__tests__/ingredientAdd.test.ts`
- `npx vitest run src/lib/practice/__tests__/menuView.test.ts`
- `npx vitest run src/lib/practice/__tests__/adminView.test.ts`
- `npx vitest run src/lib/practice/__tests__/sessionView.test.ts`
- `SIM_REGRESSION_CHECKLIST_2026-04-21.md` 기준 자동 검증 가능 항목 실행
- `SIM_REGRESSION_CHECKLIST_2026-04-21.md` 기준 수동 검증 필요 항목은 사용자 수동 검증 필수로 남긴다
- worker 기록 문서 갱신

### 롤백 전략
- 제거 작업은 마지막 Phase에만 수행
- regression 발생 시 old practice session 제거를 보류하고 경계 정리만 머지

### 중단 조건
- build/lint/tsc 중 하나라도 실패하면 종료 불가
- sim regression checklist 미통과 시 종료 불가

## 18. 최종 한 줄
이번 실행은 `같은 주방을 공유하는 sim/practice 구조를 만들되, sim은 지키고 practice는 rules adapter와 학습 레이어로 옮기는 작업` 이다.
