# KitchenFlow 개발 계획서 v1

> **이 문서의 목적**: 클로드 코드가 단계별로 참고하는 지행 문서다.
> 각 Phase는 독립적으로 완결된다. 다음 Phase 시작 전 현재 Phase가 빌드 오류 없이 동작하는지 확인한다.
> 임시방편 패치 금지. 근본 구조가 맞지 않으면 해당 Phase부터 다시 설계한다.

---

## 확정된 전제 조건

- **뷰포트 이미지**: 파노라마 한 장 (Frame_1.png). 시점이동은 translateX 슬라이드.
- **인증**: Phase 0~5 동안 인증 없음. Phase 6에서 매장코드 + 직원선택 팝업으로 구현.
- **물리엔진**: 클라이언트(Zustand) 전용. DB write는 세션 종료 시 1회만.
- **히트박스 좌표**: 비율(0~1). px 절대값 사용 금지.

---

## 기술 스택

```
프런트 프레임워크  : React 18 + TypeScript + Vite
상태관리    : Zustand
드래그앤드롭: @dnd-kit/core + @dnd-kit/utilities
백엔드      : Supabase (PostgreSQL + Storage)
라우팅      : react-router-dom v6
스타일      : CSS Modules (Tailwind 사용 안함. 클래스 충돌 방지)
배포        : Netlify
```

---

## 확정된 폴더 구조

```
src/
  types/
    db.ts             → Supabase 테이블 기준 TypeScript 타입 전체
    game.ts           → 런타임 전용 타입
  lib/
    supabase.ts       → Supabase 클라이언트 초기화
  stores/
    gameStore.ts      → 재료 인스턴스, 그릇 인스턴스, 주문 큐
    equipmentStore.ts → 웍/튀김채/MW 물리 상태
    uiStore.ts        → 뷰포트 위치, 사이드바 상태
  components/
    layout/
      BillQueue.tsx
      MainViewport.tsx
      LeftSidebar.tsx
      RightSidebar.tsx
      Handbar.tsx
    game/
      HitboxLayer.tsx
      HitboxItem.tsx
    equipment/
      WokComponent.tsx
      FryingBasketComponent.tsx
      MicrowaveComponent.tsx
    admin/
      HitboxEditor.tsx
      HitboxEditorPanel.tsx
    ui/
      Modal.tsx
      OrderSelectModal.tsx
  hooks/
    useGameTick.ts    → setInterval(1000ms) 물리 루프
    useRecipeEval.ts  → 레시피 판별 로직
  pages/
    LoginPage.tsx
    GamePage.tsx
    AdminPage.tsx
  router.tsx
  main.tsx
  App.tsx
```

---

## Phase 0 — 프로젝트 라운드

**목표**: 빌드 성공 + Supabase 연결 확인. UI 없어도 됨.

### Step 0-1: Vite 프로젝트 생성 및 의존성 설치

```bash
npm create vite@latest kitchenflow -- --template react-ts
cd kitchenflow
npm install zustand @dnd-kit/core @dnd-kit/utilities @supabase/supabase-js react-router-dom
```

### Step 0-2: 환경변수 설정

루트에 `.env.local` 생성:
```
VITE_SUPABASE_URL=https://nunrougezfkuknxuqsdg.supabase.co
VITE_SUPABASE_ANON_KEY={anon_key}
```

`.gitignore`에 `.env.local` 포함 확인.

### Step 0-3: src/types/db.ts

Supabase 테이블 구조 전체를 TypeScript 인터페이스로 정의.

