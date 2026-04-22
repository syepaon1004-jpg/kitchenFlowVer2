# Menu Practice Engine Spec Appendix
작성일: 2026-04-21
상태: Working Draft v3
역할: 메뉴연습 판별엔진을 실행계획서 수준으로 고정하기 위한 부록
상위 문서: `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`

## 1. 목적
이 문서는 메뉴연습 판별엔진을 `바로 구현 가능한 규격`에 가깝게 고정하기 위한 부록이다.
고스트 가이드와 step 암묵지는 이 규격 위에서만 자연스럽게 연결될 수 있다.

## 2. 엔진의 핵심 철학
현재 sim 엔진은 `plate_order` 와 `최종 컨테이너 스냅샷` 중심이다.
practice 엔진은 `recipe node`, `current_required_location`, `open_step`, `phase`, `pour 연속 판정`, `legal action 사전 열거` 중심이다.

방향성 고정:
- v1 formal spec은 `전역 step 잠금 규칙` 을 두지 않는다
- v1 formal spec은 `위치별 current_required_location 집합 기반 open_step` 규칙을 사용한다
- 즉 어떤 위치의 lower pending node가 없으면, 그 위치의 higher-step node는 열릴 수 있다
- 구현 단계에서 이 규칙을 임의로 전역 순서 차단 규칙으로 바꾸지 않는다

이 문서에서 추가로 고정하는 예외 규칙:
- `is_deco == true` 인 재료 노드는 `deco-first 차단 규칙` 을 따른다
- deco node는 해당 위치의 첫 성공 배치가 될 수 없다
- 즉 위치별 open_step 철학은 유지하되, deco는 `첫 진입` 에 대해서만 베이스를 요구한다

## 3. 위치 모델
### 3.1 Authoring용 위치 키
authoring 데이터는 추상 `LocationKey` 를 쓴다.

예:
- `wok.main`
- `serving.bowl.main`
- `sink.main`

이 값은 실제 장비 인스턴스 id가 아니라 `세션 시작 시 런타임에 매핑되는 의미적 위치 키` 다.

### 3.2 Runtime용 위치 참조
런타임은 concrete `LocationRef` 를 쓴다.

```ts
type LocationRef =
  | { kind: 'equipment'; equipment_state_id: string }
  | { kind: 'container'; container_instance_id: string };
```

정리:
- `LocationKey` 는 authoring/엔진 비교용
- `LocationRef` 는 실제 씬 이동/배치용

### 3.3 LocationKey -> LocationRef 매핑 규칙
v1에서는 세션 시작 시 `LocationKey -> LocationRef` 매핑을 생성한다.

규칙:
- 이 매핑은 `adapter.boot()` 내부에서 생성한다
- v1에서는 세션 내 불변이다
- v1에서는 authoring된 핵심 조리 위치에 대해 1:1 매핑을 가정한다
- v1에서는 매장당 각 핵심 `LocationKey` 에 단일 concrete 위치가 있다고 가정한다

예:
- `wok.main -> 특정 equipment_state_id`
- `serving.bowl.main -> 특정 container/equipment anchor`

의미:
- 엔진은 `LocationKey` 로 규칙을 계산한다
- 공용 shell은 `LocationRef` 로 실제 강조/이동/배치를 수행한다
- `LegalAction.kind === 'pour'` 가 destination을 location key로 들고 있는 이유는, 실제 concrete 목적지는 이 매핑을 통해 shell이 해석하기 때문이다

## 4. 정적 authoring 모델
### 4.1 재료 노드
- `node_id`
- `ingredient_id`
- `step_no`
- `location_path: LocationKey[]`
- `quantity`
- `is_deco`
- `node_order`

### 4.2 액션 노드
- `node_id`
- `action_type`
- `step_no`
- `location_key: LocationKey`
- `node_order`

### 4.3 step group
- `step_group_id`
- `display_step_no`
- `title`
- `summary`
- `primary_location_key`
- `node_ids[]`
- `group_order`

핵심 원칙:
- 같은 재료가 두 번 등장해도 서로 다른 node다
- 판별 기준은 ingredient_id가 아니라 node다
- `location_path` 는 판정을 다시 받아야 하는 위치 순서다
- `display_step_no` 와 `step_no` 는 동일할 필요가 없다
- `display_step_no` 는 UI용, `step_no` 는 엔진용이다

