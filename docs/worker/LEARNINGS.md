# KitchenFlow — 학습 기록

> Claude Code가 세션마다 누적하는 프로젝트 학습 기록.
> 세션 시작 시 읽고, 작업 중 발견/패턴을 기록하고, 50줄 초과 시 압축한다.
> 포맷: `## YYYY-MM-DD — 한 줄 요약` + 본문 1~3줄.

---

## 2026-04-22 — practice route 에 `useGameTick` 도입 금지: equipmentStore reset 부재로 stale tick 위험
- `src/stores/equipmentStore.ts` 에는 reset API 가 없어 sim 세션 이후 남은 `equipments`/`containerInstances` 가 다른 경로에서도 그대로 tick 된다.
- practice adapter `onRuntimeTick` 은 no-op 인데 tick 루프만 추가하면 shared runtime 의 burn/stir/mix 가 practice route 에서 실제로 돌 수 있다(사용자는 아무것도 시작 안 했는데 웍이 타는 식).
- adapter 계약상 `onRuntimeTick` seam 은 유지하되, practice route 는 tick 루프 자체를 연결하지 않는다. 진짜로 필요해지면 practice-owned reset 경계를 먼저 만든 뒤 연결한다.

## 2026-04-22 — vitest `environment: 'node'` + `.test.ts`-only 환경에서 component drift guard 는 pure helper 분리로 풀기
- 현 `vitest.config.ts` 는 `environment: 'node'` + `include: ['src/**/__tests__/**/*.test.ts']` 이라 `.test.tsx` 컴포넌트 렌더 테스트가 수집조차 안 된다. `@testing-library/react` 도 미설치(`forbidden.md` "확인 없이 패키지 설치/삭제 금지").
- 해결: 컴포넌트의 intent-building 로직을 pure helper(`pickDispatchableLegalAction` / `dispatchLegalAction`) 로 떼어내 `.ts` 파일에 두고 `.test.ts` 에서 mock adapter 로 assertion.
- ESLint `react-refresh/only-export-components` 가 `.tsx` 에 non-component export 를 금지하므로 helper 는 반드시 별도 `.ts` 파일이어야 한다.

## 2026-04-22 — engine reason 세분화 vs adapter preflight: 옵션 A 의 근거
- 번역 gap(`ingredient-mismatch` ↔ `no_candidate_node`+`duplicate_phase_entry`, `no-candidates` ↔ `pour_no_movable_instances`+§14.4)을 adapter preflight 로 중복 구현하면 `computeLegalActions` 과 `try*` 판정이 어긋난다 (stop-line 위반).
- 옵션 A(engine reason 세분화) + 공용 helper(`hasNonDecoBaseAt`/`resolvePlaceBinding`/`collectPourCandidateEntries`)를 택하면 try\* 와 legalActions 가 같은 소스의 같은 함수 호출을 거치므로 drift 가 구조적으로 막힌다.
- adapter 는 reason 번역만 수행(단일 switch)하고 regex/preflight 규칙을 재구현하지 않는다.

## 2026-04-22 — §14.4 empty-payload pour enumerate 는 `(src, tgt)` 쌍 iteration 으로 try\* 와 잠근다
- 기존 `computeLegalActions` pour 는 `!is_satisfied` 인스턴스만 iterate 하므로 §14.4 (payload=[] + satisfied physical) 경로를 enumerate 에서 누락 → tryPour 는 allow, enumerate 는 hide → drift.
- 수정: `state.ingredient_instances` 의 `actual_location_id` 를 source 집합으로 모으고, 각 source × bundle.locations(≠ src) 쌍에 대해 `tryPour()` 를 호출해 allowed 만 push. 엔진 `LegalAction` shape 은 불변 유지, adapter 가 `collectPourCandidateEntries` 빈 결과에서 satisfied instance `node_id` 로 `payload_node_ids` fill-in.
- fixture 크기(locations 5) 에서 pair 상한 20 으로 bounded. 실제 메뉴도 10~15 locations 로 수백 쌍 안쪽.