```typescript
// ——— 정적 계층 ————————————————————————————————
export interface IngredientsMaster {
  id: string;
  name: string;
}

// ——— 설정 계층 ————————————————————————————————
export interface Store {
  id: string;
  name: string;
  code: string;
}

export interface StoreUser {
  id: string;
  store_id: string;
  name: string;
  avatar_key: string;
  role: 'admin' | 'staff';
}

export interface KitchenZone {
  id: string;
  store_id: string;
  zone_key: string;
  label: string;
  image_url: string;
  image_width: number;
  image_height: number;
}

export interface StoreIngredient {
  id: string;
  store_id: string;
  master_id: string;
  display_name: string;
  state_label: string | null;
  unit: 'g' | 'ml' | 'ea' | 'spoon' | 'portion' | 'pinch';
  default_quantity: number;
  image_url: string | null;
}

export interface Container {
  id: string;
  store_id: string;
  name: string;
  container_type: 'bowl' | 'plate' | 'pot' | 'box';
  image_url: string | null;
}

export type AreaType = 'ingredient' | 'container' | 'navigate' | 'equipment';
export type EquipmentType = 'wok' | 'frying_basket' | 'microwave' | 'sink';

export interface AreaDefinition {
  id: string;
  store_id: string;
  zone_id: string;
  label: string;
  area_type: AreaType;
  x: number;   // 0~1 비율
  y: number;   // 0~1 비율
  w: number;   // 0~1 비율
  h: number;   // 0~1 비율
  ingredient_id: string | null;
  container_id: string | null;
  navigate_zone_id: string | null;
  equipment_type: EquipmentType | null;
  equipment_index: number | null;
  drag_image_url: string | null;
}

export interface Recipe {
  id: string;
  store_id: string;
  name: string;
  target_container_id: string;
}

export type ActionType = 'stir' | 'fry' | 'microwave' | 'boil';

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  quantity_tolerance: number; // default 0.1
  plate_order: number;
  required_action_type: ActionType | null;
  required_duration_min: number | null;
  required_duration_max: number | null;
}

// ——— 런타임 계층 ———————————————————————————————
export interface GameSession {
  id: string;
  store_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  score: number | null;
  status: 'active' | 'completed' | 'abandoned';
}

export interface GameOrder {
  id: string;
  session_id: string;
  recipe_id: string;
  order_sequence: number;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
}

export type WokStatus = 'clean' | 'dirty' | 'burned' | 'overheating';
export type BasketStatus = 'up' | 'down';
export type MwStatus = 'idle' | 'running' | 'done';

export interface GameEquipmentState {
  id: string;
  session_id: string;
  equipment_type: EquipmentType;
  equipment_index: number;
  // 웍
  wok_status: WokStatus | null;
  wok_temp: number | null;
  burner_level: 0 | 1 | 2 | 3 | null;
  // 튀김채
  basket_status: BasketStatus | null;
  basket_ingredient_ids: string[] | null;
  // 전자레인지
  mw_status: MwStatus | null;
  mw_remaining_sec: number | null;
}

export type LocationType = 'zone' | 'equipment' | 'container' | 'hand' | 'disposed';

export interface ActionHistoryEntry {
  actionType: ActionType;
  seconds: number;
}

export interface GameIngredientInstance {
  id: string;
  session_id: string;
  ingredient_id: string;
  quantity: number;
  location_type: LocationType;
  zone_id: string | null;
  equipment_state_id: string | null;
  container_instance_id: string | null;
  action_history: ActionHistoryEntry[];
  plate_order: number | null;
}

export interface GameContainerInstance {
  id: string;
  session_id: string;
  container_id: string;
  assigned_order_id: string | null;
  is_complete: boolean;
  is_served: boolean;
}
```

### Step 0-4: src/types/game.ts

런타임 전용 타입 (DB에 없는 클라이언트 상태).

```typescript
// 뷰포트 시점 위치
export type ViewPosition = 'left' | 'center' | 'right';

// 드래그 중인 아이템 메타
export interface DragMeta {
  type: 'ingredient' | 'container' | 'equipment';
  sourceAreaId?: string;
  ingredientId?: string;
  containerId?: string;
  equipmentStateId?: string;
}
```

### Step 0-5: src/lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경변수 누락. .env.local 확인 필요.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Step 0-6: Zustand store 빈 껍데기 3개

**gameStore.ts**
```typescript
import { create } from 'zustand';
import type { GameIngredientInstance, GameContainerInstance, GameOrder } from '../types/db';

interface GameState {
  sessionId: string | null;
  storeId: string | null;
  orders: GameOrder[];
  ingredientInstances: GameIngredientInstance[];
  containerInstances: GameContainerInstance[];

  setSession: (sessionId: string, storeId: string) => void;
  addOrder: (order: GameOrder) => void;
  addIngredientInstance: (instance: GameIngredientInstance) => void;
  moveIngredient: (instanceId: string, updates: Partial<GameIngredientInstance>) => void;
  addContainerInstance: (instance: GameContainerInstance) => void;
  assignOrderToContainer: (containerInstanceId: string, orderId: string) => void;
  markContainerComplete: (containerInstanceId: string) => void;
  markContainerServed: (containerInstanceId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  sessionId: null,
  storeId: null,
  orders: [],
  ingredientInstances: [],
  containerInstances: [],

  setSession: (sessionId, storeId) => set({ sessionId, storeId }),
  addOrder: (order) => set((s) => ({ orders: [...s.orders, order] })),
  addIngredientInstance: (instance) =>
    set((s) => ({ ingredientInstances: [...s.ingredientInstances, instance] })),
  moveIngredient: (instanceId, updates) =>
    set((s) => ({
      ingredientInstances: s.ingredientInstances.map((i) =>
        i.id === instanceId ? { ...i, ...updates } : i
      ),
    })),
  addContainerInstance: (instance) =>
    set((s) => ({ containerInstances: [...s.containerInstances, instance] })),
  assignOrderToContainer: (containerInstanceId, orderId) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === containerInstanceId ? { ...c, assigned_order_id: orderId } : c
      ),
    })),
  markContainerComplete: (containerInstanceId) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === containerInstanceId ? { ...c, is_complete: true } : c
      ),
    })),
  markContainerServed: (containerInstanceId) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === containerInstanceId ? { ...c, is_served: true } : c
      ),
    })),
}));
```

**equipmentStore.ts**
```typescript
import { create } from 'zustand';
import type { GameEquipmentState } from '../types/db';

interface EquipmentStoreState {
  equipments: GameEquipmentState[];
  setEquipments: (equipments: GameEquipmentState[]) => void;
  updateEquipment: (id: string, updates: Partial<GameEquipmentState>) => void;
  tickWok: (id: string) => void;       // 1초마다 온도/상태 업데이트
  tickBasket: (id: string) => void;    // 1초마다 재료 action_history 누적
  tickMicrowave: (id: string) => void; // 1초마다 remaining_sec 감소
}

export const useEquipmentStore = create<EquipmentStoreState>((set) => ({
  equipments: [],
  setEquipments: (equipments) => set({ equipments }),
  updateEquipment: (id, updates) =>
    set((s) => ({
      equipments: s.equipments.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  // tick 로직은 Phase 4에서 구현
  tickWok: () => {},
  tickBasket: () => {},
  tickMicrowave: () => {},
}));
```

