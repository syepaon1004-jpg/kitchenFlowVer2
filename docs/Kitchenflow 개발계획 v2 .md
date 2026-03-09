# KitchenFlow 개발 계획서 v2

> **v1 → v2 변경 사항**: 히트박스 shape를 직사각형 전용에서 **polygon(사다리꼴 포함) 지원**으로 확장.  
> DB에 `points` 컬럼 추가. 렌더링 방식 div → SVG polygon으로 변경.  
> 기존 직사각형 데이터는 points=null로 하위 호환 유지.

---

## 확정된 전제 조건

- **뷰포트 이미지**: 파노라마 한 장 (Frame_1.png). 시점이동은 translateX 슬라이드.
- **인증**: Phase 0~5 동안 인증 없음. Phase 6에서 매장코드 + 직원선택으로 구현.
- **물리엔진**: 클라이언트(Zustand) 전용. DB write는 세션 종료 시 1회만.
- **히트박스 좌표**: 비율(0~1). px 절대값 사용 금지.
- **히트박스 shape**: rectangle(x/y/w/h) 또는 polygon(points). points가 있으면 polygon 우선.

---

## 기술 스택

```
프레임워크  : React 18 + TypeScript + Vite
상태관리    : Zustand
드래그앤드롭: @dnd-kit/core + @dnd-kit/utilities
백엔드      : Supabase (PostgreSQL + Storage)
라우팅      : react-router-dom v6
스타일      : CSS Modules (Tailwind 사용 안 함. 클래스 충돌 방지)
배포        : Netlify
```

---

## 확정된 폴더 구조

```
src/
  types/
    db.ts             ← Supabase 테이블 기준 TypeScript 타입 전체
    game.ts           ← 런타임 전용 타입
  lib/
    supabase.ts       ← Supabase 클라이언트 초기화
    hitbox/
      pointInPolygon.ts  ← ray casting 알고리즘 (순수 함수)
      collision.ts       ← @dnd-kit 커스텀 collision detection
  stores/
    gameStore.ts      ← 재료 인스턴스, 그릇 인스턴스, 주문 큐
    equipmentStore.ts ← 웍/튀김채/MW 물리 상태
    uiStore.ts        ← 뷰포트 위치, 사이드바 상태
  components/
    layout/
      BillQueue.tsx
      MainViewport.tsx
      LeftSidebar.tsx
      RightSidebar.tsx
      Handbar.tsx
    game/
      HitboxLayer.tsx   ← SVG 기반 polygon 렌더링
      HitboxItem.tsx    ← polygon / rectangle 분기 렌더링
    equipment/
      WokComponent.tsx
      FryingBasketComponent.tsx
      MicrowaveComponent.tsx
    admin/
      HitboxEditor.tsx       ← polygon 그리기 + 꼭짓점 드래그 편집
      HitboxEditorPanel.tsx  ← 속성 편집
    ui/
      Modal.tsx
      OrderSelectModal.tsx
  hooks/
    useGameTick.ts    ← setInterval(1000ms) 물리 루프
    useRecipeEval.ts  ← 레시피 판별 로직
  pages/
    LoginPage.tsx
    GamePage.tsx
    AdminPage.tsx
  router.tsx
  main.tsx
  App.tsx
```

---

## 히트박스 Shape 설계 (핵심)

### 저장 방식

```
rectangle 모드: points = null, x/y/w/h 사용
polygon 모드:   points = [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], x/y/w/h = bounding box
```

`x/y/w/h`는 polygon 모드에서도 bounding box로 유지한다.
이유: 빠른 범위 검사(broad phase)에 활용하고, 하위 호환성을 유지하기 위해.

### points 좌표 규칙

```
꼭짓점 순서: 좌상(TL) → 우상(TR) → 우하(BR) → 좌하(BL) (시계 방향)
좌표: 부모 이미지 기준 비율값 (0~1)
예시: [[0.1, 0.2], [0.5, 0.2], [0.6, 0.8], [0.05, 0.8]]
```

### 타입 정의

```typescript
// src/types/db.ts AreaDefinition에 추가
export type HitboxPoint = [number, number]; // [x, y] 비율값

export interface AreaDefinition {
  // ... 기존 필드 유지 ...
  points: HitboxPoint[] | null; // null이면 rectangle 모드
}
```

