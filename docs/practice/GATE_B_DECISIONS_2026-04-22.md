# Gate B Decisions

작성일: 2026-04-22
상태: Gate B 결정 문서 (planning slice only — Phase 3 본 구현 권한 열지 않음)
추적 ID: TASK-20260422-211
역할: Phase 3 진입 전 닫혀야 하는 5개 축을 실제 코드 ground truth 기준으로 단일 결정 문서에 고정

상위 문서:
- `docs/practice/EXECUTION_PLAN_2026-04-21.md` §12/§13 (Gate A/B)
- `docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md` §4, §9
- `docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md` §3.1–§3.3, §11.8, §12.7, §14.4, §14.8
- `docs/practice/PHASE2_SKELETON_DRAFT_2026-04-21.md` (Gate A 선례)
- `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`
- `docs/practice/CURRENT_CODE_INVENTORY_2026-04-21.md`

이 문서는 Gate A 선례(`PHASE2_SKELETON_DRAFT_2026-04-21.md`)를 모델로 하여 단일 파일 1개로 닫는다. 섹션 구성은 지시서 스펙을 따르며, 문체/밀도/근거-우선 패턴은 선례와 동일하다.

---

## 1. Fixed Invariants

다음 방향성은 Gate B에서 **재검토하지 않는다**. 본 문서는 이를 전제로 한 결정만을 담는다.

- **same kitchen / shared equipment / shared physics-tick** — sim과 practice는 동일한 주방 shell, 동일한 장비 모델, 동일한 1초 physical tick을 공유한다. mode 분기는 adapter 경계에서 수행한다.
- **위치별 `open_step`** — `src/lib/practice/engine/openStep.ts`의 `computeOpenNumber(locationId, state)`가 위치 단위로 "현재 진행 가능한 최소 step"을 계산하고, 전역 step이 아니라 위치 단위 진행을 정통 규칙으로 유지한다.
- **deco-first** — 장식 재료는 base 재료가 해당 위치에 배치된 이후에만 적용 가능하다. 현재 engine은 이 규칙을 산출하지 못하므로 Phase 3에서 신설 대상(§3·§4 참조).
- **sim 회귀 금지** — 본 문서 작업 및 이후 Phase 3 구현 어느 지점에서도 sim 경로 의미를 변경하지 않는다. SHARED_SHELL_BOUNDARY_APPENDIX §6.2/§9.1 경계 유지.
- **text-first practice UI는 최종형 아님** — `src/pages/practice/PracticeSessionPage.tsx` + `formatLegalAction`/`formatFriendlyAction`로 구성된 현재 UI는 shared-kitchen UI 최종 자산으로 **승인하지 않는다**. 최종형은 shared-kitchen 3D overlay.

---

## 2. Current Code Ground Truth Snapshot

본 결정은 다음 5개 코드 축을 직접 읽고 확인한 것을 기반으로 한다. 각 항목은 실제 파일에서 검증한 literal이며, 문서 재인용이 아니다.

### 2.1 `src/lib/practice/engine/*`
- `types.ts` — `PracticeEngineState`, `LegalAction`, `PlaceResult`/`ActionResult`/`PourResult`, `PlaceBlockReason`/`ActionBlockReason`/`PourBlockReason`, `bootstrapEngineState()`, `findInstance()`, `findProgress()`, `getCurrentRequiredLocation()`.
- `openStep.ts` — `computeOpenNumber(locationId, state): number | null`.
- `ingredientAdd.ts` — `tryPlaceIngredient()`. 내부 reason literal: `'no-open-number'` (L22), `'ingredient-mismatch'` (L36), `'location-mismatch'` (L47–48).
- `actionExecute.ts` — `tryExecuteAction()`. 내부 reason literal: `'no-open-number'` (L20), `'action-mismatch'` (L31).
- `pourDryRun.ts` — `tryPour()`. 내부 reason literal: `'source-not-clean'` (L30), `'no-candidates'` (L40), `'dry-run-blocked'` (L54, L73, L76).
- `phaseAdvance.ts` — `runAdvance()`, `advanceLocation()` (reason 없음).
- `legalActions.ts` — `computeLegalActions(state): LegalAction[]`.
- `index.ts` — barrel.