**uiStore.ts**
```typescript
import { create } from 'zustand';

interface UiState {
  // 메인 뷰포트
  viewOffset: number;         // translateX px 값
  currentZoneId: string | null;

  // 왼쪽 사이드바
  leftSidebarZoneId: string | null; // null이면 닫힘

  // 모달
  orderSelectModalOpen: boolean;
  orderSelectContainerInstanceId: string | null;

  setViewOffset: (offset: number) => void;
  setCurrentZoneId: (zoneId: string) => void;
  setLeftSidebarZone: (zoneId: string | null) => void;
  openOrderSelectModal: (containerInstanceId: string) => void;
  closeOrderSelectModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  viewOffset: 0,
  currentZoneId: null,
  leftSidebarZoneId: null,
  orderSelectModalOpen: false,
  orderSelectContainerInstanceId: null,

  setViewOffset: (offset) => set({ viewOffset: offset }),
  setCurrentZoneId: (zoneId) => set({ currentZoneId: zoneId }),
  setLeftSidebarZone: (zoneId) => set({ leftSidebarZoneId: zoneId }),
  openOrderSelectModal: (containerInstanceId) =>
    set({ orderSelectModalOpen: true, orderSelectContainerInstanceId: containerInstanceId }),
  closeOrderSelectModal: () =>
    set({ orderSelectModalOpen: false, orderSelectContainerInstanceId: null }),
}));
```

### Step 0-7: 라우팅 + 페이지 빈 껍데기

```typescript
// router.tsx
import { createBrowserRouter } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import GamePage from './pages/GamePage';
import AdminPage from './pages/AdminPage';

export const router = createBrowserRouter([
  { path: '/', element: <LoginPage /> },
  { path: '/game', element: <GamePage /> },
  { path: '/admin', element: <AdminPage /> },
]);
```

각 페이지는 `<div>LoginPage</div>` 형태의 placeholder로만 작성.

### Phase 0 완료 기준
- `npm run dev` 오류 없이 실행
- 브라우저에서 `/`, `/game`, `/admin` 라우팅 동작 확인
- Supabase import 오류 없음

---

## Phase 1 — 어드민: 히트박스 에디터

**목표**: zone 이미지 위에 히트박스를 드래그로 그리고 `area_definitions`에 저장.
**이 Phase가 게임보다 먼저인 이유**: area_definitions 데이터 없이 게임을 테스트할 수 없음.

### 어드민 페이지 구조

```
AdminPage
  ├ 왼쪽: zone 목록 (kitchen_zones 전체)
  ├ 가운데: HitboxEditor (선택된 zone 이미지 + 히트박스 오버레이)
  └ 오른쪽: HitboxEditorPanel (선택된 히트박스 속성 편집)
```

### HitboxEditor 핵심 로직

#### 이미지 렌더링
```tsx
// 이미지 컨테이너: position: relative, display: inline-block
// 이미지: 최대 너비 고정 (예: 800px), 비율 유지
// 히트박스 오버레이: position: absolute, top:0, left:0, width:100%, height:100%
```

#### 좌표 변환 (반드시 이 공식 사용)
```typescript
// 마우스 이벤트에서 비율 좌표 계산
const getRelativePosition = (
  e: MouseEvent,
  containerEl: HTMLElement
): { x: number; y: number } => {
  const rect = containerEl.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
};
```
**주의**: `rect.width`, `rect.height`는 실제 렌더링 크기 (naturalWidth가 아님).
`image_width`, `image_height` DB 컬럼은 히트박스 에디터에서는 사용하지 않는다.
게임 런타임에서도 동일하게 렌더링된 이미지 크기 기준으로 px 환산.

#### 마우스 드래그로 히트박스 그리기
```typescript
// mousedown → startDraw 상태 저장 (startX, startY)
// mousemove → 드래그 중인 직사각형 preview 렌더
// mouseup   → 좌표 확정, 새 hitbox 객체 생성, 우측 패널 열기
```

드래그 방향이 역방향(우→좌, 하→상)인 경우도 처리:
```typescript
const x = Math.min(startX, endX);
const y = Math.min(startY, endY);
const w = Math.abs(endX - startX);
const h = Math.abs(endY - startY);
```

#### 히트박스 렌더링
```tsx
// area_definitions 목록을 순회하며 렌더
{areas.map(area => (
  <div
    key={area.id}
    style={{
      position: 'absolute',
      left: `${area.x * 100}%`,
      top: `${area.y * 100}%`,
      width: `${area.w * 100}%`,
      height: `${area.h * 100}%`,
      border: '2px solid rgba(255,0,0,0.7)',
      backgroundColor: 'rgba(255,0,0,0.1)',
      cursor: 'pointer',
      boxSizing: 'border-box',
    }}
    onClick={() => selectArea(area.id)}
  />
))}
```

