# KitchenFlow 시뮬레이터 — 개발·수정 지침서

> **이 문서의 목적**: Claude Code가 기능을 추가·수정할 때 반드시 지켜야 할 원칙과 자주 틀리는 패턴을 정리한 참조 문서다. 작업 전에 반드시 읽어라.

---

## 0. 작업 전에 체크리스트

작업을 시작하기 전 반드시 아래를 확인한다.

- [ ] `KitchenFlow_프로젝트지침_v2.md` 최신본을 읽었는가
- [ ] 이 지침서를 읽었는가
- [ ] 수정하려는 영역의 **원칙 섹션**을 확인했는가
- [ ] 물리법칙·DB 제약에 위배되는 작업인지 확인했는가 → 해당 시 **먼저 사용자에게 확인**

---

## 1. 기술 스택 & 폴더 구조

### 스택
| 역할 | 선택 |
|------|------|
| 프런트 프레임워크 | React 18 + TypeScript + Vite |
| 상태관리 | Zustand |
| 드래그앤드롭 | @dnd-kit |
| 백엔드 | Supabase (PostgreSQL + RLS) |
| 배포 | Netlify |

### 폴더 구조 규칙
```
src/
  components/       # UI 컴포넌트
    game/           # 게임 화면 전용
    admin/          # 어드민 전용
    shared/         # 공용
  stores/           # Zustand 스토어 (런타임 상태)
  hooks/            # 커스텀 훅
  lib/
    supabase.ts     # Supabase 클라이언트 (단일 인스턴스)
    physics/        # 물리엔진 순수 함수들
    recipe/         # 레시피 판별 로직
  types/            # TypeScript 타입 정의
    db.ts           # DB 스키마 타입 (자동생성 금지, 수동 유지)
    game.ts         # 런타임 상태 타입
  pages/            # 라우팅 단위 페이지
```

---

## 2. 절대 원칙 (위반 시 사용자 확인 필요)

### 원칙 1 — 물리엔진은 클라이언트 전용
**런타임 물리 상태(웍 온도, action_history 누적 등)는 Zustand에서만 계산한다.**
세션이 진행되는 동안 매틱 Supabase에 write하지 않는다.
DB write는 세션 종료 시점에만 일괄 저장한다.

```typescript
// ✅ 올바름 - Zustand 스토어에서 처리
usePhysicsStore.getState().tickWok(equipmentId)

// ❌ 금지 - 매 tick마다 DB write
await supabase.from('game_equipment_state').update({ wok_temp: newTemp })
```

### 원칙 2 — 히트박스 좌표는 비율값(0~1)
`area_definitions`의 x, y, w, h는 **부모 이미지 기준 0~1 비율**이다.
절대로 px 값으로 저장하거나, px로 변환한 값을 DB에 쓰지 않는다.
렌더링할 때만 `비율 × 이미지 DOM 크기`로 변환한다.

```typescript
// ✅ 올바름 - 렌더링 시 변환
const pxX = area.x * imageRect.width
const pxY = area.y * imageRect.height

// ❌ 금지 - DB에 px 저장
{ x: 320, y: 180, w: 64, h: 64 }
```

### 원칙 3 — navigate는 FK로 참조
`area_definitions.navigate_zone_id`는 `kitchen_zones.id` (UUID FK)다.
`zone_key` 문자열로 참조하면 안된다.

```typescript
// ✅ 올바름
navigate_zone_id: '3f2a...'   // kitchen_zones.id UUID

// ❌ 금지
navigate_zone_id: 'fold_fridge_1'  // zone_key 문자열
```

### 원칙 4 — 재료 상태는 action_history로 판별
재료 인스턴스에 `status: 'cooked'` 같은 별도 상태 컬럼을 추가하지 않는다.
레시피 판별은 항상 `action_history`의 actionType + seconds 누적 값으로 계산한다.
경우의 수가 무한하기 때문에 상태를 열거할 수 없다.

### 원칙 5 — 그릇 묶음은 assigned_order_id로
그릇(game_container_instances)의 묶음 처리는 `assigned_order_id`가 동일한 것으로 자동 판별한다.
별도의 `bundle_pair_id`, `group_id`, 더블클릭 UI 등을 추가하지 않는다.

### 원칙 6 — equipment는 히트박스가 아니라 컴포넌트
`area_type = 'equipment'`인 히트박스는 단순 드롭존이 아니다.
배치 시 해당 장비(WokComponent, FryingBasketComponent 등)가 렌더링되고 물리법칙이 즉시 작동한다.
화구·튀김기 본체는 이미지로만 존재하며 장비 컴포넌트(웍·튀김채)가 그 위에 올라가는 구조다.