**중요 관찰**: spec-level rejection_code 문자열(`no_candidate_node`, `wrong_required_location`, `duplicate_phase_entry`, `step_not_open`, `deco_requires_base`, `no_candidate_action`, `action_not_open`, `pour_step_not_open`, `pour_deco_requires_base`, `pour_no_movable_instances`)은 engine 코드에 **0건 존재**한다. 스펙 코드 번역은 engine이 아닌 상위 레이어(adapter)에서 수행해야 한다.

### 2.2 `src/lib/practice/runtime.ts`
DB↔engine bridge. `hydrateEngineState(bundle, dbInstances, dbProgress)` / `dehydrateInstances(sessionId, instances)` / `dehydrateProgress(sessionId, progress)` / `computeDerivedData(state): PracticeDerivedData`(legalActions, totalNodes, satisfiedNodes, isComplete). engine에서는 `computeLegalActions`만 직접 import.

### 2.3 `src/stores/practiceStore.ts`
액션/셀렉터: `startSession(menuId, storeId, storeUserId)`, `resumeSession(sessionId)`, `placeIngredient(ingredientId, targetLocationId)`, `executeAction(actionType, locationId)`, `pour(sourceLocationId, targetLocationId)`, `completeSession()`, `abandonSession()`, `reset()`. 책임: bootstrap / resume / persist-queue(`dehydrateInstances` + `dehydrateProgress` → Supabase upsert) / finalize(`updatePracticeSessionStatus`) / reset / engine dispatch / `computeDerivedData` 호출 / session lifecycle(`phase: 'idle' | 'loading' | 'active' | 'completed' | 'abandoned' | 'error'`) 소유. 텍스트 포매팅/한국어 생성 **없음**. engine import: `bootstrapEngineState, tryPlaceIngredient, tryExecuteAction, tryPour`. runtime import: `hydrateEngineState, dehydrateInstances, dehydrateProgress, computeDerivedData`.

### 2.4 `src/lib/practice/sessionView.ts`
순수 view-model calculator: `getCurrentStepGroup(engineState)`, `getNextStepGroup(engineState)`, `buildNextGroupPreview(engineState)`, `buildTacitDetailViewModel(engineState)`, `buildTacitMediaMap(itemIds, bundle)`, `getTacitItemsForGroup(groupId, bundle)`, `getTextTacitItemsForGroup(groupId, bundle)`, `buildLocationLabelMap(locations): Map<string,string>`. 상수: `ACTION_TYPE_LABELS`. 텍스트 포매터(확인됨): `formatLegalAction(action)`(machine-readable `"[배치] id → id"`), `formatFriendlyAction(action, ingredientNames, locationLabels)`(한국어 문장). `"open_step"` / `"deco"` / `"base"` 키워드는 본 파일에 미등장.

### 2.5 `src/pages/practice/PracticeSessionPage.tsx`
full functional UI(placeholder 아님). 렌더: 세션 정보, persist 상태, guide 패널(`'off' | 'hint' | 'full'`), tacit detail, next-step preview, action 버튼 리스트, 완료/중단, 뒤로. import: `usePracticeStore` + `formatLegalAction`, `formatFriendlyAction`, `buildLocationLabelMap`, `pickRepresentativeAction`, `buildTacitDetailViewModel`, `buildNextGroupPreview`. 로컬 상태: `guideIntensity`, `ingredientNames`. 나머지는 store에서 구독.

### 2.6 경계 파일 — `src/lib/kitchen-mode/KitchenModeAdapter.ts` + `createPracticeModeAdapter.ts`
`KitchenModeAdapter` 멤버: `mode`, `boot(sessionContext)`, `getHudModel()`, `getOverlayModel()`, `getOpenStep(locationKey)`, `enumerateLegalActions()`, `tryPlaceIngredient(input)`, `tryPerformAction(input)`, `tryPour(input)`, `onRuntimeTick()`, `getCurrentStepGroups()`, `getPrimaryStepGroup()`, `getGhostGuide()`, `getRejectionModel()`. 주요 타입: `ActionResult = { ok: boolean; rejection_code?: string; effects?: string[] }`, `RejectionModel = { rejection_code: string; at_location_key?: LocationKey; attempted_node_id?: string }`, `LocationKey = string`(단일 정의, 재정의 금지). `createPracticeModeAdapter()`는 완전 skeleton — 모든 멤버가 type-safe 기본값 반환, `stubResult.rejection_code = 'skeleton_stub'`, `src/lib/practice/**` 및 `src/stores/practiceStore.ts` import 0건(의도적, EXECUTION_PLAN §13 Gate B 전제). `throw` 없음.