#### area_type별 색상 구분 (에디터 전용)
| area_type | 색상 |
|-----------|------|
| ingredient | 초록 |
| container | 파랑 |
| navigate | 노랑 |
| equipment | 주황 |

### HitboxEditorPanel 속성 편집

선택된 히트박스에 따라 입력 필드 표시:

```
공통 필드:
  - label (텍스트 입력)
  - area_type (select: ingredient/container/navigate/equipment)

area_type === 'ingredient':
  - ingredient_id (select: store_ingredients 목록)
  - drag_image_url (텍스트 입력, 선택)

area_type === 'container':
  - container_id (select: containers 목록)

area_type === 'navigate':
  - navigate_zone_id (select: kitchen_zones 목록)
  ※ zone_key 텍스트가 아닌 kitchen_zones.id(UUID) 저장

area_type === 'equipment':
  - equipment_type (select: wok/frying_basket/microwave/sink)
  - equipment_index (number input, 1부터 시작)
```

저장 버튼 클릭 시:
```typescript
// 신규: supabase.from('area_definitions').insert(...)
// 수정: supabase.from('area_definitions').update(...).eq('id', area.id)
// 삭제: 패널 하단 삭제 버튼 → supabase.from('area_definitions').delete().eq('id', area.id)
```

### Phase 1 완료 기준
- zone 이미지 위에 히트박스 드래그 그리기 가능
- 4가지 area_type 속성 설정 및 DB 저장 동작
- 저장된 히트박스가 페이지 리로드 후에도 표시됨
- navigate_zone_id가 UUID로 저장되는지 Supabase 직접 확인

---

## Phase 2 — 게임: 레이아웃 + 히트박스 렌더링

**목표**: 게임 화면 레이아웃 완성 + 히트박스가 이미지 위에 정확히 오버레이.

### 레이아웃 설계

```css
/* GamePage 전체 */
.game-page {
  display: grid;
  grid-template-rows: 60px 1fr 80px;  /* 상단/중간/하단 */
  grid-template-columns: 240px 1fr 200px;
  height: 100vh;
  overflow: hidden;
}

.bill-queue    { grid-column: 1 / -1; grid-row: 1; }
.left-sidebar  { grid-column: 1;      grid-row: 2; }
.main-viewport { grid-column: 2;      grid-row: 2; overflow: hidden; position: relative; }
.right-sidebar { grid-column: 3;      grid-row: 2; }
.handbar       { grid-column: 1 / -1; grid-row: 3; }
```

### 메인 뷰포트 — 파노라마 슬라이드

```tsx
// MainViewport.tsx
// 핵심: 이미지 가로 전체가 컨테이너보다 넓음 (파노라마)
// overflow: hidden으로 컨테이너 밖 이미지는 보이지 않음
// translateX로 슬라이드

const MainViewport = () => {
  const { viewOffset, currentZoneId, setViewOffset } = useUiStore();
  const [zone, setZone] = useState<KitchenZone | null>(null);

  // 시점이동 버튼: left / right / turn (고정 UI)
  // left  → viewOffset += 이동단위px (왼쪽 방향이면 클램핑)
  // right → viewOffset -= 이동단위px
  // turn  → 현재 미구현, 버튼만 존재

  return (
    <div className="viewport-container">  {/* overflow: hidden */}
      <div
        className="viewport-inner"
        style={{ transform: `translateX(${viewOffset}px)`, transition: 'transform 0.2s' }}
      >
        <img src={zone?.image_url} alt="kitchen" />
        <HitboxLayer zoneId={currentZoneId} />
      </div>
      {/* 시점이동 버튼: position absolute */}
      <button className="nav-btn left" onClick={() => setViewOffset(v => v + SLIDE_STEP)}>◀</button>
      <button className="nav-btn right" onClick={() => setViewOffset(v => v - SLIDE_STEP)}>▶</button>
      <button className="nav-btn turn">↩ 뒤돌기</button>
    </div>
  );
};
```

슬라이드 이동 단위(SLIDE_STEP)는 `뷰포트 컨테이너 너비 / 2`로 설정.
이동 범위 클램핑: `0 ~ (이미지 실제 너비 - 컨테이너 너비)`

드래그 중 버튼 호버 시 자동 슬라이드는 Phase 3 DnD 구현 후 추가.

### HitboxLayer + HitboxItem

```tsx
// HitboxLayer.tsx
// zoneId에 해당하는 area_definitions를 Supabase에서 로딩
// 이미지에 완전히 겹치는 position:absolute 레이어

const HitboxLayer = ({ zoneId }: { zoneId: string | null }) => {
  const [areas, setAreas] = useState<AreaDefinition[]>([]);

  useEffect(() => {
    if (!zoneId) return;
    supabase
      .from('area_definitions')
      .select('*')
      .eq('zone_id', zoneId)
      .then(({ data }) => setAreas(data ?? []));
  }, [zoneId]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {areas.map(area => (
        <HitboxItem key={area.id} area={area} />
      ))}
    </div>
  );
};
```