---

## 3. DB 테이블별 수정 규칙

### area_definitions — 히트박스
- 4가지 연결 FK(`ingredient_id`, `container_id`, `navigate_zone_id`, `equipment_type`) 중 **반드시 하나는 not null**이어야 한다. CHECK constraint 존재.
- `area_type`과 연결 FK는 반드시 일치해야 한다.

| area_type | not null이어야 하는 필드 |
|-----------|------------------------|
| ingredient | ingredient_id |
| container | container_id |
| navigate | navigate_zone_id |
| equipment | equipment_type + equipment_index |

- 시점이동 버튼(left/right/turn)은 고정 UI 버튼이므로 DB에 저장하지 않는다.

### game_ingredient_instances — 재료 인스턴스
- `location_type`에 따라 **딱 하나의 위치 FK만** 채운다. 나머지는 null.
- CHECK constraint가 걸려 있다. 여러 위치를 동시에 채우면 DB 오류.

| location_type | 채울 필드 | null로 둘 필드 |
|---------------|-----------|----------------|
| zone | zone_id | equipment_state_id, container_instance_id |
| equipment | equipment_state_id | zone_id, container_instance_id |
| container | container_instance_id | zone_id, equipment_state_id |
| hand | (모두 null) | — |
| disposed | (모두 null) | — |

### game_equipment_state — 장비 상태
- `(session_id, equipment_type, equipment_index)` UNIQUE 제약. 세션당 동일 장비 중복 생성 불가.
- 게임 시작 시 `area_definitions`의 equipment 히트박스를 기준으로 레코드 생성.
- 웍 필드(`wok_status`, `wok_temp`, `burner_level`)는 웍에만, 튀김채 필드는 튀김채에만, MW 필드는 MW에만 사용.

### game_container_instances — 그릇 인스턴스
- `assigned_order_id`는 처음에 null이고 사이드바 드롭 → 주문 선택 팝업 완료 후 채워진다.
- `is_complete`는 레시피 판별 통과 시 true. `is_served`는 서빙 버튼 누를 때 true.

---

## 4. Zustand 스토어 설계 규칙

런타임 상태는 아래 스토어로 분리한다. 하나의 스토어에 모든 상태를 몰아넣지 않는다.

| 스토어 | 역할 |
|--------|------|
| `useSessionStore` | 현재 세션 ID, 플레이어, 주문 큐 |
| `usePhysicsStore` | 장비 상태 (웍 온도·상태, 튀김채 위치, MW 잔여시간) |
| `useIngredientStore` | 재료 인스턴스 전체 목록 + 위치 추적 |
| `useContainerStore` | 그릇 인스턴스 + assigned_order_id |
| `useViewportStore` | 현재 보이는 zone, 시점 오프셋, 왼쪽 사이드바 zone |

**물리엔진 tick은 `usePhysicsStore` 내부에서만 실행한다.**
컴포넌트에서 직접 `setInterval`로 상태를 변경하지 않는다.

---

## 5. 드래그앤드롭(@dnd-kit) 규칙

### DragSource(드래그 시작점) 타입
| 타입 | 설명 |
|------|------|
| `hitbox-ingredient` | ingredient 히트박스 → 재료 인스턴스 생성 |
| `hitbox-container` | container 히트박스 → 그릇 인스턴스 생성 |
| `equipment-content` | 웍·튀김채 안의 재료 → 그릇으로 이동 |
| `container-ingredient` | 그릇 안 재료 → 이동 (추후 기능) |

### DropTarget(드롭 목적지) 타입
| 타입 | 허용 DragSource |
|------|----------------|
| `right-sidebar` | `hitbox-container` |
| `wok` | `hitbox-ingredient`, `hand-ingredient` |
| `frying-basket` | `hitbox-ingredient`, `hand-ingredient` |
| `microwave` | `hitbox-ingredient`, `hand-ingredient` |
| `container-instance` | `equipment-content` |
| `hand-bar` | `hitbox-ingredient` |

**허용되지 않은 조합은 드롭을 무효 처리한다.** 드롭 시 아무 변화 없어야 한다.

---

## 6. 좌표계 변환 규칙

히트박스 렌더링 시 항상 아래 순서를 따른다.