## 5. quantity 와 is_deco 처리 원칙
### 5.1 quantity
- 저장한다
- admin과 UI에서 노출한다
- v1 legal gating에는 직접 쓰지 않는다
- 즉 `한 번의 성공한 배치 = 해당 node 충족` 으로 본다

### 5.2 is_deco
- 저장한다
- UI 라벨과 설명에 사용한다
- v1 legal gating에는 `deco-first 차단 규칙` 으로 사용한다

`deco-first 차단 규칙`:
- `is_deco == true` 인 재료 노드는 자신의 현재 요구 위치에 `non-deco 재료 인스턴스` 가 하나도 없으면 legal candidate가 될 수 없다
- 즉 deco node는 해당 위치의 첫 번째 성공 배치가 될 수 없다
- 일단 그 위치에 non-deco 베이스가 하나라도 존재하면, 그 뒤부터는 일반 node와 동일하게 `open_step` 규칙으로 판정한다

`non-deco 재료 인스턴스` 판정 방식:
- target `LocationRef` 에 `actual_location_ref` 가 일치하는 `IngredientInstance` 중
- `bound_node_id` 가 가리키는 `IngredientNode.is_deco == false` 인 인스턴스가 하나 이상 있으면 `non-deco 베이스 존재` 로 본다
- `bound_node_id == null` 인 shared runtime 인스턴스는 practice legality 의 deco 베이스 판정에 사용하지 않는다

정리:
- quantity는 v1 legal gating에서 직접 쓰지 않는다
- is_deco는 `첫 진입 차단` 에만 쓰고, 그 이후의 순서 판단은 여전히 `open_step` 이 담당한다

## 6. 물리 재료 인스턴스 모델
practice는 공용 주방 runtime의 `물리 재료 인스턴스` 를 그대로 사용한다.

```ts
type IngredientInstance = {
  instance_id: string;
  ingredient_id: string;
  actual_location_ref: LocationRef | null;
  quantity: number;
  action_history: ActionHistoryEntry[];
  bound_node_id: string | null;
};
```

규칙:
- 인스턴스는 `배치/붓기` 가 성공한 뒤에만 생성 또는 이동 반영된다
- v1에서 `IngredientInstance` 와 `IngredientNode` 의 바인딩은 1:1 이다
- 하나의 node를 여러 instance가 분담해서 만족시키지 않는다
- 같은 재료라도 node가 다르면 자동 병합하지 않는다

### 6.1 최초 등장 시점
v1에서 재료는 아래 두 단계로 구분한다.

1. `선택 상태`
- 핸드바/공급원에서 사용자가 재료를 집은 상태
- 아직 물리 인스턴스가 아니다
- shared selection/runtime UI가 관리한다

2. `물리 인스턴스 상태`
- 배치가 legal 하게 성공했을 때 비로소 생성된다
- 또는 기존 인스턴스가 legal pour에 의해 이동 반영된다

즉 `집음` 과 `배치 성공` 은 같은 사건이 아니다.
practice와 sim 모두 이 생성 규칙을 공유하고, 차이는 `배치 성공 여부를 무엇으로 판정하느냐` 에 있다.

## 7. 런타임 상태 모델
### 7.1 재료 노드 런타임
- `node_id`
- `bound_instance_id: string | null`
- `actual_location_ref: LocationRef | null`
- `current_required_index`
- `current_required_location_key`
- `phase_satisfied`
- `is_complete`

### 7.2 액션 노드 런타임
- `node_id`
- `location_key`
- `is_complete`

### 7.3 세션 파생 상태
- `open_step_by_location_key`
- `legal_actions`
- `open_step_group_ids`
- `primary_open_step_group_id`
- `pending_transfer_payloads`
- `rejection_reason`

## 8. 초기 상태 규칙
세션 시작 시 모든 재료 노드의 초기값은 아래와 같다.

- `bound_instance_id = null`
- `actual_location_ref = null`
- `current_required_index = 0`
- `current_required_location_key = location_path[0]`
- `phase_satisfied = false`
- `is_complete = false`

세션 시작 시 모든 액션 노드의 초기값은 아래와 같다.

- `is_complete = false`