```tsx
// HitboxItem.tsx
// area_type에 따라 다른 동작
// 게임 모드: 투명 (border: none, background: none)
// 에디터 모드: 색상 표시 (props로 구분)

const HitboxItem = ({ area }: { area: AreaDefinition }) => {
  const { setLeftSidebarZone } = useUiStore();

  const style: CSSProperties = {
    position: 'absolute',
    left: `${area.x * 100}%`,
    top: `${area.y * 100}%`,
    width: `${area.w * 100}%`,
    height: `${area.h * 100}%`,
    pointerEvents: 'all',
    cursor: area.area_type === 'navigate' ? 'pointer' : 'grab',
  };

  if (area.area_type === 'navigate') {
    return (
      <div
        style={style}
        onClick={() => area.navigate_zone_id && setLeftSidebarZone(area.navigate_zone_id)}
      />
    );
  }

  // ingredient / container: DnD 소스 → Phase 3에서 useDraggable 적용
  // equipment: 장비 컴포넌트 렌더 → Phase 3에서 구현
  return <div style={style} />;
};
```

### Phase 2 완료 기준
- 5개 레이아웃 영역이 화면에 올바르게 배치됨
- 메인 뷰포트에 main_kitchen 이미지 표시
- 시점이동 버튼으로 파노라마 슬라이드 동작
- navigate 히트박스 클릭 → 왼쪽 사이드바에 해당 zone 이미지 로딩
- 히트박스가 이미지 위에 정확히 오버레이 (에디터에서 그린 위치와 일치)

---

## Phase 3 — 게임: DnD 상호작용

**목표**: 재료·그릇을 드래그해서 목적지에 드롭 시 상태 변경.

### DnDContext 설정

```tsx
// GamePage.tsx에서 DndContext로 전체 감싸
<DndContext
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  {/* 전체 게임 레이아웃 */}
</DndContext>
```

### 드래그 소스 (useDraggable)

| 컴포넌트 | id 규칙 | data |
|----------|---------|------|
| ingredient HitboxItem | `ingredient-area-{areaDefinitionId}` | `{ type: 'ingredient', ingredientId, areaId }` |
| container HitboxItem | `container-area-{areaDefinitionId}` | `{ type: 'container', containerId, areaId }` |
| 웍 컴포넌트 | `equipment-wok-{equipmentStateId}` | `{ type: 'equipment', equipmentType: 'wok', equipmentStateId }` |
| 튀김채 컴포넌트 | `equipment-basket-{equipmentStateId}` | `{ type: 'equipment', equipmentType: 'frying_basket', equipmentStateId }` |

### 드롭 목적지 (useDroppable)

| 컴포넌트 | id 규칙 |
|----------|---------|
| 오른쪽 사이드바 | `right-sidebar` |
| 개별 그릇 | `container-instance-{containerInstanceId}` |
| 웍 컴포넌트 | `equipment-wok-{equipmentStateId}` |
| 튀김채 컴포넌트 | `equipment-basket-{equipmentStateId}` |
| MW 컴포넌트 | `equipment-mw-{equipmentStateId}` |
| 핸드바 | `handbar` |

### onDragEnd 처리 로직

```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) return; // 빈 공간 드롭 → 무시

  const dragData = active.data.current as DragMeta;
  const dropId = over.id as string;

  // —— Case 1: ingredient → 어딘가에 드롭 ——————————————
  if (dragData.type === 'ingredient') {
    // 재료 인스턴스 생성 (고유 UUID 생성)
    const instance: GameIngredientInstance = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      ingredient_id: dragData.ingredientId,
      quantity: ingredientDefaultQty, // store_ingredients.default_quantity
      location_type: resolveLocationType(dropId),
      zone_id: null,
      equipment_state_id: null,
      container_instance_id: null,
      action_history: [],
      plate_order: null,
    };

    // 드롭 목적지에 따라 location 필드 채우기
    if (dropId.startsWith('equipment-wok-') || dropId.startsWith('equipment-basket-') || dropId.startsWith('equipment-mw-')) {
      instance.location_type = 'equipment';
      instance.equipment_state_id = extractEquipmentStateId(dropId);
    } else if (dropId.startsWith('container-instance-')) {
      instance.location_type = 'container';
      instance.container_instance_id = extractContainerInstanceId(dropId);
      instance.plate_order = getNextPlateOrder(dropId); // 현재 그릇 재료 수 + 1
    } else if (dropId === 'handbar') {
      instance.location_type = 'hand';
    }

    addIngredientInstance(instance);
  }

  // —— Case 2: container → right-sidebar 드롭 ————————
  if (dragData.type === 'container' && dropId === 'right-sidebar') {
    const containerInstance: GameContainerInstance = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      container_id: dragData.containerId,
      assigned_order_id: null,
      is_complete: false,
      is_served: false,
    };
    addContainerInstance(containerInstance);
    openOrderSelectModal(containerInstance.id); // 주문 선택 팝업
  }

  // —— Case 3: equipment(웍/튀김채) → container-instance 드롭 ——
  if (dragData.type === 'equipment' && dropId.startsWith('container-instance-')) {
    const containerInstanceId = extractContainerInstanceId(dropId);
    const equipmentId = dragData.equipmentStateId;

    // 해당 equipment에 있는 재료 인스턴스들을 container로 이동
    const inEquipment = ingredientInstances.filter(
      i => i.equipment_state_id === equipmentId
    );
    inEquipment.forEach((inst, idx) => {
      moveIngredient(inst.id, {
        location_type: 'container',
        equipment_state_id: null,
        container_instance_id: containerInstanceId,
        plate_order: currentPlateOrder + idx,
      });
    });

    // 웍 상태 → dirty
    if (dragData.equipmentType === 'wok') {
      updateEquipment(equipmentId, { wok_status: 'dirty' });
    }
  }
};
```