### 렌더링 방식

```tsx
// HitboxItem.tsx
// rectangle과 polygon 모두 SVG로 통일 렌더링

const isPolygon = area.points !== null && area.points.length >= 3;

if (isPolygon) {
  // SVG polygon
  const pointsStr = area.points!
    .map(([x, y]) => `${x * 100}%,${y * 100}%`)  // 비율 → % 문자열
    // SVG는 % 지원 안 함 → viewBox 방식 사용
    .join(' ');
  // → SVG with viewBox="0 0 100 100" + polygon points="x1 y1, x2 y2, ..."
} else {
  // SVG rect (rectangle)
}
```

**SVG % 좌표 처리**: SVG는 `polygon points`에 % 단위를 직접 지원하지 않는다.  
해결책: `viewBox="0 0 1000 1000"` 기준으로 비율값 × 1000으로 변환.

```tsx
// 올바른 SVG polygon 렌더링
<svg
  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
  viewBox="0 0 1000 1000"
  preserveAspectRatio="none"
>
  <polygon
    points={area.points!.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')}
    fill="transparent"
    stroke="none"
    style={{ cursor: 'grab', pointerEvents: 'all' }}
  />
</svg>
```

---

## Collision Detection 설계

### point-in-polygon (ray casting)

```typescript
// src/lib/hitbox/pointInPolygon.ts

export function pointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}
```

### @dnd-kit 커스텀 collision

```typescript
// src/lib/hitbox/collision.ts
// DnD 드롭 시 마우스 좌표가 polygon 안에 있는지 판별

import { CollisionDetection } from '@dnd-kit/core';
import { pointInPolygon } from './pointInPolygon';

export const polygonCollision: CollisionDetection = (args) => {
  // 마우스 위치를 비율 좌표로 변환 후 pointInPolygon으로 판별
  // rectangle은 기존 방식 유지
};
```

---

## 어드민 에디터 히트박스 그리기/편집 설계

### 그리기 모드

```
rectangle 모드 (기본):
  mousedown → startPos 저장
  mousemove → preview rect 렌더
  mouseup   → x/y/w/h 확정, points=null

polygon 모드 (버튼으로 전환):
  click × N → 꼭짓점 순서대로 추가
  더블클릭  → polygon 완성, points 확정
  최소 3개 꼭짓점 필요
```

### 편집 모드 (배치 후)

```
히트박스 클릭 → 선택 상태
  → 꼭짓점에 핸들(원형) 표시
  → 핸들 드래그 → 해당 꼭짓점만 이동
  → 히트박스 본체 드래그 → 전체 이동
  → 이동/리사이즈 모두 이미지 범위(0~1) 클램프
  → mousemove/mouseup은 document 레벨에 등록
    (이미지 밖으로 마우스 이동해도 핸들 끊기지 않음)
  → 저장 버튼 → area_definitions UPDATE (points OR x/y/w/h)
  → 삭제 버튼 또는 Delete 키 → area_definitions DELETE
```

### 핸들 좌표 계산

```typescript
// rectangle 모드: 4개 핸들 = 4개 꼭짓점
const handles = [
  { id: 'tl', x: area.x,         y: area.y          },
  { id: 'tr', x: area.x + area.w, y: area.y          },
  { id: 'br', x: area.x + area.w, y: area.y + area.h },
  { id: 'bl', x: area.x,         y: area.y + area.h  },
];

// polygon 모드: points 배열의 각 꼭짓점
const handles = area.points!.map((pt, i) => ({ id: i, x: pt[0], y: pt[1] }));
```

---

## Phase 0 — 프로젝트 뼈대 ✅ 완료

---

## Phase 1 — 어드민: 히트박스 에디터 (수정 필요)

**기존 Phase 1 기능**: rectangle 히트박스 그리기 + CRUD — ✅ 완료  
**추가 구현 필요**: polygon 지원 + 꼭짓점 드래그 편집

### 추가 구현 항목

#### DB
```sql
ALTER TABLE area_definitions
ADD COLUMN points jsonb DEFAULT NULL;
```