액션 노드는 `phase_satisfied` 개념을 쓰지 않는다.

## 9. 용어 정의
- `actual_location_ref`: 재료가 물리적으로 실제로 있는 위치
- `current_required_location_key`: 엔진이 다음 판정을 받아야 한다고 보는 의미적 위치
- `phase_satisfied`: 현재 요구 위치에서 이번 phase 진입을 이미 통과했는지
- `is_complete`: 더 이상 다음 위치 판정이 남아 있지 않은지
- `open_step(L)`: 위치 L에서 현재 허용되는 최소 번호
- `phase close`: 위치 L에서 현재 요구 재료와 액션이 모두 충족된 상태
- `transfer payload`: source에 실제로 있으면서, 다음 판정은 destination에서 받아야 하는 미완료 재료 집합

## 10. 열린 번호 계산
위치 `L` 의 열린 번호는 아래처럼 계산한다.

`open_step(L) = min(
  재료 노드 중 current_required_location_key == L 이고 phase_satisfied == false 인 노드의 step_no,
  액션 노드 중 location_key == L 이고 is_complete == false 인 노드의 step_no
)`

반환 타입:

```ts
type OpenStep = number | null;
```

규칙:
- 후보가 하나도 없으면 `null`
- `open_step(L) === null` 이면 그 위치에서는 새 legal action이 없다
- 비교식은 `open_step(L) !== null && node.step_no === open_step(L)` 으로 해석한다

## 11. 재료 투입 판정 절차
재료 `X` 를 위치 `L` 에 넣으려 할 때 아래 순서로 판정한다.

1. 후보 노드 집합을 찾는다
조건:
- `ingredient_id == X`
- `current_required_location_key == L`
- `phase_satisfied == false`

2. `open_step(L)` 를 계산한다

3. `open_step(L) === null` 이면 거절한다

4. 후보 중 `step_no == open_step(L)` 인 노드만 남긴다

5. 남은 후보 중 `is_deco == true` 인 노드는 아래 조건을 추가로 만족해야 한다
- target `LocationRef` 에 이미 배치된 non-deco 재료 인스턴스가 하나 이상 존재
- 만족하지 못하면 해당 후보는 제거된다

6. 둘 이상이면 `node_order` 오름차순으로 첫 번째 노드를 선택한다

7. 통과 시 아래를 반영한다
- `bound_instance_id = 새 재료 인스턴스 id`
- 생성된 `IngredientInstance.bound_node_id = 이번에 통과한 node_id`
- `actual_location_ref = target LocationRef`
- `phase_satisfied = true`
- 마지막 위치면 `is_complete = true`

### 11.8 거절 사유 매핑
- 단계 1: `ingredient_id == X` 인 노드가 전혀 없으면 `no_candidate_node`
- 단계 1: `ingredient_id == X` 인 노드는 있으나 `current_required_location_key == L` 인 노드가 없으면 `wrong_required_location`
- 단계 1: `ingredient_id == X` 와 `current_required_location_key == L` 은 맞지만 `phase_satisfied == false` 인 노드가 없으면 `duplicate_phase_entry`
- 단계 3: `open_step(L) === null` 이면 `step_not_open`
- 단계 4: `step_no == open_step(L)` 인 후보가 없으면 `step_not_open`
- 단계 5: deco 필터에서 모든 후보가 탈락하면 `deco_requires_base`
- `duplicate_phase_entry` 는 v1 에서 실제 반환 코드로 사용한다. reserved code가 아니다

## 12. 액션 판정 절차
액션 `A` 를 위치 `L` 에서 수행할 때 아래 순서로 판정한다.

1. 후보 액션 노드를 찾는다
조건:
- `action_type == A`
- `location_key == L`
- `is_complete == false`

2. `open_step(L)` 를 계산한다

3. `open_step(L) === null` 이면 거절한다

4. 후보 중 `step_no == open_step(L)` 인 노드만 통과한다

5. 둘 이상이면 `node_order` 오름차순으로 첫 번째 노드를 선택한다

6. 통과 시 아래를 반영한다
- `is_complete = true`

### 12.7 거절 사유 매핑
- 단계 1: `action_type == A` 이고 `location_key == L` 인 미완료 노드가 없으면 `no_candidate_action`
- 단계 3: `open_step(L) === null` 이면 `action_not_open`
- 단계 4: `step_no == open_step(L)` 인 후보가 없으면 `action_not_open`