```typescript
// 1. 이미지 DOM 크기를 ResizeObserver로 추적
const [imageRect, setImageRect] = useState<DOMRect | null>(null)

// 2. 렌더링 시 비율 → px 변환
function ratioToPx(area: AreaDefinition, rect: DOMRect) {
  return {
    left:   area.x * rect.width,
    top:    area.y * rect.height,
    width:  area.w * rect.width,
    height: area.h * rect.height,
  }
}

// 3. 어드민 편집기에서 마우스 이벤트 → 비율로 저장
function pxToRatio(pxX: number, pxY: number, rect: DOMRect) {
  return {
    x: pxX / rect.width,
    y: pxY / rect.height,
  }
}
```

---

## 7. 레시피 판별 로직 규칙

레시피 판별은 `src/lib/recipe/` 내 순수 함수로만 구현한다.
컴포넌트나 스토어에 판별 로직을 직접 작성하지 않는다.

```typescript
// src/lib/recipe/evaluate.ts
export function evaluateContainer(
  ingredientInstances: GameIngredientInstance[],
  recipeIngredients: RecipeIngredient[],
  targetContainerId: string,
  containerTypeId: string,
): EvaluationResult { ... }
```

판별 기준 4가지는 반드시 **모두** 검사한다.
1. `ingredient_id` 일치
2. `quantity` ± `quantity_tolerance` 범위
3. `action_history`에서 required_action_type의 seconds 합산 >= required_duration_min
4. `plate_order` 일치 (같은 값이면 동시 투입으로 간주)

그릇 종류(`target_container_id`)는 `game_container_instances.container_id`와 비교한다.

---

## 8. 웍 물리엔진 규칙

웍 상태 전이는 아래 규칙만 따른다. 임의로 상태를 추가하거나 전이를 생략하지 않는다.

```
clean  ──재료투입 가능──▶  (조리 중)
  ▲                             │
  │ sink 3초 홀드                │ 재료를 그릇/버림
  │                             ▼
  └──────────────────── dirty
                               │
                               │ 온도 초과
                               ▼
                        overheating → burned
```

- **dirty 상태에서는 재료 투입 불가.** 이 규칙은 UI에서 막아야 한다.
- `burner_level`은 0~3. 레벨에 따른 온도 상승 속도는 `src/lib/physics/wok.ts`에서만 정의한다.
- 온도·상태 계산은 1초 단위 tick. `requestAnimationFrame`은 쓰되 1초 경과 여부로 조건 처리한다.

---

## 9. 튀김채 물리엔진 규칙

- `basket_status = 'up'` 상태에서는 action_history가 **절대 누적되지 않는다.**
- 내리기 버튼 → `basket_status = 'down'` → 그때부터 tick 시작.
- 올리기 버튼 → `basket_status = 'up'` → tick 중단. 이미 누적된 값은 유지.

```typescript
// ✅ 올바름
if (basket.status === 'down') {
  accumulateActionHistory(basket.ingredientIds, 'fry', 1)
}

// ❌ 금지 - status 무관하게 누적
accumulateActionHistory(basket.ingredientIds, 'fry', 1)
```

---

## 10. 어드민 vs 게임 분리 원칙

| 구분 | 어드민 | 게임 |
|------|--------|------|
| 히트박스 | 보임 + 편집 가능 | 완전히 투명 (사용자에게 안보임) |
| DB write | 설정 저장 즉시 | 세션 종료 시에만 |
| 주방 이미지 | 업로드 + 크롭 | 읽기 전용 |
| 장비 컴포넌트 | 배치 확인용 미리보기 | 실제 물리엔진 작동 |

어드민 컴포넌트와 게임 컴포넌트는 **절대 공유하지 않는다.**
`src/components/admin/`과 `src/components/game/`은 서로 import하지 않는다.
공용 UI만 `src/components/shared/`에 둔다.

---

## 11. Supabase RLS 규칙

모든 테이블에 RLS가 활성화된다.

| 테이블 그룹 | 접근 정책 |
|-------------|----------|
| `ingredients_master` | 전체 read 허용 (공용 정적 데이터) |
| 설정 계층 (`stores`, `kitchen_zones` 등) | `store_id` 일치 시 read/write |
| 런타임 계층 (`game_sessions`, `game_orders` 등) | `session_id` 소유자만 read/write |

RLS 정책 없이 테이블을 만들지 않는다. 신규 테이블 생성 시 반드시 RLS 정책을 함께 작성한다.

---

## 12. TypeScript 타입 규칙