#### src/types/db.ts 수정
```typescript
export type HitboxPoint = [number, number];

export interface AreaDefinition {
  id: string;
  store_id: string;
  zone_id: string;
  label: string;
  area_type: AreaType;
  x: number;
  y: number;
  w: number;
  h: number;
  points: HitboxPoint[] | null;  // ← 추가
  ingredient_id: string | null;
  container_id: string | null;
  navigate_zone_id: string | null;
  equipment_type: EquipmentType | null;
  equipment_index: number | null;
  drag_image_url: string | null;
}
```

#### HitboxEditor.tsx 수정 사항
1. 상단에 모드 전환 버튼 추가: `[사각형] [다각형]`
2. **rectangle 모드**: 기존 드래그 그리기 유지
3. **polygon 모드**: 클릭으로 꼭짓점 추가, 더블클릭으로 완성
4. 선택된 히트박스 꼭짓점에 핸들 표시 (8px 원형)
5. 핸들 드래그 → 꼭짓점 이동 (document 레벨 이벤트)
6. 히트박스 본체 드래그 → 전체 이동
7. 모든 좌표 0~1 클램프

#### 저장 로직 수정
```typescript
// rectangle 모드 저장
{ x, y, w, h, points: null }

// polygon 모드 저장
{
  points: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],
  // bounding box 자동 계산
  x: Math.min(...points.map(p => p[0])),
  y: Math.min(...points.map(p => p[1])),
  w: Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])),
  h: Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])),
}
```

### Phase 1 완료 기준 (수정)
- 기존 rectangle 히트박스 그리기/편집/삭제 동작
- polygon 모드로 전환 후 클릭으로 꼭짓점 추가 가능
- 꼭짓점 핸들 드래그로 shape 수정 가능
- 히트박스 본체 드래그로 이동 가능
- 저장 후 리로드 시 shape 유지
- DB의 points 컬럼에 비율 좌표 배열로 저장 확인

---

## Phase 2 — 게임: 레이아웃 + 히트박스 렌더링 (수정 필요)

**기존 Phase 2**: CSS Grid 레이아웃 + 파노라마 슬라이드 — ✅ 완료  
**추가 구현 필요**: HitboxItem을 div에서 SVG polygon으로 변경

### HitboxLayer + HitboxItem 수정

```tsx
// HitboxLayer.tsx
// SVG를 position absolute로 이미지 위에 오버레이
<svg
  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
  viewBox="0 0 1000 1000"
  preserveAspectRatio="none"
  // pointerEvents none → 각 shape에서 all 처리
>
  {areas.map(area => (
    <HitboxItem key={area.id} area={area} />
  ))}
</svg>
```

```tsx
// HitboxItem.tsx
// polygon과 rectangle 모두 SVG shape으로 렌더링

const HitboxItem = ({ area }: { area: AreaDefinition }) => {
  const isPolygon = area.points !== null && area.points.length >= 3;

  const sharedProps = {
    fill: 'transparent',
    stroke: 'none',
    style: { pointerEvents: 'all' as const, cursor: area.area_type === 'navigate' ? 'pointer' : 'grab' },
    onClick: area.area_type === 'navigate'
      ? () => area.navigate_zone_id && setLeftSidebarZone(area.navigate_zone_id)
      : undefined,
  };

  if (isPolygon) {
    return (
      <polygon
        points={area.points!.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')}
        {...sharedProps}
      />
    );
  }

  return (
    <rect
      x={area.x * 1000}
      y={area.y * 1000}
      width={area.w * 1000}
      height={area.h * 1000}
      {...sharedProps}
    />
  );
};
```

### Phase 2 완료 기준 (수정)
- rectangle 히트박스: SVG rect으로 렌더링
- polygon 히트박스: SVG polygon으로 렌더링
- navigate 클릭 동작 유지
- 게임 모드: fill/stroke 없이 완전 투명

---

## Phase 3 — 게임: DnD 상호작용 (수정 필요)

**기존 Phase 3 설계 유지. collision detection 추가.**

### DnDContext 설정

```tsx
<DndContext
  collisionDetection={polygonCollision}  // ← 커스텀 collision 추가
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
```