## 13. 위치 phase 종료와 전진
위치 `L` 의 phase는 아래 조건이 동시에 참일 때 닫힌다.

1. `current_required_location_key == L` 인 재료 노드 중 `phase_satisfied == false` 가 없다
2. `location_key == L` 인 액션 노드 중 `is_complete == false` 가 없다

phase가 닫히면 아래를 수행한다.

1. `current_required_location_key == L` 이고 아직 다음 위치가 남아 있는 재료 노드를 찾는다
2. 각 노드에 대해 `current_required_index += 1`
3. `current_required_location_key` 를 다음 위치로 바꾼다
4. `phase_satisfied = false` 로 되돌린다
5. `actual_location_ref` 는 바꾸지 않는다

## 14. 붓기 판정 절차
붓기 `S -> D` 는 한 번의 물리 이동이지만, 판정은 목적지에서 연속 처리한다.

### 14.1 사전 차단
아래 중 하나라도 참이면 붓기를 거절한다.

1. `current_required_location_key == S` 이고 `phase_satisfied == false` 인 재료가 남아 있다
2. `location_key == S` 이고 `is_complete == false` 인 액션이 남아 있다

사전 차단 거절 사유:
- 14.1-1 에 걸리면 `pour_source_phase_not_closed`
- 14.1-2 에 걸리면 `pour_action_pending`

### 14.2 payload 구성
아래를 모두 만족하는 재료 노드를 모은다.

- `actual_location_ref` 가 source `LocationRef` 와 일치
- `current_required_location_key == D`
- `is_complete == false`

이 집합이 이번 붓기로 목적지에서 새로 판정돼야 하는 `transfer payload` 다.

### 14.3 연속 판정
1. payload를 `step_no`, `node_order` 오름차순으로 정렬한다
2. destination `D` 에 대해 하나씩 가상 투입 시뮬레이션을 한다
3. 이 가상 시뮬레이션은 11절의 재료 투입 판정 절차를 재사용하며, `deco-first 차단 규칙` 을 포함한다
4. 각 노드는 그 순간의 `open_step(D)` 와 같아야 통과한다
5. 하나라도 막히면 전체 붓기를 거절한다
6. 전부 통과하면 실제 이동을 커밋한다

커밋 결과:
- 각 payload 노드의 `actual_location_ref = destination LocationRef`
- 각 payload 노드의 `phase_satisfied = true`
- 마지막 위치면 `is_complete = true`
- 이후 `D` 의 phase 종료 여부를 다시 검사한다

### 14.4 empty-payload pour 와 완료 노드 이동
payload 가 비어 있어도, source 안에 물리적으로 이동 가능한 완료 재료 인스턴스가 하나 이상 있으면 empty-payload pour 는 허용된다.
이 경우 목적지 legality 판정은 수행하지 않고, 완료 재료 인스턴스만 물리적으로 destination 으로 이동시킨다.
이 이동은 destination 의 `open_step` 을 소비하지 않는다.
예시 1 의 `wok.main -> serving.bowl.main` 이동은 이 메커니즘을 따른다.

empty-payload pour 거절 사유:
- payload 가 비어 있고 source 안에 이동 가능한 완료 재료 인스턴스도 없으면 `pour_no_movable_instances`

### 14.5 payload가 아닌 완료 노드
source 안에 이미 완료된 재료는 물리적으로는 같이 이동할 수 있다.
하지만 목적지의 열린 번호를 소비하지 않는다.

### 14.6 동일 step_no tie-breaker
payload 안에 동일 `step_no` 노드가 여러 개 있으면 `node_order` 오름차순으로 판정한다.

### 14.7 pending_transfer_payloads
`pending_transfer_payloads` 는 저장 전용 상태가 아니라 파생 상태다.

계산 규칙:
- 각 source location ref에 대해
- `actual_location_ref == source`
- `current_required_location_key != source_key`
- `is_complete == false`
인 노드를 모아 source별 payload 후보를 만든다

`enumerateLegalPourActions()` 는 이 파생 상태를 사용해 legal pour 후보를 만든다.

