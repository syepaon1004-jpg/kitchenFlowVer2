# Current Code Inventory For Practice Re-Architecture
작성일: 2026-04-21
상태: Working Draft v1
역할: 실행계획서 작성 전에 현재 코드에서 무엇이 공용 주방 후보이고 무엇이 sim 전용인지 ground truth 기준으로 정리하는 문서
상위 문서: `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`

## 1. 목적
이 문서는 `무엇을 공용 주방으로 추출할 수 있는가`, `무엇이 sim 전용인가`, `무엇이 practice 임시 구현의 대체 대상인가`를 코드 기준으로 정리한다.

## 2. 핵심 관찰
현재 코드는 이미 `주방 표면`, `장비 컴포넌트`, `장비 상태 store`, `장비 tick`, `sim rules` 가 한데 묶여 있다.
따라서 practice를 같은 주방에서 돌리려면 아래 둘을 먼저 분리해야 한다.

1. 공용 주방 runtime
2. sim 전용 rules / order / scoring logic

## 3. 공용 주방 후보
### 3.1 메인 주방 표면
파일:
- `src/pages/GamePage.tsx`
- `src/components/game/GameKitchenView.tsx`

관찰:
- `GamePage.tsx` 는 현재 주방 세션의 최상위 조립자다
- `GameKitchenView.tsx` 는 실제 장면, 장비 배치, 클릭 상호작용, placed container 렌더링, HUD slot을 가진다

의미:
- practice는 이 표면을 버리고 별도 텍스트 화면으로 갈 수 없다
- 다만 현재는 sim 로직과 결합되어 있으므로 분리가 필요하다

### 3.2 장비 컴포넌트
파일:
- `src/components/equipment/WokComponent.tsx`
- `src/components/game/GameKitchenView.tsx`

관찰:
- `GameKitchenView.tsx` 는 `WokComponent` 같은 장비 컴포넌트를 직접 사용한다
- 장비 조작 UI는 현재 sim 화면의 일부가 아니라 공용 주방 조작 표면의 일부다

의미:
- practice 전용 장비 컴포넌트를 따로 만들지 않는 방향이 맞다

### 3.3 장비 상태 store
파일:
- `src/stores/equipmentStore.ts`

관찰:
- 장비 목록
- 세척 중 장비 set
- stir 중 장비 set
- 웍-싱크 상태 연결
- 장비 업데이트
- 장비 tick

의미:
- 공용 주방 runtime의 중심 store 후보다

### 3.4 주방 물리/시간 경과 엔진
파일:
- `src/hooks/useGameTick.ts`
- `src/stores/equipmentStore.ts`
- `src/lib/physics/wok.ts`
- `src/lib/physics/fryingBasket.ts`
- `src/lib/physics/microwave.ts`

관찰:
- 1초 interval 기반 tick
- 장비별 시간 경과 처리
- container mix tick
- stir/fry/microwave action history 누적

의미:
- practice도 이 엔진을 공유해야 한다
- practice 전용 물리엔진을 따로 만들면 계획서와 어긋난다

## 4. sim 전용 결합 지점
### 4.1 주문 생성
파일:
- `src/hooks/useOrderGenerator.ts`

의미:
- practice에서는 제거 대상

### 4.2 plate_order 기반 판별
파일:
- `src/hooks/useRecipeEval.ts`
- `src/lib/recipe/evaluate.ts`

의미:
- practice와 공유 불가
- rules adapter 경계로 분리해야 한다

### 4.3 점수와 서빙
파일:
- `src/stores/scoringStore.ts`
- `src/pages/GamePage.tsx`

의미:
- practice에서는 목적이 다르므로 sim 전용 경계로 남겨야 한다

### 4.4 game session 조립
파일:
- `src/pages/GamePage.tsx`

의미:
- 현재는 공용 주방과 sim 전용 로직이 같은 페이지에 있다
- 실행계획서에서는 이를 `shared kitchen session shell` 과 `sim session adapter` 로 나누는 방향이 필요하다

## 5. practice 임시 구현의 대체 대상
파일:
- `src/pages/practice/PracticePage.tsx`
- `src/pages/practice/PracticeMenuPage.tsx`
- `src/pages/practice/PracticeSessionPage.tsx`
- `src/stores/practiceStore.ts`
- `src/lib/practice/*`

관찰:
- 현재 practice 세션은 텍스트 중심 별도 화면이다
- 같은 주방 플레이 표면을 쓰지 않는다

의미:
- browse/admin 일부는 재사용 가능할 수 있으나
- session 화면은 최종형이 아니라 대체 대상으로 봐야 한다

## 6. 실행계획서에서 반드시 다뤄야 할 경계
1. `GamePage` 에서 공용 주방 shell과 sim 전용 세션 로직을 분리하는 방법
2. `GameKitchenView` 가 직접 참조하는 store 의존성을 어떻게 adapter화할지
3. `useEquipmentStore` 와 `useGameTick` 를 practice에서도 그대로 재사용할 수 있는지
4. practice session이 sim 물리엔진을 공유하면서도 sim 판별엔진은 호출하지 않게 만드는 방법
5. practice 임시 세션 UI 중 무엇을 폐기하고 무엇을 메타/authoring 자산으로 재사용할지

## 7. 현재 코드 기준 확정 문장
- 현재 주방 장면은 `GameKitchenView` 에 있다
- 현재 장비 컴포넌트는 practice가 공유해야 하는 대상이다
- 현재 장비 물리/틱 엔진은 `useEquipmentStore + useGameTick + physics libs` 조합이다
- practice의 차별점은 장비가 아니라 rules adapter와 학습 레이어다
- sim regression을 막으려면 공용화는 가능하지만 semantics는 바꾸면 안 된다

## 8. 다음 문서 의존성
이 문서 다음에는 아래가 필요하다.

1. Flow contract appendix
2. UI state mapping appendix
3. Execution plan