### polygonCollision 구현

```typescript
// src/lib/hitbox/collision.ts
export const polygonCollision: CollisionDetection = ({ droppableContainers, pointerCoordinates }) => {
  if (!pointerCoordinates) return [];

  return droppableContainers
    .filter(container => {
      const area = container.data.current?.area as AreaDefinition | undefined;
      if (!area) return false;

      // 마우스 좌표를 컨테이너 기준 비율로 변환
      const node = container.node.current;
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const relX = (pointerCoordinates.x - rect.left) / rect.width;
      const relY = (pointerCoordinates.y - rect.top) / rect.height;

      if (area.points) {
        return pointInPolygon([relX, relY], area.points);
      }

      // rectangle fallback
      return relX >= area.x && relX <= area.x + area.w
          && relY >= area.y && relY <= area.y + area.h;
    })
    .map(container => ({ id: container.id }));
};
```

### 드래그 소스 (useDraggable) — 변경 없음

| 컴포넌트 | id 규칙 | data |
|----------|---------|------|
| ingredient HitboxItem | `ingredient-area-{areaDefinitionId}` | `{ type: 'ingredient', ingredientId, areaId }` |
| container HitboxItem | `container-area-{areaDefinitionId}` | `{ type: 'container', containerId, areaId }` |
| 웍 컴포넌트 | `equipment-wok-{equipmentStateId}` | `{ type: 'equipment', equipmentType: 'wok', equipmentStateId }` |
| 튀김채 컴포넌트 | `equipment-basket-{equipmentStateId}` | `{ type: 'equipment', equipmentType: 'frying_basket', equipmentStateId }` |

### 드롭 목적지 (useDroppable) — 변경 없음

| 컴포넌트 | id 규칙 |
|----------|---------|
| 오른쪽 사이드바 | `right-sidebar` |
| 개별 그릇 | `container-instance-{containerInstanceId}` |
| 웍 컴포넌트 | `equipment-wok-{equipmentStateId}` |
| 튀김채 컴포넌트 | `equipment-basket-{equipmentStateId}` |
| MW 컴포넌트 | `equipment-mw-{equipmentStateId}` |
| 핸드바 | `handbar` |

### onDragEnd 처리 로직 — 변경 없음

```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) return;

  const dragData = active.data.current as DragMeta;
  const dropId = over.id as string;

  if (dragData.type === 'ingredient') {
    const instance: GameIngredientInstance = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      ingredient_id: dragData.ingredientId!,
      quantity: ingredientDefaultQty,
      location_type: 'hand',
      zone_id: null,
      equipment_state_id: null,
      container_instance_id: null,
      action_history: [],
      plate_order: null,
    };

    if (dropId.startsWith('equipment-wok-') || dropId.startsWith('equipment-basket-') || dropId.startsWith('equipment-mw-')) {
      instance.location_type = 'equipment';
      instance.equipment_state_id = dropId.split('-').pop()!;
    } else if (dropId.startsWith('container-instance-')) {
      instance.location_type = 'container';
      instance.container_instance_id = dropId.replace('container-instance-', '');
      instance.plate_order = getNextPlateOrder(dropId);
    } else if (dropId === 'handbar') {
      instance.location_type = 'hand';
    }

    addIngredientInstance(instance);
  }

  if (dragData.type === 'container' && dropId === 'right-sidebar') {
    const containerInstance: GameContainerInstance = {
      id: crypto.randomUUID(),
      session_id: sessionId!,
      container_id: dragData.containerId!,
      assigned_order_id: null,
      is_complete: false,
      is_served: false,
    };
    addContainerInstance(containerInstance);
    openOrderSelectModal(containerInstance.id);
  }

  if (dragData.type === 'equipment' && dropId.startsWith('container-instance-')) {
    const containerInstanceId = dropId.replace('container-instance-', '');
    const equipmentId = dragData.equipmentStateId!;
    const inEquipment = ingredientInstances.filter(i => i.equipment_state_id === equipmentId);
    const currentPlateOrder = ingredientInstances.filter(i => i.container_instance_id === containerInstanceId).length;

    inEquipment.forEach((inst, idx) => {
      moveIngredient(inst.id, {
        location_type: 'container',
        equipment_state_id: null,
        container_instance_id: containerInstanceId,
        plate_order: currentPlateOrder + idx + 1,
      });
    });

    if (dragData.equipmentType === 'wok') {
      updateEquipment(equipmentId, { wok_status: 'dirty' });
    }
  }
};
```