### 14.8 붓기 실패 사유 매핑
- 14.1 사전 차단 실패는 위 사전 차단 거절 사유를 따른다
- 14.3 연속 판정 중 destination virtual placement 가 `step_no` 불일치로 막히면 `pour_step_not_open`
- 14.3 연속 판정 중 destination virtual placement 가 `deco-first 차단 규칙` 에 걸리면 `pour_deco_requires_base`
- 14.4 empty-payload pour 조건을 만족하지 못하면 `pour_no_movable_instances`

## 15. legal action 사전 열거
고스트 가이드와 HUD는 시도 판정 함수가 아니라 `사전 열거 함수` 를 사용한다.

```ts
type LegalAction =
  | { kind: 'place'; ingredient_id: string; location_key: string; step_no: number; node_id: string }
  | { kind: 'action'; action_type: string; location_key: string; step_no: number; node_id: string }
  | { kind: 'pour'; source_location_ref: LocationRef; destination_location_key: string; payload_node_ids: string[] };
```

필수 함수:

```ts
getOpenStep(locationKey): number | null
enumerateLegalPlaceActions(): LegalAction[]
enumerateLegalActionNodes(): LegalAction[]
enumerateLegalPourActions(): LegalAction[]
enumerateLegalActions(): LegalAction[]
```

원칙:
- 고스트 가이드는 `enumerateLegalActions()` 결과만 읽는다
- UI는 숨겨진 규칙으로 추천 행동을 만들지 않는다
- `enumerateLegalPlaceActions()`, `enumerateLegalPourActions()`, `enumerateLegalActions()` 는 11절, 12절, 14절의 판정 절차와 동일한 규칙을 적용하며, `deco-first 차단 규칙` 을 포함한다

## 16. step group 활성 규칙
현재 step은 단수 하나가 아니라 복수일 수 있다.

```ts
open_step_group_ids: string[]
primary_open_step_group_id: string | null
```

계산 규칙:
1. 현재 legal action에 연결된 node들의 step_group을 모은다
2. 중복 제거 후 `open_step_group_ids` 로 저장한다
3. 대표 그룹은 아래 tie-breaker 로 계산한다
   1. 가장 낮은 `display_step_no`
   2. 같으면 현재 포커스 위치와 같은 `primary_location_key`
   3. 같으면 `group_order`

## 17. 가이드 강도 매트릭스
### 17.1 Full
- 대표 legal action 강조
- 소스/목적 위치 강조
- 관련 step 암묵지 자동 확장
- 거절 사유 상세 노출 가능

### 17.2 Hint
- 대표 action 텍스트
- 대상 위치 강조
- 암묵지는 접힌 상태로 유지

### 17.3 Off
- 시각 가이드 없음
- step 목록과 암묵지 패널은 수동 열람만 가능

## 18. 세션 지속성 정책
v1 practice session은 `브라우저 내 활성 세션` 기준으로 동작한다.

- 새로고침/재접속 시 상태 복원은 v1 범위에서 보장하지 않는다
- 세션 저장/복원은 후속 확장 과제로 남긴다
- 행동 로그는 현재 세션 내 피드백과 분석에 우선 사용한다

## 19. 예시 1: 단일 가지 조리
설명용 레시피:

- 기름 1 `[wok.main]`
- 양파 2 `[wok.main]`
- 양배추 2 `[wok.main]`
- 볶기 3 `[wok.main]`
- 설탕 4 `[wok.main]`
- 다시다 4 `[wok.main]`
- 볶기 5 `[wok.main]`
- 깨 6 `[serving.bowl.main]`, `is_deco = true`

### 19.1 시작 상태
- `open_step(wok.main) = 1`
- `open_step(serving.bowl.main) = 6`

중요:
- 위 규칙은 엔진 방향성으로 고정된 규칙이다
- v1 formal spec은 `전역 순서 차단` 을 추가하지 않는다
- 따라서 어떤 위치에 lower pending node가 없다면 high-number node가 그 위치에서 열릴 수 있다

다만:
- `깨 6` 이 `is_deco == true` 로 authoring 되어 있으므로
- `deco-first 차단 규칙` 때문에 serving bowl에 non-deco 베이스가 생기기 전까지는 legal candidate가 아니다
- 즉 open_step은 6일 수 있어도, 실제 legal place action은 deco 규칙에 의해 차단될 수 있다