---

## CSS 3D

## 2026-04-07 — translateZ 후 hit-test는 face 요소에서
- `getBoundingClientRect()`는 perspective가 적용된 조상 아래에서 `translateZ` 변형 후의 투영 rect를 반환한다.
- 따라서 서랍 face/inner처럼 translateZ로 앞으로 나오는 요소를 클릭 감지하려면 컨테이너가 아닌 face/inner 자체에 `data-equipment-id`/`data-click-target`을 부여하고 직접 hit-test 해야 한다.
- 컨테이너만 검사하면 열린 서랍의 시각 위치를 클릭해도 닫히지 않는다.

## 2026-04-07 — translateZ는 length 단위만 받음 → 부모 비율 동기화는 ResizeObserver
- CSS `translateZ()`는 `%`를 지원하지 않는다(길이 단위만). 따라서 "부모 박스 높이만큼 앞으로 나오게" 하려면 픽셀 값을 JS로 측정해야 한다.
- 컨테이너 div에 `useRef` + `useLayoutEffect` + `ResizeObserver`로 `offsetHeight`를 추적하고 `translateZ(${measuredH}px)`로 적용하면 부모 리사이즈/창 리사이즈 모두 자동 반영된다.
- 서랍의 경우 inner는 `rotateX(-90deg)`로 세워지므로 forward 깊이 = 컨테이너 픽셀 높이. face의 `openZ`도 동일 값을 써야 face가 inner 끝에 정확히 안착한다.
- 함수형 렌더 함수에는 hooks를 못 쓰므로 작은 컴포넌트로 분리해야 한다.

## Zustand / 상태관리

## 2026-04-21 — adapter 클로저 baseline 승격은 "첫 호출"이 아니라 "유효 snapshot 확보" 기준
- shared runtime(useGameTick)의 1초 interval은 GamePage mount 즉시 시작되지만 `equipments`는 async effect(Supabase upsert → setEquipments)로 뒤늦게 hydrate된다.
- adapter 클로저에서 prev snapshot을 "첫 호출 시 baseline 캡처"로 승격하면 pre-hydration 빈 Map이 baseline이 되고, hydrate 이후 burned 웍이 신규 burn으로 오판된다.
- 해결: `equipments.length > 0` readiness proxy 사용. pre-hydration 구간은 감지 skip + baseline 승격 skip, hydration 완료 첫 tick에 baseline 1회 승격(감지는 prev===null로 skip), 이후 tick부터 정상 전이 비교.
- equipmentStore 스키마 0 touch + read-only getState()만 쓰는 최소변경 안. adapter identity가 useMemo([])로 mount 생애 동안 안정이어야 클로저 수명이 세션 수명과 일치.

## Supabase / DB

## 2026-04-18 — practice_menus write path: nullable normalization 필수
- `description`, `image_url` 컬럼은 `string | null`이므로, 빈 문자열을 그대로 INSERT/UPDATE하면 read path의 `!= null` 조건과 어긋남.
- 반드시 `trim() || null`로 빈 값을 null로 변환 후 전송해야 한다.

## 빌드 / 타입
(아직 기록 없음)

## Practice Admin

## 2026-04-18 — adminView.ts는 menuView.ts/sessionView.ts와 경계 독립
- adminView.ts 파일 헤더에 "menuView.ts · sessionView.ts 경계 독립: bundle-only로 동작"이 명시됨.
- TACIT_TYPE_LABELS, SENSORY_FIELD_LABELS 등 menuView.ts 상수를 import 불가 → adminView.ts 내에서 ADMIN_ 접두사로 독립 정의 필요.