---

## 3. Gate B Decision Axis 1–5

### Axis 1 — practice adapter 책임 분할

**질문**:
- practice adapter는 `engine/*` 와 `runtime.ts` 위에서 어떤 thin adapter 책임만 소유하는가.
- adapter가 반환할 legal action / rejection / step-group / guide view-model의 경계는 어디까지인가.
- session persistence, page-level formatting, text-first 전용 표현은 어디에 두지 않는가.

**결정**:
- **소유**: (a) `LocationKey ↔ LocationRef` 매핑(adapter.boot 시점 생성, ENGINE_SPEC_APPENDIX §3.3), (b) `engine/computeLegalActions` 결과를 `LegalAction[]`(adapter 계약형) 으로 변환, (c) engine 내부 reason을 spec `rejection_code`로 번역(§4 표), (d) `sessionView.ts`의 VM calculator 결과를 `StepGroupViewModel` / `GhostGuideModel` / `OverlayModel`로 래핑, (e) `tryPlaceIngredient` / `tryPerformAction` / `tryPour` intent를 store action 호출로 위임.
- **비소유**: session persistence(= `practiceStore`), DB write, React 렌더, 텍스트 한국어 생성(`formatLegalAction` / `formatFriendlyAction` 계열은 adapter 비노출), page-level UX state(`guideIntensity` 같은 local UI 상태).
- **identity 안정성**: adapter 인스턴스는 route-level page에서 1회 생성(`useMemo(() => createPracticeModeAdapter(), [])`), `boot()` 완료 후 Provider에 주입. resume/persist 사이클을 거쳐도 adapter identity 변경 없음 — Phase 2 Gate A ②·④ seam 규칙 계승(sim adapter 선례 동일).

### Axis 2 — practiceStore 재사용 범위

**질문**:
- `practiceStore`에 남길 책임은 bootstrap / resume / persist / finalize / reset 중 무엇인가.
- 현재 store가 직접 쥔 rules 계산 / engine 호출 중 무엇을 유지하고 무엇을 adapter 친화 구조로 분리할 것인가.
- adapter와 store의 연결 지점은 어떤 데이터 흐름으로 제한할 것인가.

**결정**:
- **유지**: bootstrap(`startSession` / `resumeSession`) · persist-queue(`dehydrateInstances` + `dehydrateProgress` → Supabase upsert) · finalize(`completeSession` / `abandonSession`, `updatePracticeSessionStatus` 호출 포함) · reset · `engineState` 컨테이너 소유 · `computeDerivedData` 호출 · `phase` 상태 머신.
- **재정비 대상**: engine dispatch(`placeIngredient` / `executeAction` / `pour`)는 store에 유지하되, adapter가 intent 객체를 번역해 store action을 호출하는 단방향 흐름으로 제한한다. store는 **adapter를 import하지 않는다** (Gate A ④ seam 계승).
- **adapter ↔ store 연결**: adapter는 closure로 `usePracticeStore.getState()` + 필요 시 `subscribe` 패턴을 사용한다. sim adapter의 `useScoringStore.getState()` read-only snapshot 패턴(TASK-20260421-208 approved)과 동일한 규약. store는 engine/runtime만 알고, adapter는 store의 **읽기 선택자 + 액션 콜**만 사용.

### Axis 3 — `sessionView.ts` 분리 전략

**질문**:
- 현재 helper 중 Phase 3에서 재사용할 selection / view-model 계산은 무엇인가.
- `formatLegalAction`, `formatFriendlyAction` 같은 text-first formatting 계열은 어떻게 분리/격리할 것인가.
- step / tacit selection helper를 shared-kitchen practice overlay에 재사용하려면 어떤 경계가 필요한가.