### 드래그 이미지 우선순위

```
1. area_definitions.drag_image_url (개별 지정값)
2. store_ingredients.image_url (fallback)
3. 없으면 기본 아이콘
```

### Phase 3 완료 기준
- ingredient 히트박스 → 웍/그릇/핸드바 드롭 동작
- container 히트박스 → 오른쪽 사이드바 드롭 + 주문 선택 팝업
- 웍 → 그릇 드롭 시 재료 이동 + dirty 상태
- polygon 히트박스에도 드롭 정확히 동작 (point-in-polygon)

---

## Phase 4 — 게임: 물리엔진

**변경 없음. 기존 Phase 4 설계 그대로.**

### useGameTick hook

```typescript
const stateRef = useRef({ ingredientInstances, equipments });
useEffect(() => {
  stateRef.current = { ingredientInstances, equipments };
});

useEffect(() => {
  const id = setInterval(() => {
    const { ingredientInstances, equipments } = stateRef.current;
    equipments.forEach(eq => {
      if (eq.equipment_type === 'wok') tickWok(eq, ingredientInstances);
      if (eq.equipment_type === 'frying_basket') tickBasket(eq, ingredientInstances);
      if (eq.equipment_type === 'microwave') tickMicrowave(eq, ingredientInstances);
    });
  }, 1000);
  return () => clearInterval(id);
}, []);
```

### 웍 물리법칙

```typescript
const tickWok = (wok, instances) => {
  const tempDelta = [0, 5, 10, 20][wok.burner_level ?? 0];
  const coolDown = 3;
  const newTemp = Math.max(0, (wok.wok_temp ?? 0) + tempDelta - coolDown);

  let newStatus = wok.wok_status;
  if (newTemp > 350) newStatus = 'burned';
  else if (newTemp > 250) newStatus = 'overheating';

  updateEquipment(wok.id, { wok_temp: newTemp, wok_status: newStatus });

  if (wok.wok_status === 'clean' && (wok.burner_level ?? 0) > 0) {
    instances.filter(i => i.equipment_state_id === wok.id).forEach(inst => {
      const existing = inst.action_history.find(a => a.actionType === 'stir');
      const newHistory = existing
        ? inst.action_history.map(a => a.actionType === 'stir' ? { ...a, seconds: a.seconds + 1 } : a)
        : [...inst.action_history, { actionType: 'stir' as ActionType, seconds: 1 }];
      moveIngredient(inst.id, { action_history: newHistory });
    });
  }
};
```

임계 온도: 250°C → overheating, 350°C → burned. burned는 씽크 세척 불가.

### 씽크 세척

```typescript
// 웍을 씽크 드롭존에 3초 홀드
// dirty + overheating → clean, wok_temp = 0
// burned → 세척 불가, 버려야 함
```

### Phase 4 완료 기준
- 웍 burner_level 올리면 매초 온도 증가, action_history.stir 누적
- 튀김채 down → fry 누적, up → 중지
- MW 카운트다운 → done 전환
- 씽크 3초 홀드 → clean 전환

---

## Phase 5 — 게임: 레시피 판별 + 서빙

**변경 없음. 기존 Phase 5 설계 그대로.**

### useRecipeEval hook