## 2026-04-19 — 선택 state 교체가 있는 페이지의 in-flight async에서 closure-captured state는 stale
- PracticeAdminPage처럼 `selectedMenuId`가 사용자 선택에 따라 교체되는 페이지에서, 버튼 핸들러 내부 `await` 이후 같은 invocation의 `selectedMenuId`는 그 핸들러가 생성된 렌더의 클로저 값 → 메뉴 전환 감지 불가.
- 방어 패턴: `const selectedMenuIdRef = useRef(selectedMenuId); selectedMenuIdRef.current = selectedMenuId;` (매 렌더 동기화) + 핸들러에서 `const requestMenuId = selectedMenuId` 캡처. await 이후 state 갱신은 `selectedMenuIdRef.current === requestMenuId`로 가드. 리스트/bundle 갱신은 `setBundle(prev => prev.menu.id !== requestMenuId ? prev : ...)` 펑셔널 업데이터로 가드 (prev는 항상 최신).
- `useEffect` 동기화 없이 렌더 본문에서 직접 `ref.current = state` 대입해도 안전 — React 렌더가 commit 전 동기적으로 실행되므로 후속 async callback이 보는 값은 항상 현재.

## 2026-04-19 — delete helper는 "tail" 같은 도메인 개념을 소유하지 말고 caller가 계산한 seq를 받는다
- `deletePracticeNodeLocationPathTailHop({ nodeId, seq })`는 단일 `.delete().eq().eq()`만 수행. tail seq 계산은 페이지가 `target.location_path[length-1].seq`로 수행.
- 이유: 지시서의 "helper 경계 확장 금지" 제약 준수 + helper가 bundle snapshot에 의존하지 않음 → 재사용성/테스트 용이성 유지.
- 반대 접근(helper 내부에서 max seq 쿼리 후 delete)은 race window가 열리고 RPC 수준의 트랜잭션성이 필요해짐 — 이번 slice 제약 위반.

## 2026-04-19 — 최소-row delete 제약 UI는 3중 게이트로 방어
- DB `trg_locpath_min_row` (DEFERRABLE INITIALLY DEFERRED AFTER DELETE)는 `practice_node_location_path` 삭제 시 node당 row ≥1 유지 강제.
- 3계층 방어: (1) 렌더 `locationPathLabels.length > 1` 조건부 버튼, (2) 핸들러 early-exit `target.location_path.length <= 1`, (3) `setBundle` functional updater 내부에서도 `n.location_path.length <= 1` skip.
- 근거: 렌더 조건만 믿으면 메뉴 전환/로컬 race 상황에서 핸들러·setter가 stale한 조건으로 호출될 수 있음.

## 2026-04-19 — 리스트 렌더에서 단일 슬롯 에러는 lastAttemptedId 마커로 스코프
- 리스트 각 행에 붙는 async 버튼이 단일 `error` state를 공유하면, 특정 행 실패 후 모든 행에 에러 메시지가 중복 렌더되는 버그가 발생.
- 해결: `lastTailHopDeleteNodeId: string | null` 마커 state를 핸들러 시작 지점에서 세팅 → 렌더에서 `lastX === item.nodeId && inflightX === null && errorText` 3조건으로 단일 행만 노출. inflight 중 노출 방지로 라벨 전이와 겹치지 않게.
- per-row error map(Map<nodeId, string>)이 더 엄밀하지만 correction 액션처럼 드물게 쓰는 리스트에서는 마커가 더 경제적.

## 2026-04-19 — path 카운트를 보유하지 않는 summary는 삭제/추가 시 불변 유지
- `buildMenuStructureSummary`/`buildAdminIngredientNodeList`는 `location_path`를 label 문자열 생성에만 사용(`adminView.ts:282,475`). hop 개수 필드 없음.
- 따라서 hop append/delete 시 `setSummary` 호출 불필요 — 지시서의 "summary immutability" 제약과 자연스럽게 일치.
- 변경 범위를 좁힐 때는 summary builder의 실제 소비 필드부터 grep 확인 → 불필요한 setSummary 제거.