**결정**:
- **Phase 3 재사용 확정 (VM calculator)**: `getCurrentStepGroup`, `getNextStepGroup`, `buildNextGroupPreview`, `buildTacitDetailViewModel`, `buildTacitMediaMap`, `getTacitItemsForGroup`, `getTextTacitItemsForGroup`, `buildLocationLabelMap`. adapter가 `StepGroupViewModel` / `OverlayModel`로 래핑해 contract 계약형으로 노출한다.
- **격리 대상 (text-first formatting)**: `formatLegalAction`, `formatFriendlyAction`, `pickRepresentativeAction`, `ACTION_TYPE_LABELS`는 shared-kitchen UI **최종 자산으로 승인하지 않는다**. `PracticeSessionPage.tsx` fallback 한정으로 남긴다. adapter contract 경유 금지.
- **shared-kitchen practice overlay 이식 시 경계**: VM calculator는 "bundle + engineState만 받는 순수 함수" 제약을 지켜 adapter 안에서 직접 호출한다. React 의존 0, 상태 의존 0. 이식 시 파일 이동이 필요하면 경로는 Phase 3 slice에서 확정(본 task에서 확정하지 않음).

### Axis 4 — `PracticeSessionPage.tsx` 취급

**질문**:
- 이 페이지는 Phase 3 동안 어떤 fallback 역할만 유지하는가.
- Phase 3에서 이 페이지에 무엇을 추가 확장하면 안 되는가.
- Phase 4 이전까지 route / bootstrap 관점에서만 남길 최소 책임은 무엇인가.

**결정**:
- **Phase 3 역할**: fallback / transition asset. 확장 대상 아님.
- **금지 (Phase 3 기간 동안)**:
  - 새 UI 기능 추가 금지.
  - store / adapter surface 신규 노출 금지.
  - shared-shell 심볼(`SharedKitchenShell`, `useKitchenModeAdapter`, `KitchenModeAdapterProvider` 등) 사용 금지.
  - text-first formatter 확장 금지(`formatLegalAction`/`formatFriendlyAction` 파생 신설 금지).
- **유지 허용 (Phase 4 이전까지)**: route-level mount, `resumeSession` / `startSession` 부트스트랩 호출, 기존 persist error 표시, 완료/중단 액션 배선 — 현재 코드 그대로 유지. 유지 외 변경이 발생하면 Gate B 위반으로 간주한다.
- **Phase 4 이후**: 삭제 또는 redirect로 축소(본 task에서 확정하지 않음).

### Axis 5 — `rejection_code` 결정 트리

**질문**:
- ENGINE_SPEC §11.8 / §12.7 / §14.8의 코드 집합을 adapter-facing contract로 어떻게 고정할 것인가.
- 현재 engine 내부 reason 집합과 spec-level rejection_code 사이의 translation gap은 무엇인가.
- translation은 어느 레이어에서 수행하고, 어떤 코드는 engine 내부용 reason으로만 남길 것인가.

**결정**:
- **번역 레이어 위치**: adapter 내부. engine은 compact 내부 reason 세트를 유지하며 spec code string을 노출하지 않는다. adapter가 intent kind(place / action / pour)와 engine reason을 함께 받아 `ActionResult.rejection_code` / `RejectionModel.rejection_code`에 spec string을 기록한다.
- **핵심 전제 — 현재 engine reason만으로는 spec code를 완전 복원할 수 없다.** 엔진은 place/action 경로에서 `step_no === openNumber` 좁히기 + `ingredient_id` / `action_type`+`location_id` 매치 + `is_satisfied !== true` 필터를 한 분기에 묶어 실패 여부만 알린다. 즉 engine reason `ingredient-mismatch`는 spec `no_candidate_node`와 `duplicate_phase_entry` 두 경우를, `action-mismatch`는 `no_candidate_action`(엄밀 의미)과 "openNumber는 존재하나 후보가 전혀 없는 구간"을 함께 흡수한다. 이 **translation gap** 자체를 Gate B 산출물로 고정하며, 1:1 매핑을 가정하지 않는다.
- **context-sensitive 매핑 가능 범위**: `'no-open-number'`는 intent kind로 `step_not_open` / `action_not_open` / `pour_step_not_open` 분기(engine이 openNumber === null 지점만 책임). `'location-mismatch'`는 `wrong_required_location`로 1:1. 나머지는 모두 §4 표의 gap 항목. 특히 `'no-candidates'`도 1:1이 아닌 gap으로 처리한다(ENGINE_SPEC §14.4 empty-payload pour branch 미구현 흡수).
- **해소 옵션 (Phase 3에서 선택, Gate B는 택일 확정 없음)**:
  - (A) engine reason 세분화 — 예: `no-matching-ingredient` / `all-satisfied` / `no-matching-action` / `destination-not-open` / `no-movable-instances` 등을 신설.
  - (B) adapter preflight — intent 수용 전에 engine state를 읽어 후보 유무 / `is_satisfied` 상태 / destination open step / source movable 인스턴스 유무를 사전 조사.
