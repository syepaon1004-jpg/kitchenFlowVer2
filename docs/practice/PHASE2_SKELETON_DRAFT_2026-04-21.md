# Phase 2 Skeleton Draft
작성일: 2026-04-21
상태: Working Draft v1 — skeleton only (본 구현 미착수)
추적 ID: TASK-20260421-204
역할: Phase 2 진입 전 결정 게이트(Gate A)를 만족시키기 위한 공용 shell + mode adapter 구조 스켈레톤 초안
상위 문서:
- `docs/practice/EXECUTION_PLAN_2026-04-21.md` §3 운영 규칙, §12 Phase 2 / Gate A
- `docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md`
- `docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md` §3.1–§3.3
- `docs/practice/CURRENT_CODE_INVENTORY_2026-04-21.md`
- `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`
- `docs/practice/SIM_REGRESSION_CHECKLIST_2026-04-21.md`

이 문서는 실제 런타임 분리를 수행하지 않는다. 본 초안에서 수행되는 것은 `빈 껍데기 파일 배치` 와 `설계 결정 고정` 이며, sim/practice rules 구현, adapter 실동작, ghost/tacit 연결, practice session 전환은 모두 이후 Phase 2 본 구현 또는 Phase 3–5 에서 수행한다.

## 1. Current Coupling Snapshot
현재 코드가 공용 shell 경계를 넘나들며 결합되어 있다는 근거 4건. 모두 read-only 근거이며 이번 task 에서 수정하지 않는다.

### 근거 1 — `GamePage` 가 sim-only hook/store 와 `GameKitchenView` 를 route component 에서 직접 조립
- `src/pages/GamePage.tsx` L3–46 에서 `supabase`, `useGameStore`, `useEquipmentStore`, `useUiStore`, `useAuthStore`, `useScoringStore`, `useGameTick`, `useRecipeEval`, `useOrderGenerator`, `BillQueue`, `GameKitchenView`, `SessionResultOverlay`, `SCORE_CONFIG` 를 한 파일에 결합한다.
- L109 `useGameTick()` + L112 `useOrderGenerator()` + L115 `useRecipeEval(storeId)` 를 동시에 호출 → shared runtime 후보 훅과 sim-only 훅이 같은 route component 에서 분리 없이 기동된다.
- L1111–1162 `<GameKitchenView ...>` 에 `wokContentsMap`, `placedContainers`, `panelToStateIdMap` 같은 sim-only 파생 props 를 직접 주입.
→ 결론: `GamePage` 는 shared kitchen page 가 아니라 sim session 조립자다.

### 근거 2 — `GameKitchenView` 가 mode-specific store 를 직접 구독하고 변경
- `src/components/game/GameKitchenView.tsx` L4 `import { useEquipmentStore }`, L5 `import { useGameStore }`.
- L188–200 `useEquipmentStore(useShallow(...))` 로 burner_level record 를 매 렌더 파생.
- L236 `useGameStore.getState().ingredientInstances`, L242–244 `useEquipmentStore.getState()` 로 imperative read.
- L510–513 `useEquipmentStore.getState().updateEquipment(...)` 로 장비 상태를 view 컴포넌트에서 직접 변경.
- L861–862 `useGameStore((s) => s.ingredientInstances)` 와 `waterIngredientIds` 를 내부 `BurnerPanel` 이 직접 구독.
→ 결론: 공용 주방 뷰가 shared runtime store 뿐 아니라 sim 결합 store 까지 직접 소유하고 있다.

### 근거 3 — `useGameTick` 가 3 스토어를 한 훅에 결합
- `src/hooks/useGameTick.ts` L2–4 `useEquipmentStore`, `useGameStore`, `useScoringStore` 를 함께 import.
- L7–18 세 스토어의 selector/action(`tickWok`, `tickBasket`, `tickMicrowave`, `tickMix`, `addActionLog`, `checkIdlePenalty`) 을 한 훅에서 묶음.
- L57–66 매 1초 틱에서 sim-only `addActionLog({ action_type: 'stir', ... })` 를 직접 호출.
→ 결론: shared runtime 후보 tick 이 sim 전용 scoring/ action log 에 결합되어 있다. SHARED_SHELL_BOUNDARY_APPENDIX §9.1 은 "physical state 전이는 shared runtime, mode-specific 파생은 adapter" 로 분리를 요구한다.