### DB 타입 (`src/types/db.ts`)
Supabase 자동생성 타입을 그대로 쓰지 않는다. 수동으로 유지하며 프로젝트 지침 문서의 스키마와 항상 동기화한다.

### 런타임 타입 (`src/types/game.ts`)
DB 타입과 런타임 타입을 분리한다. DB에서 불러온 뒤 런타임 타입으로 변환하는 mapper를 둔다.

```typescript
// DB 타입 (스키마 그대로)
type DbIngredientInstance = {
  id: string
  session_id: string
  ingredient_id: string
  location_type: 'zone' | 'equipment' | 'container' | 'hand' | 'disposed'
  action_history: { actionType: string; seconds: number }[]
  // ...
}

// 런타임 타입 (물리엔진에서 사용)
type IngredientInstance = DbIngredientInstance & {
  // 클라이언트 전용 추가 상태 (DB에 없음)
  isCooking: boolean
}
```

### `any` 사용 금지
`any` 타입을 사용하지 않는다. 모르는 타입은 `unknown`으로 받고 타입 가드를 작성한다.

---

## 13. 자주 틀리는 패턴 (금지 목록)

| 패턴 | 이유 | 대안 |
|------|------|------|
| `navigate_zone_id`에 zone_key 문자열 저장 | FK 참조 깨짐 | `kitchen_zones.id` UUID 사용 |
| 히트박스 좌표를 px로 저장 | 화면 크기 대응 불가 | 비율 0~1로 저장 |
| 매 tick마다 Supabase write | 비용·성능 파괴 | Zustand에서만 처리 |
| 재료에 `status` 컬럼 추가 | 경우의 수 무한 | action_history로 판별 |
| `bundle_pair_id`로 그릇 묶기 | 설계 위반 | assigned_order_id 사용 |
| 컴포넌트에서 직접 물리 계산 | 상태 분산 | physics store에서만 |
| dirty 웍에 재료 투입 허용 | 물리법칙 위반 | UI에서 차단 + 스토어에서 검증 |
| basket_status 무관하게 fry 누적 | 물리법칙 위반 | down 상태일 때만 누적 |
| 어드민/게임 컴포넌트 공유 | 관심사 혼선 | shared에만 공용 컴포넌트 |
| `any` 타입 사용 | 타입 안정성 파괴 | 명시적 타입 + 타입 가드 |

---

## 14. 변경 불가 결정 사항

아래는 이미 확정된 설계 결정이다. 변경이 필요하다고 판단되면 **반드시 사용자에게 먼저 확인**한다.

1. **물리엔진은 클라이언트 전용** → DB 실시간 sync 방식으로 변경 불가
2. **좌표는 비율값** → px 방식으로 변경 불가
3. **그릇 묶음은 assigned_order_id** → 별도 그룹 필드 추가 불가
4. **재료 상태는 action_history** → status 컬럼 추가 불가
5. **navigate_zone_id는 UUID FK** → zone_key 문자열 참조 불가
6. **시점이동 버튼은 고정 UI** → DB area_definitions에 저장 불가
7. **equipment 히트박스는 컴포넌트 배치** → 단순 드롭존으로 구현 불가

---

## 15. 개발 순서 권장순

아래 순서로 개발하면 의존성 충돌 없이 진행할 수 있다.

```
Phase 1 — 기반
  1-1. DB 스키마 마이그레이션 (Supabase)
  1-2. 시드 데이터 (샘플 매장 + 계란볶음밥)
  1-3. TypeScript 타입 정의 (db.ts, game.ts)
  1-4. Supabase 클라이언트 + RLS 정책

Phase 2 — 어드민
  2-1. 주방 이미지 업로드
  2-2. 히트박스 편집기 (비율 좌표 저장)
  2-3. 레시피·재료·그릇 관리

Phase 3 — 게임 코어
  3-1. Zustand 스토어 전체 구조
  3-2. 물리엔진 (wok.ts, fryingBasket.ts, microwave.ts)
  3-3. 레시피 판별 (evaluate.ts)

Phase 4 — 게임 UI
  4-1. 뷰포트 + 히트박스 렌더링
  4-2. @dnd-kit 드래그앤드롭 연결
  4-3. 장비 컴포넌트 (Wok, FryingBasket, Microwave)
  4-4. 오른쪽 사이드바 + 주문 배정 팝업
  4-5. 빌지 큐 + 서빙 플로우

Phase 5 — 마무리
  5-1. 세션 종료 시 DB 저장
  5-2. 점수 계산 + 결과 화면
  5-3. RLS 검증
```