- **engine-internal 유지 (user-facing spec code 미노출)**:
  - `'source-not-clean'` — spec 의미와 부분만 중첩되어 단독 spec code로 고정 불가. engine-internal 로그 / 텔레메트리 유지.
  - `'dry-run-blocked'` — 시뮬레이션 중단 래퍼로 내부에 `no-open-number` / `ingredient-mismatch` / `location-mismatch` 어느 branch든 포함 가능. **단일 spec code로 best-fit 매핑을 하지 않는다.** user-facing은 해소 옵션(engine reason 세분화 또는 adapter preflight)이 결정될 때까지 **미해결 translation gap으로 표기**한다. 로그에는 engine reason 원본을 그대로 기록한다.
- **신규 engine 능력 필요 항목**: `deco_requires_base` / `pour_deco_requires_base` — 현재 engine에 deco/base 판별 로직 부재. Fixed invariant(`deco-first`)에 따라 Phase 3에서 engine이 해당 reason을 산출할 수 있도록 규칙을 신설해야 한다. adapter는 engine의 신규 reason을 번역만 한다.

---

## 4. Rejection Code Mapping

| domain | spec section | spec rejection_code | current engine reason/code | translation needed | Phase 3 implication |
|---|---|---|---|---|---|
| ingredient | §11.8 | `step_not_open` | `no-open-number` (place intent, `computeOpenNumber` null) | 1:1 rename (intent 기반) | adapter가 intent kind=place일 때 지정. 단, 본 항목은 "location에 open step이 전혀 없는" 경우만 커버한다 |
| ingredient | §11.8 | `no_candidate_node` | `ingredient-mismatch`에 흡수 (matchingId=0 branch) | gap — 단독 복원 불가. 엔진이 `step_no===openNumber` + `ingredient_id` 매치 + `is_satisfied !== true`를 하나의 필터로 묶어 실패 여부만 알림 | 해소 옵션 (A) engine reason 세분화 (예: `no-matching-ingredient`). (B) adapter preflight로 bundle에서 해당 step의 후보 유무를 사전 조사. Gate B는 택일 확정하지 않음 |
| ingredient | §11.8 | `duplicate_phase_entry` | `ingredient-mismatch`에 흡수 (`is_satisfied` 필터로 silent skip) | gap — 단독 복원 불가 (위 `no_candidate_node`와 동일 branch) | 위 (A)/(B) 해소 옵션에 동반. preflight 방식이라면 `findProgress().is_satisfied` 상태를 adapter가 읽어 분기 |
| ingredient | §11.8 | `wrong_required_location` | `location-mismatch` | 1:1 rename | adapter 단순 매핑 (place intent 한정) |
| ingredient | §11.8 | `deco_requires_base` | 부재 (engine에 deco/base 판별 없음) | 신규 engine 능력 필요 | Fixed invariant `deco-first`에 따라 Phase 3에서 engine이 전용 reason을 산출할 수 있게 규칙 신설. adapter는 번역만 |
| action | §12.7 | `action_not_open` | `no-open-number` (action intent, `computeOpenNumber` null) | 1:1 rename (intent 기반) | adapter가 intent kind=action일 때 지정 |
| action | §12.7 | `no_candidate_action` | `action-mismatch`에 흡수 (find() 실패 branch) | gap — 단독 복원 불가. 엔진이 `step_no`, `action_type`, `location_id`, `is_satisfied`를 하나의 find()에 묶어 실패 여부만 알림 | 해소 옵션 (A) engine reason 세분화. (B) adapter preflight로 후보 유무 사전 조사. Gate B는 택일 확정하지 않음 |
| pour | §14.8 | `pour_step_not_open` | 부재 (엔진은 `tryPour`에서 destination `open_step` 사전 검사를 직접 하지 않음; 내부의 `tryPlaceIngredient` 호출 실패가 `dry-run-blocked`로 래핑되어 도달) | gap — 단독 복원 불가 | 해소 옵션 (A) engine에 destination `computeOpenNumber` 사전 검사 추가. (B) adapter가 pour intent 시 destination open_step을 사전 조사. Gate B는 택일 확정하지 않음 |
| pour | §14.8 | `pour_deco_requires_base` | 부재 | 신규 engine 능력 필요 | Phase 3에서 pour 경로에도 `deco-first` 규칙 신설. adapter는 번역만 |
| pour | §14.8 | `pour_no_movable_instances` | `no-candidates` | gap — 단독 복원 불가. 엔진의 `no-candidates` 분기는 `actual_location_id===source && current_required_location_id===target && !is_satisfied` 후보가 0건일 때 발동한다. 스펙 §14.4는 payload가 비어 있어도 source에 이동 가능한 완료(`is_satisfied=true`) 인스턴스가 있으면 empty-payload pour를 허용하며, 그런 인스턴스가 없을 때만 `pour_no_movable_instances`를 반환한다. 엔진에는 이 "empty-payload pour" branch가 없어 두 경우를 흡수 | 해소 옵션 (A) engine에 §14.4 empty-payload pour branch 추가 후 `no-movable-instances` 전용 reason 분리. (B) adapter가 pour intent 전에 source의 `is_satisfied=true` 인스턴스 유무를 사전 조사. Gate B는 택일 확정하지 않음 |