### 드래그 중 뷰포트 자동 슬라이드

드래그 중(`onDragMove`) 마우스가 시점이동 버튼 영역에 들어오면 자동 슬라이드:
```typescript
// 200ms 인터벌로 setViewOffset 호출
// 드래그 종료 시 인터벌 제거
```

### OrderSelectModal

```tsx
// 열릴 때: pending 상태인 game_orders 목록 표시
// 선택 시: assignOrderToContainer(containerInstanceId, orderId) 호출
// 이미 다른 그릇에 배정된 주문도 선택 가능 (같은 메뉴 여러 그릇 케이스)
```

### Phase 3 완료 기준
- 냉장고(navigate)를 열고 ingredient 히트박스를 웍/그릇/핸드바에 드롭 가능
- container 히트박스를 오른쪽 사이드바에 드롭 시 그릇 생성 + 주문 선택 팝업 동작
- 웍에서 그릇 위에 드롭 시 재료 이동 + 웍 dirty 상태로 변경
- Zustand store에서 재료 인스턴스 location_type이 정확하게 추적되는지 콘솔 확인

---

## Phase 4 — 게임: 물리엔진

**목표**: 1초 루프로 웍/튀김채/MW 상태 자동 업데이트.

### useGameTick hook

```typescript
// hooks/useGameTick.ts
// GamePage 마운트 시 시작, 언마운트 시 clearInterval

export const useGameTick = () => {
  const { ingredientInstances, moveIngredient } = useGameStore();
  const { equipments, updateEquipment } = useEquipmentStore();

  useEffect(() => {
    const tick = () => {
      equipments.forEach(eq => {
        if (eq.equipment_type === 'wok') tickWok(eq, ingredientInstances, moveIngredient, updateEquipment);
        if (eq.equipment_type === 'frying_basket') tickBasket(eq, ingredientInstances, moveIngredient, updateEquipment);
        if (eq.equipment_type === 'microwave') tickMicrowave(eq, ingredientInstances, moveIngredient, updateEquipment);
      });
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [equipments, ingredientInstances]); // 의존성 주의: stale closure 방지
};
```

**stale closure 방지**: `useRef`로 최신 상태를 참조하거나 `useCallback`으로 tick 함수를 memoize해야 함. 단순 deps 배열로는 매 초마다 인터벌이 재등록되는 문제 발생. 권장 패턴:

```typescript
const stateRef = useRef({ ingredientInstances, equipments });
useEffect(() => {
  stateRef.current = { ingredientInstances, equipments };
});

useEffect(() => {
  const id = setInterval(() => {
    const { ingredientInstances, equipments } = stateRef.current;
    // tick 로직
  }, 1000);
  return () => clearInterval(id);
}, []); // 빈 deps → 마운트 시 1회만 등록
```

### 웍 물리법칙

```typescript
const tickWok = (wok, instances, moveIngredient, updateEquipment) => {
  // 1. 온도 업데이트
  const tempDelta = [0, 5, 10, 20][wok.burner_level ?? 0]; // level별 초당 온도 상승
  const coolDown = 3; // 자연 냉각 (초당 3도)
  const newTemp = Math.max(0, (wok.wok_temp ?? 0) + tempDelta - coolDown);

  let newStatus = wok.wok_status;
  if (newTemp > 250) newStatus = 'overheating';
  if (newTemp > 350) newStatus = 'burned';

  updateEquipment(wok.id, { wok_temp: newTemp, wok_status: newStatus });

  // 2. 재료 action_history 누적 (clean 상태, burner_level > 0, 재료 있을 때만)
  if (wok.wok_status === 'clean' && (wok.burner_level ?? 0) > 0) {
    const inWok = instances.filter(i => i.equipment_state_id === wok.id);
    inWok.forEach(inst => {
      const existing = inst.action_history.find(a => a.actionType === 'stir');
      const newHistory = existing
        ? inst.action_history.map(a => a.actionType === 'stir' ? { ...a, seconds: a.seconds + 1 } : a)
        : [...inst.action_history, { actionType: 'stir' as ActionType, seconds: 1 }];
      moveIngredient(inst.id, { action_history: newHistory });
    });
  }
};
```

임계 온도값 (조절 가능):
- 250°C 초과 → `overheating`
- 350°C 초과 → `burned`
- `burned`는 콘텐츠 인출 불가. 버려야 함.

### 튀김채 물리법칙

```typescript
const tickBasket = (basket, instances, moveIngredient, updateEquipment) => {
  if (basket.basket_status !== 'down') return; // 내려간 상태 때만 누적

  const inBasket = instances.filter(i => i.equipment_state_id === basket.id);
  inBasket.forEach(inst => {
    const existing = inst.action_history.find(a => a.actionType === 'fry');
    const newHistory = existing
      ? inst.action_history.map(a => a.actionType === 'fry' ? { ...a, seconds: a.seconds + 1 } : a)
      : [...inst.action_history, { actionType: 'fry' as ActionType, seconds: 1 }];
    moveIngredient(inst.id, { action_history: newHistory });
  });
};
```