반면 `깨 6을 웍에 넣으려는 시도` 는 여전히 wrong location으로 거절된다.

### 19.2 권장 조리 흐름 예시
아래 흐름은 교육적으로 의도한 대표 조리 흐름을 보여주는 예시다.
이 절은 v1 formal spec이 강제하는 유일 경로를 뜻하지 않는다.

1. 웍에서 기름 1 가능
2. 웍에서 양파 2 가능
3. 웍에서 다시다 4 시도는 거절
이유: `open_step(wok.main) = 2`
4. 웍에서 양배추 2 가능
5. 이제 `open_step(wok.main) = 3`
6. 웍에서 볶기 3 가능
7. 이제 `open_step(wok.main) = 4`
8. 웍에서 설탕 4, 다시다 4 가능
9. 둘 다 충족되어야 5가 열린다
10. 웍에서 볶기 5 가능
11. `wok.main` 에 남아 있는 완료 재료 인스턴스들이 empty-payload pour 로 `serving.bowl.main` 으로 이동해 non-deco 베이스가 형성된 뒤, 깨 6 이 legal 이 된다

이 예시가 보여주는 것:
- 같은 번호 그룹은 모두 충족되어야 다음 번호가 열린다
- 액션도 열린 번호 계산에 포함된다
- 위치와 번호가 둘 다 맞아야 허용된다
- deco 재료는 베이스 없이 먼저 시작될 수 없다

## 20. 예시 2: 두 가지 가지를 가지는 조리
설명용 레시피:

- 밥 1 `[serving.bowl.main]`
- 참기름 2 `[serving.bowl.main]`
- 계란 3 `[wok.main, serving.bowl.main]`
- 소금 4 `[wok.main, serving.bowl.main]`
- 후추 4 `[wok.main, serving.bowl.main]`
- 깨 5 `[serving.bowl.main]`, `is_deco = true`

### 20.1 시작 상태
- 계란/소금/후추의 `current_required_location_key = wok.main`
- 밥/참기름/깨의 `current_required_location_key = serving.bowl.main`
- 따라서 `open_step(wok.main) = 3`
- 따라서 `open_step(serving.bowl.main) = 1`

### 20.2 진행
1. 웍에 계란 3 가능
2. 웍에 소금 4, 후추 4 가능
3. 웍 phase가 닫히면 세 노드의 `current_required_location_key = serving.bowl.main` 으로 전진
4. 하지만 `actual_location_ref` 는 아직 웍
5. 그릇에서는 밥 1 가능
6. 그릇에서는 참기름 2 가능
7. 그 상태에서 깨 5 시도는 거절
이유: bowl의 open step은 아직 3으로 열려야 한다
참고: 밥 1 이전 시점이라면 deco-first 차단 규칙으로도 거절된다
8. 웍에서 그릇으로 붓기 시도
9. payload는 계란 3, 소금 4, 후추 4
10. 목적지 그릇에서 `3 -> 4 -> 4` 연속 판정
11. 전부 통과하면 깨 5가 열린다
12. 마지막으로 깨 5 가능

## 21. 불변식
- 같은 재료라도 node가 다르면 절대 자동 병합하지 않는다
- `actual_location_ref` 와 `current_required_location_key` 는 다를 수 있다
- source phase가 닫히지 않으면 붓기할 수 없다
- payload가 아닌 완료 재료는 목적지 열린 번호를 소비하지 않는다
- 액션 노드는 `phase_satisfied` 를 쓰지 않는다
- deco node는 베이스 없이 첫 번째 배치가 될 수 없다
- 고스트 가이드는 엔진이 승인한 legal action만 보여준다
- step 암묵지는 현재 열린 step group만 우선 노출한다

## 22. 남은 검토 포인트
다음 리뷰에서 특히 재검증할 항목은 아래다.

1. deco-first 차단 규칙이 예시 1, 예시 2, legal action 판정과 충돌 없이 연결되는가
2. LocationKey 와 LocationRef 이중 모델이 shared shell과 잘 맞는가
3. legal action 사전 열거와 대표 step group 계산이 충분히 닫혔는가
4. session persistence를 v1 비범위로 두는 판단이 적절한가