### 근거 4 — `equipmentStore` 가 `gameStore` / `scoringStore` 를 직접 import
- `src/stores/equipmentStore.ts` L6 `import { useGameStore } from './gameStore'`, L7 `import { useScoringStore } from './scoringStore'`.
- L107 `useGameStore.getState().ingredientInstances` 로 재료를 조회해 물리 tick 계산.
- L133–147 burned 전이 순간 `useScoringStore.getState().addScoreEvent({ event_type: 'wok_burned', ... })` 를 발행.
→ 결론: shared runtime 후보 store 가 sim-only scoring 이벤트를 생성한다. 이 연결은 Phase 2 본 구현에서 sim adapter 로 이관되어야 한다.

## 2. Proposed File Tree
이번 task 에서는 아래 9 개 파일을 신설하고 기존 파일은 0 수정한다. `.harness/tasks/TASK-20260421-204.json` files[] 9 항목과 1:1 대응.

```
docs/practice/
└── PHASE2_SKELETON_DRAFT_2026-04-21.md        (설계 결정 문서 — 본 파일)

src/components/game/shared-shell/              (신설 디렉터리)
├── SharedKitchenShell.tsx                     (mode-agnostic 프레임 껍데기)
├── SharedKitchenHudSlots.tsx                  (named HUD slot 껍데기)
└── index.ts                                   (barrel)

src/lib/kitchen-mode/                          (신설 디렉터리)
├── KitchenModeAdapter.ts                      (타입/인터페이스 + React Context object + useKitchenModeAdapter hook)
├── KitchenModeAdapterContext.tsx              (Provider 컴포넌트만)
├── createSimModeAdapter.ts                    (stub factory, 실동작 없음)
├── createPracticeModeAdapter.ts               (stub factory, 실동작 없음)
└── index.ts                                   (barrel)

> 구현 노트: Context 객체와 hook 은 `KitchenModeAdapter.ts` 에 co-locate 한다. `KitchenModeAdapterContext.tsx` 는 Provider 컴포넌트만 노출한다. 이유: ESLint 규칙 `react-refresh/only-export-components` 가 `.tsx` 파일에서 Context / 비컴포넌트 export 를 금지하고, `eslint-disable` 은 `docs/rules/forbidden.md` 금지 사항. 파일 개수를 늘리지 않고 규칙을 지키기 위한 최소 조정. 공개 surface (`src/lib/kitchen-mode` barrel export) 는 변경 없음.
```

원칙:
- 어느 신설 파일도 기존 runtime/page/router/hook/store 에 import 되지 않는다.
- 어느 신설 파일도 sim evaluator, order flow, scoring, practice engine, practice store 를 import 하지 않는다.

## 3. Gate A Decisions
지시서 "Gate A 4항목" 프레이밍에 따라 4 결정으로 응답한다. EXECUTION_PLAN §12 Gate A 원문은 6 bullet 이며, 그중 ⑤·⑥ bullet(`useEquipmentStore`/`useGameTick` 은 adapter 를 import 하지 않는다, sim/practice page 가 각자 adapter 를 만들되 shell 은 mode-specific store 를 import 하지 않는다) 은 "경계(④)" 로 묶는다.

### ① 공용 shell 모듈 배치 — `src/components/game/shared-shell/*`
- 근거: EXECUTION_PLAN §12 Gate A 1행 "공용 shell React 레이어는 `src/components/game/shared-shell/*` 에 둔다".
- `docs/rules/forbidden.md` "`src/components/admin/` ↔ `src/components/game/` 간 import 금지" 규칙을 자동 계승 (신설 폴더가 game 서브디렉터리이므로 admin 쪽 import 는 정의상 금지).
- `docs/rules/project-structure.md` 에 이미 `src/components/game/*` 가 존재하여 기존 디렉터리 정책과 충돌하지 않는다.

### ② adapter 주입 방식 — React Context (`KitchenModeAdapterContext`)
- 근거: EXECUTION_PLAN §12 Gate A 3행 "adapter 주입 방식은 `React Context` (`KitchenModeAdapterContext`) 로 고정한다".
- SHARED_SHELL_BOUNDARY_APPENDIX §4 "공용 shell 은 sim/practice evaluator 를 직접 import 하지 않는다" 를 React tree 수준에서 강제하는 최저 결합 수단.
- prop drilling 은 `GameKitchenView` depth(패널 3중 + 장비별 서브트리) 에서 비현실적.
- zustand 전역 adapter 는 mode scope 을 명시하지 못해 sim/practice 두 모드가 tree 에 공존할 가능성(Phase 4 전환 기간)을 설명하지 못한다.
- 실물 배치: `KitchenModeAdapterContext` 객체와 `useKitchenModeAdapter` hook 은 `KitchenModeAdapter.ts` 에, `KitchenModeAdapterProvider` 컴포넌트만 `KitchenModeAdapterContext.tsx` 에. barrel(`src/lib/kitchen-mode/index.ts`) 가 Provider·hook·타입을 모두 re-export.