튀김채 UI 버튼:
- **내리기** → `updateEquipment(id, { basket_status: 'down' })`
- **올리기** → `updateEquipment(id, { basket_status: 'up' })`

### MW 물리법칙

```typescript
const tickMicrowave = (mw, instances, moveIngredient, updateEquipment) => {
  if (mw.mw_status !== 'running') return;

  const remaining = (mw.mw_remaining_sec ?? 0) - 1;
  updateEquipment(mw.id, {
    mw_remaining_sec: remaining,
    mw_status: remaining <= 0 ? 'done' : 'running',
  });

  // 재료 action_history 누적 (running 동안만)
  const inMw = instances.filter(i => i.equipment_state_id === mw.id);
  inMw.forEach(inst => {
    const existing = inst.action_history.find(a => a.actionType === 'microwave');
    const newHistory = existing
      ? inst.action_history.map(a => a.actionType === 'microwave' ? { ...a, seconds: a.seconds + 1 } : a)
      : [...inst.action_history, { actionType: 'microwave' as ActionType, seconds: 1 }];
    moveIngredient(inst.id, { action_history: newHistory });
  });
};
```

MW UI:
- 초 입력 → `updateEquipment(id, { mw_remaining_sec: seconds, mw_status: 'running' })`
- 문 열기(꺼내기) → `mw_status = 'idle'` (그 시점까지 누적된 action_history는 그대로)

### 콜크 인출

```typescript
// 싱크 웍 드롭존에 3초 홀드 시 인출
// hold 타이머: 드롭 시 시작, 3초 후 wok_status = 'clean', wok_temp = 0
// dirty + overheating 인출 가능, burned 인출 불가
```

### Phase 4 완료 기준
- 웍에 재료 넣고 burner_level 올리면 매초 온도 증가, 재료의 action_history.stir 누적
- 튀김채 내리기 → 재료 fry 누적 / 올리기 → 누적 중지
- MW 초 설정 후 start → 카운트다운, done 전환
- 웍 dirty 상태에서 콜크 3초 홀드 → clean 전환
- 콘솔에서 action_history 값 매초 확인

---

## Phase 5 — 게임: 레시피 판별 + 서빙

**목표**: 그릇 완성 자동 감지 + 서빙 버튼 활성화.

### useRecipeEval hook

그릇에 재료가 담길 때마다 (Zustand subscribe 또는 useEffect deps) 트리거:

```typescript
// hooks/useRecipeEval.ts
export const useRecipeEval = () => {
  const { containerInstances, ingredientInstances, orders, markContainerComplete } = useGameStore();

  const evaluate = useCallback((containerInstanceId: string) => {
    const container = containerInstances.find(c => c.id === containerInstanceId);
    if (!container?.assigned_order_id) return;

    const order = orders.find(o => o.id === container.assigned_order_id);
    if (!order) return;

    // recipe_ingredients 로딩 (캐싱 필요)
    const recipeItems = recipeIngredientCache[order.recipe_id] ?? [];
    const recipe = recipeCache[order.recipe_id];

    // 그릇 안 재료 인스턴스
    const inContainer = ingredientInstances.filter(
      i => i.container_instance_id === containerInstanceId
    );

    // 1:1 비교
    const matched = recipeItems.filter(req => {
      const inst = inContainer.find(i => i.ingredient_id === req.ingredient_id);
      if (!inst) return false;

      // 수량 허용 오차
      const qtyOk =
        inst.quantity >= req.quantity * (1 - req.quantity_tolerance) &&
        inst.quantity <= req.quantity * (1 + req.quantity_tolerance);

      // action_history 조건
      let actionOk = true;
      if (req.required_action_type) {
        const entry = inst.action_history.find(a => a.actionType === req.required_action_type);
        const seconds = entry?.seconds ?? 0;
        actionOk =
          seconds >= (req.required_duration_min ?? 0) &&
          (req.required_duration_max == null || seconds <= req.required_duration_max);
      }

      // plate_order
      const orderOk = inst.plate_order === req.plate_order;

      // container 타입 (recipe.target_container_id)
      const containerTypeOk = container.container_id === recipe.target_container_id;

      return qtyOk && actionOk && orderOk && containerTypeOk;
    });

    const score = recipeItems.length > 0 ? matched.length / recipeItems.length : 0;
    if (score === 1) markContainerComplete(containerInstanceId);
  }, [containerInstances, ingredientInstances, orders]);

  return { evaluate };
};
```

레시피/재료 캐시는 게임 시작 시 Supabase에서 1회 로딩 후 메모리에 보관.

### 서빙 플로우

```typescript
// 같은 assigned_order_id를 가진 모든 container가 is_complete === true
// → 서빙 버튼 활성화

const canServe = (orderId: string) => {
  const related = containerInstances.filter(c => c.assigned_order_id === orderId);
  return related.length > 0 && related.every(c => c.is_complete);
};

// 서빙 버튼 클릭
const handleServe = (orderId: string) => {
  containerInstances
    .filter(c => c.assigned_order_id === orderId)
    .forEach(c => markContainerServed(c.id));
  updateOrderStatus(orderId, 'completed');
};
```