```typescript
const evaluate = useCallback((containerInstanceId: string) => {
  const container = containerInstances.find(c => c.id === containerInstanceId);
  if (!container?.assigned_order_id) return;

  const order = orders.find(o => o.id === container.assigned_order_id);
  if (!order) return;

  const recipeItems = recipeIngredientCache[order.recipe_id] ?? [];
  const recipe = recipeCache[order.recipe_id];
  const inContainer = ingredientInstances.filter(i => i.container_instance_id === containerInstanceId);

  const matched = recipeItems.filter(req => {
    const inst = inContainer.find(i => i.ingredient_id === req.ingredient_id);
    if (!inst) return false;

    const qtyOk =
      inst.quantity >= req.quantity * (1 - req.quantity_tolerance) &&
      inst.quantity <= req.quantity * (1 + req.quantity_tolerance);

    let actionOk = true;
    if (req.required_action_type) {
      const entry = inst.action_history.find(a => a.actionType === req.required_action_type);
      const seconds = entry?.seconds ?? 0;
      actionOk =
        seconds >= (req.required_duration_min ?? 0) &&
        (req.required_duration_max == null || seconds <= req.required_duration_max);
    }

    const orderOk = inst.plate_order === req.plate_order;
    const containerTypeOk = container.container_id === recipe.target_container_id;

    return qtyOk && actionOk && orderOk && containerTypeOk;
  });

  if (recipeItems.length > 0 && matched.length === recipeItems.length) {
    markContainerComplete(containerInstanceId);
  }
}, [containerInstances, ingredientInstances, orders]);
```

### 서빙 흐름

```typescript
const canServe = (orderId: string) => {
  const related = containerInstances.filter(c => c.assigned_order_id === orderId);
  return related.length > 0 && related.every(c => c.is_complete);
};

const handleServe = (orderId: string) => {
  containerInstances
    .filter(c => c.assigned_order_id === orderId)
    .forEach(c => markContainerServed(c.id));
  updateOrderStatus(orderId, 'completed');
};
```

### Phase 5 완료 기준
- 레시피 조건 충족 시 is_complete 자동 전환
- 서빙 버튼 활성화/비활성화 정확히 동작

---

## Phase 6 — 로그인 + 세션 저장

**변경 없음. 기존 Phase 6 설계 그대로.**

---

## 공통 규칙

### 절대 금지
1. **비율 좌표를 px로 저장하지 말 것.** x/y/w/h와 points 모두 0~1 비율.
2. **물리엔진 상태를 세션 중에 DB에 write하지 말 것.**
3. **navigate_zone_id에 zone_key 텍스트를 저장하지 말 것.** UUID만.
4. **임시 상태 컬럼 추가 금지.** action_history로 모든 상태 판별.
5. **더블클릭 묶기 UI 없음.** assigned_order_id 동일 여부로만 처리.
6. **DB의 image_width/height를 슬라이드 클램프에 사용하지 말 것.**
   렌더링된 img.offsetWidth를 사용할 것.

### 주의 사항
- `plate_order`: 그릇에 담기는 순서. 현재 그릇 내 재료 수 + 1로 자동 부여.
- action_history에 같은 action_type은 하나만 존재. find 후 업데이트.
- `equipment_state_id`는 game_equipment_state.id (UUID). equipment_index 혼동 금지.
- 재료 인스턴스는 드롭 성공 후에만 생성. 드래그 시작 시 생성 금지.
- polygon 모드에서 points의 bounding box를 x/y/w/h로 함께 저장.
- mousemove/mouseup은 document 레벨에 등록 (핸들 드래그 끊김 방지).

---

## DB 변경 이력

| 버전 | 변경 내용 | SQL |
|------|----------|-----|
| v1 | 초기 스키마 | 001_kitchen_flow_schema.sql |
| v1 | 시드 데이터 | 002_seed_data.sql |
| v2 | drawer_fridge zone 재구성 | 별도 실행 완료 |
| v2 | points 컬럼 추가 | `ALTER TABLE area_definitions ADD COLUMN points jsonb DEFAULT NULL;` |

---

## 현재 시드 데이터 상태

| 항목 | 상태 |
|------|------|
| 매장 | TEST01 (테스트주방) |
| kitchen_zones | 13개 (main_kitchen 1 + fold_fridge 4 + drawer_fridge 8) |
| store_ingredients | 7종 |
| containers | 2종 |
| recipes | 1개 (계란볶음밥) |
| recipe_ingredients | 어드민 배치 후 입력 |
| area_definitions | 어드민 에디터로 직접 배치 |

Storage 파일명 규칙: **영문 소문자 + 언더스코어만 허용. 공백/한글/대문자 금지.**

---

_최종 업데이트: Phase 1 polygon 지원 추가_