## 2026-04-19 — update helper는 입력 컬럼만 그대로 update, 자기 자신 제외 중복검증은 caller 책임
- `updatePracticeStepGroupMeta({stepGroupId, displayStepNo, title, summary, primaryLocationId})`는 `.update({...}).eq('id').select(...).single()`만 수행. menu_id는 갱신 대상 아님(불변 키).
- 자기 자신 제외 중복 검증은 페이지에서 `bundle.step_groups.some(g => g.id !== draft.groupId && g.display_step_no === stepNo)`로 처리 → 같은 번호 유지한 채 다른 필드만 수정하는 케이스 안전.
- DB `unique(menu_id, display_step_no)` race 시 catch에서 helper `raise()` 에러 메시지를 inline `editingStepGroupError`로 노출. 메시지 매핑은 caller 영역.
- helper 본문에 정렬/소속/중복 검증을 밀어넣으면 bundle snapshot 의존 + 재사용성 저하. `updatePracticeMenuMeta`와 동일 패턴.

## 2026-04-19 — inline meta 편집의 controlled select는 stale FK를 EditStart에서 ''로 fallback
- `primary_location_id`처럼 별도 테이블에 의존하는 FK를 draft에 그대로 싣으면, 다른 클라이언트가 해당 location을 삭제한 직후 편집 진입 시 React가 "value prop on select matches no option" 경고 → 화면 깨짐.
- `g.primary_location_id != null && bundle.locations.some(l => l.id === g.primary_location_id) ? g.primary_location_id : ''`로 EditStart에서 1회 검증. 사용자는 "(선택 없음)"이 선택된 상태로 편집 진입 → 자연스러운 recovery.
- 이 fallback은 EditStart에서만 필요. Save 시점에도 `bundle.locations.some` 체크가 반복되므로 race 안전.

## 2026-04-19 — summary.groups targeted update는 metadata 필드만 spread로 교체, 카운트 필드는 기존 값 보존
- `StepGroupCoverage`는 `{groupId, displayStepNo, title, summary, nodeCount, textTacitCount, pureMediaTacitCount, linkedMediaCount}`. 메타 편집 후 `groups.map(g => g.groupId === updated.id ? {...g, displayStepNo, title, summary} : g)` spread — 카운트 4종은 그대로 보존, groupId/primaryLocationId(필드 없음)도 영향 없음.
- 상위 `stepGroupCount/tacitItemCount/tacitMediaCount/totalNodes/ingredientNodeCount/actionNodeCount`는 메타 편집 범주 밖 → 미변경.
- `displayStepNo` 변경 시 `groups`를 displayStepNo ASC로 재정렬해야 summary drilldown 순서가 bundle.step_groups 순서와 일치.

## 2026-04-19 — 서버 정렬 read path를 로컬 append 후 유지하려면 클라 재정렬
- `fetchPracticeLocations`는 `order('loc_key')`로 읽음. 생성 성공 후 `setBundle(prev => ...prev.locations, created)`만으로 append하면 정렬 깨짐.
- `.sort((a, b) => a.loc_key.localeCompare(b.loc_key))`로 append 후 재정렬하여 서버 fetch와 동일 순서 유지. 메뉴 재진입 시 fresh fetch와 동일한 UX 보장.

## 2026-04-19 — Supabase JS SDK는 다중 테이블 트랜잭션 없음 → parent→child 순차 insert + 실패 시 수동 롤백
- `practice_recipe_nodes`(parent) + `practice_action_nodes`(child node_id FK) 같은 상속형 쌍은 순차 INSERT 후, 자식 에러 시 부모 `DELETE eq('id', ...)`로 롤백해야 orphan row 방지.
- 롤백 자체도 실패할 수 있으므로 롤백 에러는 swallow, 원본 자식 에러에 `(cleanup ok | cleanup failed: ${rbErr.message})` 주석을 붙여 `raise`. 원인 에러를 롤백 에러가 가리지 않게 함.
- 트랜잭션 필요 시 대안은 Postgres function/RPC이지만 현재 코드베이스에는 RPC 패턴이 없어 수동 롤백이 표준.