### Phase 5 완료 기준
- 계란볶음밥 레시피대로 재료 넣고 조리 후 그릇에 담으면 is_complete 자동 전환
- 서빙 버튼 활성화/비활성화 정확히 동작
- 조건 미충족 재료는 콘솔에서 어떤 조건인지 로그로 확인 가능 (디버그 모드)

---

## Phase 6 — 로그인 + 세션 저장

**목표**: 매장코드 입력 → 직원 선택 → 게임 시작. 종료 시 DB 저장.

### 로그인 플로우

```
LoginPage
  1. 매장 코드 입력 (input)
  2. 확인 클릭 → supabase.from('stores').select().eq('code', code)
  3. 매장 확인 시 → store_users 목록 표시 (아바타 그리드)
  4. 직원 선택 → game_sessions INSERT
     { store_id, user_id, started_at: new Date().toISOString(), status: 'active' }
  5. session_id를 gameStore.setSession() 저장
  6. navigate('/game')
```

### 세션 종료 + DB 저장

```typescript
// GamePage 하단 또는 오버레이 "게임 종료" 버튼
const handleEndSession = async () => {
  // 1. 모든 ingredient_instances upsert
  await supabase.from('game_ingredient_instances').upsert(ingredientInstances);

  // 2. 모든 container_instances upsert
  await supabase.from('game_container_instances').upsert(containerInstances);

  // 3. 모든 equipment_state upsert
  await supabase.from('game_equipment_state').upsert(equipments);

  // 4. game_sessions 업데이트
  await supabase.from('game_sessions').update({
    ended_at: new Date().toISOString(),
    status: 'completed',
    score: calcFinalScore(),
  }).eq('id', sessionId);

  navigate('/');
};
```

**최종 점수 계산**: 완료된 주문 수 / 전체 주문 수 × 100. 또는 각 그릇의 recipe 충족 비율 평균.

### Phase 6 완료 기준
- 매장코드 TEST01 입력 → 직원 선택 → 게임 시작
- 게임 종료 시 Supabase에 런타임 데이터 저장 확인
- 재접속 시 과거 세션 기록 조회 가능 (세션 목록은 LoginPage에 표시)

---

## 공통 규칙 (클로드 코드가 항상 지켜야 할 것)

### 절대 금지
1. **비율 좌표를 px로 저장하지 말 것.** 히트박스 x/y/w/h는 항상 0~1.
2. **물리엔진 상태를 세션 중에 DB에 write하지 말 것.** setInterval 안에서 supabase.update 호출 금지.
3. **navigate_zone_id에 zone_key 텍스트를 저장하지 말 것.** kitchen_zones.id(UUID)만 사용.
4. **웍에 상태 컬럼 추가 금지.** action_history로 모든 상태 판별. "burned 여부" 같은 boolean 컬럼 추가 요청이 와도 거부.
5. **더블클릭 묶기 UI 없음.** 그릇 묶음은 오직 assigned_order_id 동일 여부로만 처리.

### 주의 사항
- `plate_order`는 그릇에 담기는 순서다. 웍·튀김채에서 꺼내 그릇에 담을 때 현재 그릇 내 재료 수 + 1로 자동 부여.
- 같은 action_type이 action_history에 여러 개 존재하면 안 됨. 항상 find 후 업데이트.
- `equipment_state_id`는 game_equipment_state.id (UUID), equipment_index와 혼동 금지.
- 재료 인스턴스는 드롭 성공 후에만 생성. 드래그 시작 시 생성 금지.

---

## DB 변경이 필요한 경우

아래 상황에서만 Supabase SQL 명령문을 작성하여 실행:
- 테이블 컬럼 추가/변경
- CHECK constraint 수정
- 시드 데이터 보충

SQL 실행 전 반드시 기존 스키마 (`001_kitchen_flow_schema.sql`)와 충돌 여부 확인.
ALTER TABLE은 가능하면 피하고, 신규 컬럼 추가는 nullable로 시작.

---

## 현재 시드 데이터 상태

| 항목 | 상태 |
|------|------|
| 매장 | TEST01 (테스트주방) |
| kitchen_zones | 7개 (main_kitchen × 1, fold_fridge × 4, drawer_fridge × 2) |
| store_ingredients | 7종 (계란, 챱대파, 다이스양파, 밥, 간장, 참기름, 소금) |
| containers | 2종 (스텐볼, 직사각접시) |
| recipes | 1개 (계란볶음밥) |
| recipe_ingredients | Phase 1 이후 직접 입력 |
| area_definitions | Phase 1 어드민 에디터로 직접 배치 |

Supabase Storage `assets` 버킷에 업로드될 이미지:
- `Frame_1.png` → main_kitchen zone image_url
- `fold_fridge_interior.svg` → fold_fridge zone image_url
- `drawer_fridge_interior.svg` → drawer_fridge zone image_url
- 재료 SVG 7종, 용기 SVG 2종

---

_최종 업데이트: Phase 0 착수 전_
