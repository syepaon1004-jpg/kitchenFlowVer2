# Shared Shell Boundary Appendix
작성일: 2026-04-21
상태: Working Draft v1
역할: 공용 주방 shell, mode adapter, store 분할, UI 주입 경로를 실행계획서 수준으로 명시하기 위한 부록
상위 문서: `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`

## 1. 목적
이 문서는 `같은 주방을 공유한다`는 말을 구현 경계로 바꾸기 위한 문서다.
실행계획서가 흔들리지 않게 하려면 공용 shell이 무엇이고, mode adapter가 무엇을 구현해야 하며, store가 어떻게 갈라지는지 먼저 고정해야 한다.

## 2. 목표 구조
최종 구조는 아래 3층이다.

1. Shared Kitchen Runtime
2. Mode Rules Adapter
3. Mode HUD / Overlay Layer

정리:
- Shared Kitchen Runtime은 장면/장비/틱을 담당
- Mode Rules Adapter는 sim 또는 practice의 판별과 의미를 담당
- Mode HUD/Overlay Layer는 화면 노출과 가이드/패널을 담당

## 3. Shared Kitchen Runtime 범위
공용 runtime이 담당하는 것:

- 장면 렌더링
- 장비 컴포넌트
- 씬 클릭/선택
- 장비 상태 tick
- 재료/컨테이너 물리 이동
- action history 누적
- 공통 모달 프레임
- 공통 HUD 앵커

공용 runtime이 담당하지 않는 것:

- recipe legality 판단
- order plate_order 판정
- practice node legality 판단
- 점수 의미
- ghost guide 계산
- step 암묵지 선택

## 4. Rules Adapter 인터페이스
공용 shell은 아래 인터페이스만 본다.

```ts
type KitchenModeAdapter = {
  mode: 'sim' | 'practice';
  boot(sessionContext: SessionContext): Promise<void>;
  getHudModel(): HudModel;
  getOverlayModel(): OverlayModel;
  getOpenStep(locationKey: string): number | null;
  enumerateLegalActions(): LegalAction[];
  tryPlaceIngredient(input: PlaceIntent): ActionResult;
  tryPerformAction(input: ActionIntent): ActionResult;
  tryPour(input: PourIntent): ActionResult;
  onRuntimeTick(): void;
  getCurrentStepGroups(): StepGroupViewModel[];
  getPrimaryStepGroup(): StepGroupViewModel | null;
  getGhostGuide(): GhostGuideModel | null;
  getRejectionModel(): RejectionModel | null;
};
```

원칙:
- 공용 shell은 sim evaluator를 직접 import하지 않는다
- 공용 shell은 practice evaluator를 직접 import하지 않는다
- 오직 adapter 인터페이스만 호출한다

### 4.1 보조 타입 스케치
실행계획서 단계에서 아래 타입을 구체화한다.

```ts
type SessionContext = {
  store_id: string;
  user_id: string | null;
  mode: 'sim' | 'practice';
  practice_menu_id?: string;
  sim_session_id?: string;
};

type PlaceIntent = {
  ingredient_id: string;
  location_key: string;
  location_ref: LocationRef;
};

type ActionIntent = {
  action_type: string;
  location_key: string;
  location_ref: LocationRef | null;
};

type PourIntent = {
  source_location_ref: LocationRef;
  source_location_key: string;
  destination_location_key: string;
  destination_location_ref: LocationRef | null;
};

type ActionResult = {
  ok: boolean;
  rejection_code?: string;
  effects?: string[];
};
```

나머지 view model은 아래 원칙으로 간다.
- `HudModel`: 상단 상태/진행률/모드 정보
- `OverlayModel`: 장면 위 보조 레이어 묶음
- `StepGroupViewModel`: 현재 UI에 노출할 그룹 데이터
- `GhostGuideModel`: 대표 가이드 + 강도 + 강조 대상
- `RejectionModel`: 최근 1건의 거절 정보

## 5. UI 주입 정책
공용 UI 프레임은 공유하되, 모드별 의미는 adapter가 주입한다.

### 5.1 공유 프레임
- 메인 주방 뷰포트
- 선택/핸드바
- 미니맵/네비게이션
- 공통 모달 슬롯
- 공통 HUD 앵커

### 5.2 모드별 주입
- 상단 상태 요약
- 거절 팝업 콘텐츠
- 우선 행동 가이드
- step 패널
- 암묵지 패널
- sim 주문 큐 또는 practice step 타임라인

정리:
- 프레임은 shared
- 콘텐츠 모델은 adapter가 제공

## 6. Store 분할 목표
### 6.1 Shared Runtime Store
공용으로 남겨야 하는 것:

- equipment state
- ingredient/container physical instances
- selection state
- section/camera state
- shared UI primitives

### 6.2 Sim-only Store
sim 전용으로 남겨야 하는 것:

- orders
- plate_order related session state
- scoring
- feed integration
- order generator state

### 6.3 Practice-only Store
practice 전용으로 가져갈 것:

- node runtime state
- legal actions
- open step group state
- ghost guide state
- tacit panel state
- practice-specific logs

## 7. 현재 코드 대비 목표 store 분할표
| 현재 자산 | 현재 성격 | 목표 성격 | 메모 |
|---|---|---|---|
| `equipmentStore` | sim 결합 강함 | shared runtime | 장비 tick/상태 핵심 |
| `gameStore`의 ingredient/container 물리 상태 | sim 결합 | shared runtime로 추출 후보 | 물리 인스턴스는 공용 |
| `gameStore`의 orders/plate_order/session 의미 | sim 전용 | sim-only | practice로 가져가지 않음 |
| `selectionStore` | 사실상 공용 | shared runtime | 주방 표면 공통 |
| `uiStore`의 모달/카메라 일부 | 혼합 | shared primitive + mode overlay로 분리 | |
| `scoringStore` | sim 전용 | sim-only | practice는 다른 로그 모델 |
| `practiceStore` | practice 임시 구현 | practice-only 재정의 | browse/session 분리 필요 |

## 8. Shared Shell 추출 시 금지사항
- shared shell 안에 sim plate_order 의미를 넣지 않는다
- shared shell 안에 practice current_required_location 의미를 넣지 않는다
- shared shell 안에 점수 계산을 넣지 않는다
- shared shell 안에 ghost rule 분기를 넣지 않는다

## 9. sim 회귀 방어선
shared shell 추출 후 아래가 바뀌면 안 된다.

- 장비 작동 방식
- 주문 흐름
- plate_order 거절 방식
- 서빙 가능 조건
- 점수 반영

세부 목록은 `SIM_REGRESSION_CHECKLIST_2026-04-21.md` 에서 관리한다.

## 9.1 onRuntimeTick 계약
shared runtime의 기본 1초 tick 이후, shell은 현재 mode adapter의 `onRuntimeTick()` 을 호출한다.

규칙:
- sim adapter는 주문/점수/idle 등 mode-specific 후처리를 수행할 수 있다
- practice adapter는 필요 시 세션 로그/가이드 갱신용 파생 상태를 갱신할 수 있다
- practice adapter는 shared physical tick을 대체하지 않는다
- physical state 전이는 shared runtime이 담당하고, adapter tick은 mode-specific 파생 상태만 다룬다

## 10. 다음 문서 의존성
이 문서 다음에는 아래가 필요하다.

1. Flow contract appendix
2. UI state mapping appendix
3. Execution plan