engine 내부 reason으로 **유지** (user-facing spec code 미노출):
- `'source-not-clean'` — spec 코드와 의미 중첩이 부분만 있어 단독 매핑 불가. engine-internal 로그/텔레메트리 유지.
- `'dry-run-blocked'` — 시뮬레이션 중단 래퍼. 내부에 `no-open-number` / `ingredient-mismatch` / `location-mismatch` 어느 branch든 포함할 수 있어 단일 spec code로 고정 불가. user-facing best-fit 매핑 금지. user-facing은 해소 옵션(engine reason 세분화 또는 adapter preflight)이 결정될 때까지 미해결 translation gap으로 표기. 로그에는 engine reason 원본을 그대로 기록.

---

## 5. Phase 3 Slicing Recommendation (proposal only)

본 문서는 slice 수 / slice map을 **확정하지 않는다**. 아래는 비확정 제안 수준의 관찰이다.

- **관찰**: Gate B 결정이 (A) adapter 래핑, (B) rejection_code 번역 + deco-first 신규 engine 규칙, (C) sessionView VM 재사용 경계, (D) PracticeSessionPage fallback 유지의 4개 독립 축으로 갈라진다.
- **기본 next step은 Phase 3 구현이다.** Gate B 승인 후 별도 planning task(`PHASE3_SLICE_MAP` 등)를 기본 경로로 두지 않는다.
- slice 분할이 필요하다고 판단되는 경우에 한해 구현 중 예외적으로 도입한다. slice 수 / 순서 / 경계는 본 문서에서 확정하지 않는다.

---

## 6. Explicit Non-Goals / Still Blocked

본 Gate B 문서는 다음을 **하지 않는다**:

- practice adapter / store / engine / sessionView / PracticeSessionPage 코드 0 touch (본 task 범위).
- Phase 3 본 구현 지시서 아님.
- slice 수 / slice map 확정 아님.
- `.harness/*.json`, `docs/commander/*` 수정 아님.
- shared shell / kitchen-mode 구현 수정 아님.
- sim 회귀 금지(Fixed Invariant §1) — sim 경로는 본 문서 검토 또는 이후 구현 중 어느 지점에서도 건드리지 않는다.
- text-first practice UI(`PracticeSessionPage.tsx` + `formatLegalAction` / `formatFriendlyAction`)는 최종 shared-kitchen UI 자산으로 **승인하지 않는다**.
- Gate B 결정 중 "해소 옵션 (A)/(B)"의 택일은 본 문서에서 확정하지 않는다. Phase 3 slice 또는 구현 지시서에서 결정.

**Phase 3 진입은 본 Gate B 문서 승인 후 별도 commander 지시서로 부여된다.**

---

이 문서로 Gate B 5개 축이 Code ground truth 기반 결정으로 고정된다. 본 문서 승인 이후 Phase 3 본 구현이 별도 지시서로 착수된다.
