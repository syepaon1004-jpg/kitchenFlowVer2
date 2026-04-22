# Phase 2 Slice Map
작성일: 2026-04-21
상태: Working Draft v1 — planning slice only
추적 ID: TASK-20260421-206
역할: Gate A 이후 Phase 2 본 구현을 slice 단위로 고정하는 상위 기준 문서
상위 문서:
- `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`
- `docs/practice/EXECUTION_PLAN_2026-04-21.md` §12 Phase 2 / Gate A
- `docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md` §9.1 `onRuntimeTick` 계약
- `docs/practice/SIM_REGRESSION_CHECKLIST_2026-04-21.md` §1~§7
- `docs/practice/PHASE2_SKELETON_DRAFT_2026-04-21.md` (Gate A 결정)
- `docs/practice/CURRENT_CODE_INVENTORY_2026-04-21.md`
- `docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md`

이 문서는 실제 코드를 바꾸지 않는다. Phase 2 본 구현을 `단일 회귀 축만 여는 3 슬라이스`로 고정하고, 이후 개별 구현 지시서의 상위 기준이 된다.

## 1. 전제 상태
- TASK-20260421-204 (Phase 2 Skeleton Draft, Gate A 4결정) approved
- TASK-20260421-205 approved
- Phase 2 Gate A closed
- 신설 9파일(shared-shell 3 + kitchen-mode 5 + 문서 1) 배치 완료
- **baseline wiring 반영됨**: `src/pages/GamePage.tsx` 가 이미 `createSimModeAdapter` ([GamePage.tsx:45](../../src/pages/GamePage.tsx#L45), [GamePage.tsx:112](../../src/pages/GamePage.tsx#L112)), `<KitchenModeAdapterProvider>` + `<SharedKitchenShell>` ([GamePage.tsx:1126](../../src/pages/GamePage.tsx#L1126)) 를 참조한다. 즉 shell/adapter 경계는 sim route 에서 이미 "배치 + 첫 주입" 상태이며 runtime 미참조 상태가 아니다
- 그 외 shared runtime 계층(`useGameTick` / `equipmentStore` / `gameStore` / `scoringStore` / `GameKitchenView` / shared-shell 내부 / kitchen-mode 내부) 은 여전히 adapter 심볼을 참조하지 않는다 (Gate A ④ 경계 유효)
- 이번 slice map 은 위 baseline 위에서 다음 본 구현 순서만 고정한다

## 2. 공통 규칙 (Gate A / Slice 1 교훈 재명시)

### 2.1 Adapter instance 안정화
- route-level page에서 adapter는 `useMemo(() => createXxxModeAdapter(), [])` 또는 `useState(() => createXxxModeAdapter())` initializer로 단 1회 생성한다
- `<KitchenModeAdapterProvider adapter={adapter}>` 는 adapter 인스턴스 자체를 Context value 로 받는다 (wrapper object memo 불필요. 실제 구현은 [KitchenModeAdapterContext.tsx:13](../../src/lib/kitchen-mode/KitchenModeAdapterContext.tsx#L13) 참조 — value 는 `adapter` 한 값만 전달)
- 따라서 안정화의 유일한 요구사항은 **`adapter` identity 자체가 렌더 간 동일해야 한다는 것**이다. useMemo / useState initializer 중 하나로 1회 생성만 보장하면 Provider value identity 는 자동 안정
- 렌더마다 새 adapter 인스턴스가 만들어지면 Context consumer 전체가 identity 변경으로 리렌더되고, shared shell 하위 Zustand subscription 이 복원되는 동안 한 프레임 gap 이 생긴다
- 근거: `docs/worker/LEARNINGS.md` 2026-04-19 closure-captured state + functional updater + identity check 3중 가드

### 2.2 Boot effect dependency 한정
- `adapter.boot(sessionContext)` 를 호출하는 useEffect 의 deps 는 `[adapter, sessionContext.store_id, sessionContext.user_id, sessionContext.mode, sessionContext.practice_menu_id, sessionContext.sim_session_id]` 로만 구성한다
- adapter 자체를 deps 에 포함할 경우 2.1 의 안정화가 전제가 된다
- page 렌더 상태(로딩 플래그, UI 토글 등) 는 deps 에 포함하지 않는다. 포함하면 boot 반복 호출로 세션 이중 부팅 위험

### 2.3 same kitchen / same equipment / same tick engine
- 모든 slice는 이 원칙을 재검토 없이 반영한다
- 위치별 `open_step`, `deco-first`, sim 회귀 금지 원칙도 동일

### 2.4 Pass-through 우선
- 각 slice 는 "최소 경계 이동"만 수행한다. 동일 slice 안에서 semantic 변경 금지
- 구독 소유자 이동은 허용, 구독 동작 변경은 다음 slice 로 연기

## 3. SIM_REGRESSION 축 매핑 (Phase 2 범위)
§2 장비/물리 / §5 점수/로그 / §6 UI/HUD 만 Phase 2 에서 연다. 단일 slice 는 위 세 축 중 **정확히 하나만** 연다.

## 4. Slice 순서 고정
- Slice 1: GameKitchenView shell 편입 (§6 UI/HUD) — **closed baseline. TASK-20260421-205 approved 로 완료. 재발행 없음.**
- Slice 2: useGameTick 끝단에 `adapter.onRuntimeTick()` 훅 포인트 추가 (§2 장비/물리) — **다음 발행 대상**
- Slice 3: equipmentStore 에서 scoringStore 결합 제거 → sim adapter 로 이관 (§5 점수/로그)

Slice N 은 반드시 Slice N-1 approved 를 전제 조건으로 둔다. 병렬 slice 지시서 작성 금지. 이 map 발행 시점에서 Slice 1 은 이미 approved 이므로, 실제 이후 발행 지시서는 Slice 2, 3 두 건이다.

---

## 5. Slice 1 — GameKitchenView shell 편입 (closed baseline)

**상태: completed via TASK-20260421-205 — baseline**
이 섹션은 과거 결정을 문서화해 Slice 2·3 의 전제 조건을 고정하기 위한 것이다. 신규 지시서를 발행하지 않는다.

### 목표 (달성됨)
GamePage 가 `<SharedKitchenShell>` 을 통해 GameKitchenView 를 렌더하도록 경계만 이동한다. GameKitchenView 내부 상호작용 의미는 바꾸지 않는다.

### 범위
- `src/pages/GamePage.tsx`: `createSimModeAdapter()` useMemo 생성, `adapter.boot(simSessionContext)` useEffect, `<KitchenModeAdapterProvider>` 로 기존 `<GameKitchenView>` 트리 래핑, 래핑 사이에 `<SharedKitchenShell>` 삽입
- `GameKitchenView` 는 shell children 으로 편입만. 내부 로직 / 구독 0 변경

### 비범위 (건드리지 않는 상·하류 결합)
- `GameKitchenView` 내부의 `useEquipmentStore` / `useGameStore` 직접 구독은 **유지**한다. adapter 경유 전환은 Slice 1 밖이다
- `GameKitchenView` L188 `useEquipmentStore(useShallow(...))` 파생, L236 `useGameStore.getState().ingredientInstances` imperative read, L510–513 `updateEquipment()` 호출 모두 그대로 둔다
- `useGameTick()` / `useOrderGenerator()` / `useRecipeEval()` 호출 지점과 호출 순서 0 변경
- `useScoringStore` 참조 0 변경 (Slice 3 의 영역)
- sim-only overlay (`SessionResultOverlay`, `RejectionPopup`, `WokBlockedPopup`) 는 기존 위치 유지. overlay slot 이관은 본 slice 범위 밖 (PHASE2_SKELETON_DRAFT §5 R3 open question)

⚠️ GameKitchenView 가 내부 `useEquipmentStore` 직접 구독을 **유지**하는 결정이다. 만약 이후 Phase 에서 adapter 경유로 바꾸게 되면, 그 순간 Slice 2/3 의 전제가 깨지므로 **slice 순서 재검토**(특히 Slice 3 의 scoring 이관보다 adapter 실동작이 먼저 필요) 가 요구된다.

### 전제 조건
- TASK-20260421-204, 205 approved
- `src/components/game/shared-shell/*` 및 `src/lib/kitchen-mode/*` 스켈레톤 9파일 존재
- `createSimModeAdapter()` 가 stub 상태에서도 `boot()`, `onRuntimeTick()` (no-op) 시그니처 보유

### 예상 수정 파일 (이력)
- `src/pages/GamePage.tsx` (shell 래핑 삽입만)
- 신설 skeleton 9건은 수정 없음. GameKitchenView / equipmentStore / useGameTick / gameStore / scoringStore 0 touch

### 노출 SIM_REGRESSION 축
- §6 UI/HUD 회귀만 연다. 주방 렌더링 위치감, selection / handbar, minimap, quantity modal, sim rejection popup 의 동작이 변경 전과 동일
- §2, §5 는 닫혀 있어야 한다 (구독 변경 없으므로 정의상 닫힘)

### 필수 leak-check grep
- `rg -n "KitchenModeAdapterProvider|SharedKitchenShell|useKitchenModeAdapter" src/pages/GamePage.tsx` → 각 1회 이상 등장
- `rg -n "KitchenModeAdapter|createSimModeAdapter|createPracticeModeAdapter" src/components/game/GameKitchenView.tsx src/hooks/useGameTick.ts src/stores/equipmentStore.ts src/stores/gameStore.ts src/stores/scoringStore.ts src/components/game/shared-shell` → 0 건 (shared runtime 이 adapter 를 모름)
- `rg -n "plate_order|useOrderGenerator|scoringStore|practiceStore" src/components/game/shared-shell src/lib/kitchen-mode` → 0 건 (shell / adapter 쪽에 sim / practice 전용 로직 누출 없음)
- `rg -n "as any|@ts-ignore|eslint-disable" src/pages/GamePage.tsx src/components/game/shared-shell src/lib/kitchen-mode` → 0 건

### adapter 안정화 규칙 (달성됨, Slice 2·3 의 전제 조건)
- GamePage.tsx 에서 `const adapter = useMemo(() => createSimModeAdapter(), [])` 또는 `const [adapter] = useState(() => createSimModeAdapter())`
- `<KitchenModeAdapterProvider adapter={adapter}>` 는 adapter 인스턴스 자체를 Context value 로 받는다 (wrapper object memo 불필요)
- 안정화의 유일한 요구사항은 **`adapter` identity 자체가 렌더 간 동일해야 한다는 것**

### boot effect dependency 규칙 (달성됨, Slice 2·3 의 전제 조건)
- boot effect deps 는 SessionContext 구성 필드 (store_id, user_id, mode, sim_session_id) 로 한정
- `useRecipeEval` 결과나 UI 플래그를 deps 에 넣지 않는다
- cleanup 에서 adapter 의 teardown hook 미구현 시 빈 cleanup 허용

### 롤백 단위 (이력)
- 본 slice 는 이미 merge 완료이므로 Slice 2·3 이후 문제가 발견되면 이 slice 단위의 roll-back 이 아니라 Slice 2 또는 Slice 3 단위로 되돌린다

---

## 6. Slice 2 — useGameTick 끝단 onRuntimeTick 단일 seam 추가 (다음 발행 대상)

### 목표
SHARED_SHELL_BOUNDARY_APPENDIX §9.1 호출 순서를 코드에 고정한다.

> shared runtime 의 기본 1초 tick **이후**, shell 은 현재 mode adapter 의 `onRuntimeTick()` 을 호출한다.

이 "이후" 를 코드 순서로 보장하려면 별도 interval 2개가 아니라 **동일 scheduler 의 끝단에서 단일 호출**이어야 한다. 독립 interval 을 추가하면 drift / 역전이 가능하므로 계약 위반이다. 이 slice 단계에서 sim adapter 의 `onRuntimeTick()` 은 **no-op** 이다. scoring 이관은 Slice 3 에서 수행한다.

### 범위
- `src/hooks/useGameTick.ts` 수정:
  - 기존 [useGameTick.ts](../../src/hooks/useGameTick.ts) 의 단일 `setInterval` 콜백 끝단 (현재 `checkIdlePenalty(Date.now())` 다음 줄) 에 `onPostTick?.()` 1줄 호출만 추가
  - 훅 시그니처를 `useGameTick(options?: { onPostTick?: () => void })` 로 확장
  - `onPostTickRef` 를 내부에 staleRef 패턴으로 둔다 (기존 `equipmentsRef` / `containerInstancesRef` 와 동일 방식). interval mount-once 효과 내부 closure 가 최신 callback 을 참조하도록 보장
  - **adapter 타입 / 모듈은 import 하지 않는다**. `onPostTick` 은 `() => void` 일반 콜백
- `src/pages/GamePage.tsx` 수정:
  - 기존 `useGameTick()` 호출부를 `useGameTick({ onPostTick: () => adapter.onRuntimeTick() })` 로 바꾼다
  - adapter 는 Slice 1 baseline 에서 이미 useMemo / useState initializer 로 안정화되어 있으므로 identity 안정
  - 호출 순서 보장: 동일 `setInterval` 내부에서 `tickWok → tickBasket → tickMicrowave → tickMix → (stir log) → checkIdlePenalty → onPostTick` 끝단 순서가 코드상 선형화된다

### 왜 별도 interval 이 아닌가 (중요)
- 별도 interval 방식은 두 interval 의 tick time 이 drift 하거나 interleave 될 수 있다
- §9.1 은 "shared physical tick **이후** adapter tick" 을 요구 → 물리 전이와 mode-specific 파생의 순서 불변이 전제
- 단일 scheduler 끝단 콜백은 callback identity 만 Slice 2 로 열고 runtime tick 순서 / 주기 / 셀렉터를 그대로 유지한다

### shared runtime 이 adapter 를 모른다는 경계 유지
- `useGameTick` 은 `KitchenModeAdapter` / `createSimModeAdapter` / `useKitchenModeAdapter` 심볼을 import 하지 않는다
- `onPostTick` 은 `() => void` 시그니처. adapter 타입을 알지 못한다
- adapter 바인딩은 page 계층 (`GamePage.tsx`) 에서만 수행. Gate A ④ 경계가 계속 유지된다

### 비범위
- `useGameTick` 의 `useEquipmentStore` / `useGameStore` / `useScoringStore` import 와 `addActionLog({action_type:'stir'...})` 호출은 **유지**한다. 이들은 Slice 3 의 분리 대상
- `equipmentStore` 의 `useScoringStore` import 와 `wok_burned` 이벤트 발행 유지 (Slice 3)
- tick 주기, stir / boil / fry / microwave / mix 누적 규칙, 온도 전이 규칙 0 변경
- sim adapter 실동작 (scoring 후처리) 0 구현. `onRuntimeTick()` 은 빈 함수 상태 유지
- GameKitchenView / shared-shell / gameStore / scoringStore / createPracticeModeAdapter 0 touch

### 전제 조건
- Slice 1 closed baseline 유효 (TASK-20260421-205 approved)
- GamePage 에서 `adapter` 식별자가 useMemo 또는 useState initializer 로 1회 생성되어 있다 (이미 충족: [GamePage.tsx:112](../../src/pages/GamePage.tsx#L112))
- `createSimModeAdapter().onRuntimeTick` 이 no-op 함수로 존재
- `useGameTick` 의 기존 mount-once `useEffect(..., [])` 패턴이 유지됨 (adapter identity 가 안정적이므로 mount-once 유지 가능)

### 예상 수정 파일
- `src/hooks/useGameTick.ts` (options 파라미터 추가 + staleRef + interval 끝단 1줄)
- `src/pages/GamePage.tsx` (기존 호출부만 `{ onPostTick }` 인자 추가)
- `src/stores/*` 전체 0 touch
- `src/components/game/shared-shell/*` 0 touch
- `src/lib/kitchen-mode/*` 0 touch (createSimModeAdapter 내부 no-op 그대로)

### 노출 SIM_REGRESSION 축
- §2 장비/물리 회귀만 연다. tick 호출 순서 / 주기가 바뀌지 않고 sim 온도 전이 · stir hold · boil 누적 · microwave tick · container mix tick 이 전부 동일해야 한다
- §5 점수/로그는 닫혀 있다 (scoring 경로 0 변경; sim adapter onRuntimeTick 은 no-op)
- §6 은 Slice 1 에서 이미 닫힌 상태 유지

### 필수 leak-check grep
- `rg -n "onRuntimeTick" src` → `src/lib/kitchen-mode/*` 와 `src/pages/GamePage.tsx` 에서만 등장. `useGameTick.ts` 에는 **등장하지 않는다** (callback 이름은 `onPostTick`)
- `rg -n "onPostTick" src/hooks/useGameTick.ts src/pages/GamePage.tsx` → 양쪽 모두 등장
- `rg -n "KitchenModeAdapter|useKitchenModeAdapter|createSimModeAdapter|createPracticeModeAdapter" src/hooks src/stores src/components/game/shared-shell` → 0 건 (shared runtime 계층은 adapter 심볼을 모른다)
- `rg -n "setInterval|setTimeout" src/pages/GamePage.tsx` → Slice 2 이전과 동일 개수 (추가 interval 0)
- `rg -n "setInterval" src/hooks/useGameTick.ts` → 1 건 유지 (추가 interval 0)
- `rg -n "useScoringStore|addScoreEvent|addActionLog|checkIdlePenalty" src/hooks/useGameTick.ts src/stores/equipmentStore.ts` → Slice 1 직후와 동일 개수 (Slice 2 에서 감소 금지 — 감소했다면 Slice 3 범위 침범)
- `rg -n "as any|@ts-ignore|eslint-disable" src/hooks/useGameTick.ts src/pages/GamePage.tsx` → 0 건

### adapter 안정화 규칙 (재명시)
- Slice 1 baseline 의 `adapter` identity 안정화가 그대로 전제다
- `onPostTick` 콜백 자체는 매 렌더 재생성되어도 상관 없다. `useGameTick` 내부 staleRef 패턴이 매 렌더 최신 콜백으로 동기화하므로 interval mount-once 효과는 깨지지 않는다
- GamePage 에서 `onPostTick` 을 `useCallback` 으로 감쌀 필요는 없다 (그러나 감싸도 무해)

### boot effect dependency 규칙 (재명시)
- Slice 1 의 boot effect 는 변경 없음
- `useGameTick` 내부 interval effect 는 `[]` mount-once 유지 (staleRef 로 최신 콜백 접근)
- adapter 자체를 effect deps 에 넣지 않는다

### 롤백 단위
- 단일 commit 롤백: `useGameTick` options 추가분 제거 + GamePage 호출 인자 제거 → Slice 1 baseline 복원
- sim adapter `onRuntimeTick` no-op 상태는 그대로 두어도 무해

---

## 7. Slice 3 — equipmentStore 에서 scoringStore 결합 제거

### 목표
`equipmentStore` 의 `useScoringStore` import 및 `wok_burned` / `addActionLog` 발행을 제거하고, 동일 이벤트를 sim adapter 의 `onRuntimeTick()` 에서 재발행하도록 이관한다. `useGameTick` 안의 `addActionLog({action_type:'stir'...})` 도 같은 경로로 이관한다. shared runtime 은 physical 전이와 burn / done flag 만 남기고, 이벤트 의미는 sim adapter 가 소유한다.

### 범위
- `src/stores/equipmentStore.ts`:
  - `import { useScoringStore }` 제거 ([equipmentStore.ts:7](../../src/stores/equipmentStore.ts#L7))
  - `addScoreEvent({event_type:'wok_burned', ...})` + `addActionLog({action_type:'wok_burned', ...})` 제거 ([equipmentStore.ts:132-147](../../src/stores/equipmentStore.ts#L132))
  - burn 상태 전이 자체 (웍 온도 / 상태 필드) 는 유지
- `src/hooks/useGameTick.ts`:
  - `import { useScoringStore }` 제거 ([useGameTick.ts:4](../../src/hooks/useGameTick.ts#L4))
  - `addActionLog` / `checkIdlePenalty` 구독 제거 ([useGameTick.ts:17-18](../../src/hooks/useGameTick.ts#L17))
  - `addActionLog({action_type:'stir', ...})` 제거 ([useGameTick.ts:57-66](../../src/hooks/useGameTick.ts#L57))
  - `checkIdlePenalty` 호출도 sim adapter 로 이관
- `src/lib/kitchen-mode/createSimModeAdapter.ts`:
  - `onRuntimeTick()` 본체 구현: equipmentStore 와 gameStore 를 read-only 로 조회하여 burn 신규 전이 · stir 지속 · idle penalty 를 감지하고 `useScoringStore.getState().addScoreEvent` / `addActionLog` / `checkIdlePenalty` 를 호출
  - 신규 `burn` 전이 감지는 이전 tick 의 웍 상태 스냅샷을 adapter 인스턴스 내부 필드로 보관

### 비범위
- `equipmentStore` 의 `useGameStore` import 는 유지 (ingredient 물리 상태 조회용 shared 경계 내부)
- `gameStore` 의 `orders` / `plate_order` 분리는 Phase 2 본 구현의 다른 slice 혹은 Phase 3 영역. 이번 slice 는 건드리지 않는다
- `scoringStore` 자체의 배치 변경 (sim-only 디렉터리 이동) 은 하지 않는다. import 관계만 끊는다
- practice adapter 의 `onRuntimeTick` 은 여전히 no-op
- GameKitchenView · shared-shell 파일 0 touch

### 전제 조건
- Slice 2 approved — `useGameTick` 내부 setInterval 끝단에서 `onPostTick?.()` 단일 seam 이 작동하고, page 가 `onPostTick: () => adapter.onRuntimeTick()` 을 전달한다
- sim adapter 가 stateful 이 되어야 하므로 Slice 1 baseline 의 adapter 안정화 (useMemo / useState initializer) 가 필수
- 만약 adapter 가 매 렌더 재생성된다면 burn 전이 스냅샷이 리셋되어 §5 회귀 발생

### 예상 수정 파일
- `src/stores/equipmentStore.ts`
- `src/hooks/useGameTick.ts`
- `src/lib/kitchen-mode/createSimModeAdapter.ts`
- `src/stores/scoringStore.ts` 0 touch (이 slice 는 경로 분리만)
- `src/stores/gameStore.ts` 0 touch

### 노출 SIM_REGRESSION 축
- §5 점수/로그 회귀만 연다:
  - `wok_burned` 이벤트 발생 시점 동일 (burn boolean 전이 tick)
  - `addActionLog({action_type:'stir'})` 발생 빈도 / payload 동일
  - idle penalty 누적 주기 동일
  - score event 합산 결과 동일
- §2 는 닫혀 있다 (physical 전이 규칙 0 변경)
- §6 은 닫혀 있다

### 필수 leak-check grep
- `rg -n "useScoringStore" src/stores/equipmentStore.ts src/hooks/useGameTick.ts` → 0 건
- `rg -n "scoringStore|addScoreEvent|addActionLog|checkIdlePenalty" src/stores/equipmentStore.ts src/hooks/useGameTick.ts` → 0 건
- `rg -n "useScoringStore" src/lib/kitchen-mode/createSimModeAdapter.ts` → 1 건 이상 (이관 완료)
- `rg -n "useScoringStore|scoringStore" src/lib/kitchen-mode/createPracticeModeAdapter.ts` → 0 건 (practice 누출 없음)
- `rg -n "useScoringStore" src --glob '!src/stores/scoringStore.ts' --glob '!src/pages/**' --glob '!src/components/**'` → `src/lib/kitchen-mode/createSimModeAdapter.ts` 에서만 등장
- `rg -n "as any|@ts-ignore|eslint-disable" src/lib/kitchen-mode src/stores/equipmentStore.ts src/hooks/useGameTick.ts` → 0 건

### adapter 안정화 규칙 (재명시)
- 이번 slice 에서 sim adapter 가 stateful 이 되므로 Slice 1 의 useMemo / useState initializer 안정화가 **필수 전제**
- 이전 tick 스냅샷은 ref 가 아닌 adapter 인스턴스 필드로 보관 (동일 인스턴스가 유지되어야 성립)
- practice adapter 는 동일 규칙을 따르되 `onRuntimeTick` 본체는 비워둔다

### boot effect dependency 규칙 (재명시)
- adapter 가 stateful 해져도 boot effect deps 는 SessionContext 필드로 한정 (Slice 1 baseline 유지)
- `useGameTick` 내부 interval effect 는 Slice 2 에서 정한 `[]` mount-once 유지. 최신 `onPostTick` 접근은 staleRef 패턴으로 수행한다 (adapter 를 deps 에 넣지 않는다)
- sim adapter 내부 `onRuntimeTick` 구현은 React effect 가 아니라 일반 함수이므로 deps 개념이 없다. 매 tick 마다 `useEquipmentStore.getState()` / `useGameStore.getState()` / `useScoringStore.getState()` 를 read-only 로 조회한다. scoring store selector 를 tick effect / tick 함수 어느 쪽에도 구독으로 걸지 않는다

### 롤백 단위
- 단일 commit 롤백으로 3 파일을 Slice 2 상태로 복원
- 롤백 후에도 sim adapter 의 `onRuntimeTick` 은 no-op 상태로 돌아가므로 Slice 2 semantics 와 동치

---

## 8. Phase 2 에서 열지 않는 SIM_REGRESSION 축

아래 축은 본 Phase 2 slice map 범위 밖이다. 어떤 slice 에서도 열지 않는다.

- **§3 판별/거절 회귀**: `plate_order` 기반 거절, wrong container, unexpected ingredient, dry-run rejection popup. 이 축은 Phase 3 (practice adapter 도입) 이후 sim / practice 분리가 확정된 뒤에만 다룬다
- **§4 주문/서빙 회귀**: order generator, pending / in_progress 흐름, serve 가능 조건, multi-bowl serve. `gameStore` orders 분리는 Phase 2 본 구현에서도 다른 별도 slice 로 떼어내야 하며, 이번 3 slice 범위 아님. 필요 시 Phase 2 말미 또는 Phase 3 에서 별도 지시서로 발행
- **§7 관리자/피드 회귀**: sim admin authoring, feed 연결. Phase 6 에서 다룸

이 3 축은 이번 map 의 어떤 slice 에서도 leak-check grep 이 **0 변화**여야 한다. Slice N 본 구현 중 이 축에 해당하는 파일 (`orderStore`, `useOrderGenerator`, `admin/*`, `feed/*`) 이 수정되면 즉시 중단하고 scope 재검토를 요구한다.

## 9. 문서 간 연계

- 이 문서는 **상위 기준**이며, 실제 Slice 2 / Slice 3 구현 지시서는 각각 별도 `.harness/tasks/TASK-*.json` 으로 발행된다 (Slice 1 은 이미 TASK-20260421-205 로 closed)
- 각 구현 지시서는 본 문서의 해당 slice 섹션을 inline 인용하여 범위 / 비범위 / leak-check grep 을 그대로 승계한다
- 본 문서가 바뀌면 미착수 slice 지시서는 재발행한다. 이미 approved 된 slice 는 본 문서 수정으로 소급 변경되지 않는다