### ③ session boot 위치 — route-level page component
- 근거: EXECUTION_PLAN §12 Gate A 4행 "session boot 은 `route-level page component` 에서 수행하고, boot 완료 후 shared shell 에 adapter 를 제공한다".
- sim 은 `src/pages/GamePage.tsx` 에서 `createSimModeAdapter()` + `adapter.boot({ mode: 'sim', ... })` 후 `<KitchenModeAdapterProvider adapter={...}>` 로 `<SharedKitchenShell>` 을 감싼다.
- practice 는 Phase 4 에서 `src/pages/practice/PracticeSessionPage.tsx` 가 동일 패턴으로 `createPracticeModeAdapter()` 를 생성한다.
- 근거 보강: EXECUTION_PLAN §7.1 표 "session bootstrap 은 재사용 후보" — 기존 session persistence 경로를 page 에서 그대로 활용.
- shell 내부에서 boot 하면 shell 에 mode 가 새어 들어가 Gate A ①·④ 위반.

### ④ shared runtime 이 adapter 를 모르게 만드는 경계
- 근거: EXECUTION_PLAN §12 Gate A 5·6행 + SHARED_SHELL_BOUNDARY_APPENDIX §4 원칙 + §9.1 `onRuntimeTick` 계약.
- 다음 파일은 `KitchenModeAdapter`, `createSim*`, `createPractice*`, `useKitchenModeAdapter`, `KitchenModeAdapterProvider` 중 어느 심볼도 import 하지 않는다:
  - `src/hooks/useGameTick.ts`
  - `src/stores/equipmentStore.ts`
  - `src/stores/gameStore.ts`(물리 인스턴스 경계만 유지할 shared 파트)
  - `src/components/game/shared-shell/**` (공용 shell 은 adapter 를 "모른다")
- adapter 호출은 **route-level page 와 sim/practice overlay 컴포넌트**에서만 일어난다(`useKitchenModeAdapter()`).
- §9.1 계약: shared runtime 은 1초 physical tick 을 담당하고, shell 은 그 이후 현재 mode 의 `adapter.onRuntimeTick()` 을 호출한다. 이 호출 지점 역시 shared runtime 내부가 아니라 page/overlay 계층이다.

## 4. Existing Files To Change In Real Phase 2
이번 task 에서는 아래 파일들을 **수정하지 않는다**. Phase 2 본 구현 진입 시 파일별 변경 사유를 2–3줄로 고정.

| 파일 | 변경 사유 (요약) |
|---|---|
| [src/pages/GamePage.tsx](../../src/pages/GamePage.tsx) | sim adapter 를 생성·boot 하고 `KitchenModeAdapterProvider` + `SharedKitchenShell` 을 주입. sim-only overlay(주문 선택, 서빙 결과, 피드백)는 shell children/overlay slot 으로 이관. `useOrderGenerator`/`useRecipeEval` 의 호출 경계를 sim adapter 내부로 옮긴다. |
| [src/components/game/GameKitchenView.tsx](../../src/components/game/GameKitchenView.tsx) | `useEquipmentStore`/`useGameStore` 직접 import 를 제거하고 shell 하위로 편입. 필요한 파생값(`wokContentsMap`, `placedContainers`, `panelToStateIdMap`) 은 HUD slot props 로 주입받는다. mode-specific 분기는 남기지 않는다. |
| [src/hooks/useGameTick.ts](../../src/hooks/useGameTick.ts) | `useScoringStore` 결합을 제거. scoring 로그 기록은 sim adapter 의 `onRuntimeTick()` 내부로 이동 (SHARED_SHELL_BOUNDARY_APPENDIX §9.1). shared runtime tick 은 장비/컨테이너 물리 전이만 담당. |
| [src/stores/equipmentStore.ts](../../src/stores/equipmentStore.ts) | `useScoringStore` import 와 `wok_burned` 이벤트 발행을 제거하여 sim adapter 로 이관. `useGameStore` 참조는 ingredient 물리 상태 한정으로 남긴다. |
| [src/stores/gameStore.ts](../../src/stores/gameStore.ts) | `orders`/`totalOrderCount`/`updateOrderStatus`/`assignOrderToContainer` 등 plate_order 의미 세트를 sim-only store 로 분리 (§6.2). ingredient/container 물리 인스턴스는 shared 로 유지. |
| [src/stores/scoringStore.ts](../../src/stores/scoringStore.ts) | sim-only store 로 재배치 (§6.2). shared runtime 은 이 store 를 참조하지 않는다. practice 측의 로그 모델은 practice adapter 가 별도로 소유한다. |
| [src/router.tsx](../../src/router.tsx) | Phase 2 본 구현 범위 밖. Phase 4 에서 practice 세션 라우트가 `KitchenModeAdapterProvider` 를 사용하게 될 때 함께 수정한다. |