## 2026-04-19 — DEFERRABLE INITIALLY DEFERRED 트리거는 순차 INSERT로 우회 불가 → RPC 필수
- `practice_ingredient_nodes`의 T11(`trg_ing_min_path` DEFERRABLE INITIALLY DEFERRED)은 **TX COMMIT 시점**에 `practice_node_location_path` row ≥ 1을 검증. PostgREST/Supabase JS는 HTTP 요청 1건당 TX 1건이라 `.from('practice_ingredient_nodes').insert(...)`만으로는 커밋 시 0 path로 반드시 실패.
- 정답 패턴: plpgsql 함수로 recipe_node → ingredient_node → path를 **동일 함수(=동일 TX) 내에서** INSERT. 함수 종료 후 COMMIT에서 T11이 1 row를 발견 → 통과. 클라이언트는 `supabase.rpc('함수명', {...})`로 호출.
- 함수 signature는 `returns table(...)`로 다중 컬럼 echo가 자연스러움. 클라이언트는 `data[0]` 단일 row를 받아 도메인 VO(`PracticeIngredientNodeWithPath`)로 조립.
- 분리된 `.from(...).insert()` 2회 패턴은 deferred 트리거와 함께 있는 child 테이블에는 사용 금지.

## 2026-04-19 — RPC 반환 payload로 client-side append → "write 성공 + refetch 실패" 애매 상태 제거
- 생성 직후 `fetchPracticeMenuBundle` 재조회 방식은 DB commit 성공 뒤 refetch만 실패해도 UI에 "생성 실패"로 표시되어 사용자가 재시도 → 중복 row 생성 여지.
- RPC가 방금 커밋된 row의 full payload를 `returns table(...)`로 되돌려주면 클라이언트는 재조회 없이 `PracticeIngredientNodeWithPath` 조립 → `bundle.ingredient_nodes`에 append + `summary.*Count` 증분. write 성공과 UI 동기화가 단일 경로.
- 기존 `createPracticeActionNode` 클라-append 패턴과 대칭 → 일관성.

## 2026-04-19 — selectedStore scope fetch는 페이지 전역 error state와 분리해야 다른 read path를 막지 않음
- PracticeAdminPage의 Effect 1(`fetchPracticeMenus`)은 전역 `error` state에 실패를 기록 → 성공 시 메뉴/메타편집/locations/actions/drilldown 모두 열림.
- 같은 Effect에 `fetchStoreIngredientOptions`를 Promise.all로 묶어 전역 `error`에 쓰면 재료 조회 실패 하나로 모든 어드민 read path가 봉쇄. ingredient 생성 섹션에서만 필요한 소스를 페이지 전역 축과 결합하지 말 것.
- 올바른 구조: 별도 Effect(1b) + 전용 loading/error state 3개(`storeIngredientOptions`, `*Loading`, `*Error`). 실패 시 섹션 내부에만 힌트 렌더, 전역 error 미오염.

## 2026-04-19 — 코드베이스 첫 supabase.rpc 호출: 런타임 shape 가드가 필요
- `supabase.rpc(...)`의 `data`는 `unknown`(실질은 Json). any 금지 원칙 상 `typeof data !== 'object' || !Array.isArray(data)` 등 단계별 검사 후 필드별 타입 가드 함수(`isIngredientNodeRpcRow`)로 축소해야 TS 컴파일러가 좁히기 가능.
- 예상 shape과 다르면 `raise(...)`로 에러. 단순 `as Type` 단언은 shape 드리프트 대비 불가.