## 5. Risks / Open Questions
- R1 — `useEquipmentStore.equipments` 를 `GameKitchenView` 에서 제거하면 `useShallow` 기반 burner_level 파생 매 렌더 가드가 깨질 수 있다. 본 구현은 shell pass-through 에서 시작하고, store 참조 제거는 점진적으로 수행한다 (§12 롤백 전략).
- R2 — `onRuntimeTick` 을 adapter 로 옮길 때 `stirring_equipment_ids` 는 shared 에 남는다. adapter 가 shared store 를 read-only 로 참조하되, shared 는 adapter 를 import 해서는 안 되는 비대칭 경계가 §9.1 로 성립한다.
- R3 — `SessionResultOverlay`, `RejectionPopup`, `WokBlockedPopup` 은 shared shell 소유인지 sim overlay 소유인지 최종 확정 필요. 본 초안은 sim overlay 로 가정하되 Phase 2 본 구현 PR 에서 확정.
- R4 — `panelToStateIdMap`/`wokContentsMap` 이 shared selection/mapping 으로 승격될지, sim adapter 의 view-model 로 남을지 Phase 2 micro-decision.
- OQ1 — `HudModel`/`OverlayModel` 의 구체 필드는 SHARED_SHELL_BOUNDARY_APPENDIX §4.1 이 원칙만 제시. Phase 2 본 구현 PR 에서 확정.
- OQ2 — `useKitchenModeAdapter()` 가 `null` 을 반환할 때 consumer 의 fallback 정책(throw vs silent vs boundary-guard) — Phase 2 본 구현에서 결정.

## 6. Verification
이번 task 수준의 검증은 기존 runtime 동작을 건드리지 않았음을 증명하는 것이다.

- `npm run build` — skeleton 9 파일이 파이프라인에 포함되어도 baseline build pass.
- `npx tsc --noEmit` — skeleton 타입 에러 0. 신설 공개 심볼(`KitchenModeAdapter`, `KitchenModeAdapterProvider`, `useKitchenModeAdapter`, `createSimModeAdapter`, `createPracticeModeAdapter`, `SharedKitchenShell`, `SharedKitchenHudSlots`) 이 barrel 을 통해 export 되는지 컴파일 수준에서 확인.
- `npm run lint` — skeleton 파일 lint pass. `any`/`@ts-ignore`/`eslint-disable` 0 건. inline zustand selector filter/map 0 건.
- 심볼 기준 no-wiring 검증 (경로 문자열이 아니라 심볼로 검증해야 barrel import·별칭·심볼 직접 참조까지 잡힌다):
  - `rg -n "SharedKitchenShell|SharedKitchenHudSlots|KitchenModeAdapterProvider|useKitchenModeAdapter|createSimModeAdapter|createPracticeModeAdapter" src --glob '!src/components/game/shared-shell/**' --glob '!src/lib/kitchen-mode/**'` → 0 건. 대상 심볼 6 종(shell 2 + context 주입 2 + factory 2) 어느 것도 기존 runtime/page/router/hook/store 에 나타나면 안 된다.
  - `rg -n "\bKitchenModeAdapter\b" src --glob '!src/lib/kitchen-mode/**'` → 0 건. 타입 재정의/재-export 금지.
  - `rg -n "\bLocationKey\b" src --glob '!src/lib/kitchen-mode/**'` → 0 건. `LocationKey` 는 `src/lib/kitchen-mode/KitchenModeAdapter.ts` 단일 정의 (ENGINE_SPEC_APPENDIX §3.1 + §3.3).
  - `rg -n "as any|@ts-ignore|eslint-disable" src/components/game/shared-shell src/lib/kitchen-mode` → 0 건 (`docs/rules/forbidden.md`).
  - `rg -n "from '.*components/admin" src/components/game/shared-shell` → 0 건 (admin↔game 격리).
- `@self-reviewer` 가 요구사항 충족·금지사항 위반 여부·extra_changes 여부를 확인.
- `docs/worker/LAST_SESSION.md` 에 이번 task 결과 기록 (`docs/worker/LEARNINGS.md`, `docs/worker/MISTAKES.md` 는 새 발견이 있을 때만 갱신).

—

이 문서로 Gate A 의 4 결정이 고정된다. 본 구현은 승인 이후 별도 지시서로 착수한다.