## 2026-04-20 — effect 파생 state + 비동기 source 교체: 렌더 가드에 identity check 를 effect 와 쌍으로 배치
- `setBundle(new)` 같은 비동기 참조 교체 + `useEffect(() => setDerived(derive(bundle)), [bundle])` 조합 은 effect 가 commit 이후 돌기 때문에, 새 bundle 이 들어온 직후 **한 렌더** 동안 derived state 가 이전 bundle 기반으로 남는다. (`setPreviewEngineState(bootstrapEngineState(bundle))` 케이스 에서 관측)
- 해결: derived state 에 source 참조(`{ bundle, ...derived }`) 를 포함시키고, 렌더 쪽 가드에 `derived.bundle === bundle` identity check 를 추가해 그 프레임 동안 섹션을 숨긴다. effect 가 다음 프레임에 따라잡으면 즉시 정상 렌더.
- 두 장치(effect 로 동기화 + 렌더 identity 가드) 는 쌍으로 작동. effect 하나만으로는 구멍을 막을 수 없다. stale async guard 로 확장하는 것은 비동기 **write** 가 있을 때만 정당화되고, 순수 파생이면 identity check 한 줄로 충분하다.

## 2026-04-19 — summary 같은 파생 state는 bundle 변경 시 functional updater로 동기화 + 같은 requestMenuId 가드 공유
- `bundle.action_nodes` append 시 `summary.actionNodeCount`/`totalNodes`도 같이 증가시켜야 UI 카운트 일치.
- 양쪽 `set*(prev => ...)` 모두 동일한 `requestMenuId`로 `prev.menu.id === requestMenuId`, `prev.menuId === requestMenuId` 가드 → 메뉴 전환 레이스에서 한쪽만 갱신되는 불일치 제거.
- `group[].nodeCount`는 step_group_nodes 기반이라 step group 미연결 신규 노드에는 무관 → 증가시키면 안 됨.

## 2026-04-18 — 지시서 write set에 없는 파일은 Phase 4 학습 파일이라도 extra change
- CLAUDE.md Phase 4가 docs/worker/*.md 갱신을 요구하더라도, 지시서의 승인된 변경 대상에 포함되지 않으면 extra_changes=true로 판정됨.
- 학습 파일 갱신은 /session-end 슬래시 커맨드에서 별도로 수행해야 함.

## 2026-04-21 — "이후" 계약은 별도 interval이 아니라 동일 scheduler 끝단 단일 seam으로 보장
- SHARED_SHELL_BOUNDARY_APPENDIX §9.1 같은 "shared runtime의 기본 tick **이후** adapter의 후처리를 호출한다" 계약을 코드 순서로 보장하려면, 별도 `setInterval`을 하나 더 걸어서는 안 된다. 두 interval은 clock drift와 interleave가 가능해 "이후" 순서가 역전될 수 있다.
- 올바른 패턴: 기존 scheduler의 콜백 끝단(예: `useGameTick` 내부 단일 `setInterval` 콜백의 `checkIdlePenalty(Date.now())` 다음 줄)에 `onPostTick?.()` 1줄만 추가. runtime hook은 adapter 타입/심볼을 import 하지 않고 `() => void` 시그니처의 optional callback만 받는다. adapter 바인딩은 상위 page가 `useGameTick({ onPostTick: () => adapter.onRuntimeTick() })` 로 담당.
- 콜백 identity 안정화는 staleRef 패턴으로 해결한다: hook 내부에 `onPostTickRef = useRef(onPostTick)`를 두고 매 렌더 동기화, interval effect는 `[]` mount-once 유지. 이렇게 하면 adapter를 effect deps에 넣지 않고도 최신 콜백을 참조할 수 있다. "shared runtime은 adapter를 모른다" 경계와 §9.1 순서 보장을 동시에 만족.

## 기타

## 2026-04-18 — display:none 금지 대안: previewBroken state + 조건부 렌더링
- image preview에서 로드 실패 시 `style.display = 'none'`은 금지사항 위반.
- `previewBroken` boolean state + `onError={() => setPreviewBroken(true)}` + JSX 조건부 렌더링(`!previewBroken && <img>`)으로 대체.
- reset 시점: editStart, editCancel, Effect reset, input onChange 총 4곳에서 false로 초기화해야 누락 없음.
