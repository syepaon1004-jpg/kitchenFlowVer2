# KitchenFlow 시뮬레이터 프로젝트 지식 v3

> **최종 업데이트**: 이미지 히트박스 + 바구니 시스템 + 패치 1~4 완료 후

---

## 1. 개요

실제 주방 이미지 위에 히트박스를 올려서, 재료를 드래그앤드롭으로 조리 장비와 그릇에 넣고 **동선·순서·타이밍**을 훈련하는 B2B SaaS 도구다. 맛·불 세기 같은 감각이 아니라 조리 프로세스를 반복 훈련하는 것이 목적이다. 매장마다 자신의 주방에 맞게 커스터마이징하여 사용한다.

---

## 2. 개발 환경

- VS Code + Claude Code 확장프로그램 (바이브 코딩)
- React 18 + TypeScript + Vite
- 상태관리: Zustand
- 드래그앤드롭: @dnd-kit
- 백엔드: Supabase (PostgreSQL + RLS + Storage + Edge Functions)
- 배포: Netlify
- Supabase 프로젝트 ref: nunrougezfkuknxuqsdg

---

## 3. 프로젝트 구조

```
src/
├── router.tsx                    # 라우팅 (/, /game, /admin, /dev/master-ingredients)
├── components/
│   ├── admin/                    # 어드민 전용
│   │   ├── HitboxEditor.tsx      # 히트박스 에디터 (SVG polygon/rect 편집)
│   │   ├── HitboxEditorPanel.tsx # 히트박스 속성 편집 패널
│   │   ├── StoreIngredientsManager.tsx  # 매장 재료 관리
│   │   └── RecipeManager.tsx     # 레시피 관리 + AI 분석
│   ├── equipment/                # 장비 컴포넌트
│   │   ├── WokComponent.tsx      # 웍 (볶기 홀드 + 30초 게이지바)
│   │   ├── FryingBasketComponent.tsx
│   │   ├── MicrowaveComponent.tsx
│   │   └── SinkComponent.tsx
│   ├── game/                     # 게임 화면 전용
│   │   ├── HitboxLayer.tsx       # SVG 히트박스 레이어 (viewBox 동적)
│   │   ├── HitboxItem.tsx        # 개별 히트박스 렌더 (이미지/polygon/rect)
│   │   ├── DraggableHitbox.tsx   # 드래그 감지 HTML div
│   │   └── BasketGroup.tsx       # 바구니 호버 펼침 그룹
│   ├── layout/                   # 레이아웃
│   │   ├── MainViewport.tsx
│   │   ├── LeftSidebar.tsx
│   │   ├── RightSidebar.tsx
│   │   ├── BillQueue.tsx
│   │   └── Handbar.tsx
│   └── ui/                       # 공용 UI
│       ├── OrderSelectModal.tsx
│       └── QuantityInputModal.tsx  # 수량 입력 팝업
├── hooks/
│   ├── useGameTick.ts            # 1초 물리엔진 루프
│   └── useRecipeEval.ts          # 레시피 판별
├── lib/
│   ├── hitbox/                   # collision detection, pointInPolygon
│   ├── physics/                  # 물리엔진 순수 함수
│   ├── recipe/
│   │   └── analyzeRecipe.ts      # Edge Function 호출 유틸
│   ├── storage.ts                # Supabase Storage 업로드 유틸
│   └── supabase.ts               # Supabase 클라이언트
├── stores/
│   ├── gameStore.ts              # 재료/그릇/주문 상태
│   ├── equipmentStore.ts         # 장비 물리 상태 + stirring_equipment_ids
│   └── uiStore.ts                # 뷰포트/사이드바/모달 상태
├── pages/
│   ├── AdminPage.tsx             # 어드민 (3탭: 히트박스/재료/레시피)
│   ├── GamePage.tsx              # 게임 메인
│   ├── LoginPage.tsx             # 로그인
│   └── DevMasterIngredientsPage.tsx  # 개발자 전용 원재료 관리
└── types/
    ├── db.ts                     # DB 스키마 TypeScript 타입
    └── game.ts                   # 런타임 전용 타입
```

---

## 4. 히트박스

주방 이미지 위에 히트박스를 올려서 상호작용이 가능하게 만든다.
히트박스는 부모 이미지 기준 **비율 좌표(0~1)** 로 저장된다.

### 히트박스 타입 (area_type)

| 타입 | 동작 | 비고 |
|------|------|------|
| ingredient | 드래그 시 재료 인스턴스 생성 | 냉장고 내부 이미지에 주로 배치 |
| container | 드래그해서 오른쪽 사이드바에 드롭 → 그릇 배치 + 주문 배정 | |
| navigate | 클릭 시 왼쪽 사이드바에 해당 zone 이미지 로딩 | |
| equipment | 장비 컴포넌트 배치. 물리법칙 적용 | |
| basket | 부모 역할. 호버 시 자식 히트박스 Y축 펼침 | |

### 이미지 히트박스 (overlay_image_url)

모든 area_type에 범용 적용. overlay_image_url이 있으면 이미지가 곧 히트박스.
없으면 기존 투명 히트박스. SVG `<image>` 태그가 interaction을 담당한다.

### 바구니 시스템 (basket + parent_area_id)

- basket(부모) 히트박스 위에 자식 히트박스를 겹쳐 배치
- 접힌 상태 = 어드민이 배치한 그대로 (시스템이 자동 겹침 만들지 않음)
- 호버 시 자식들이 Y축 위로 sort_order 기반 계단식 펼침
- 펼쳐진 자식은 드래그 가능
- 드래그 중 바구니 접힘 방지 (useDndMonitor lock)

### Equipment 이미지 적용 시

overlay_image_url이 있는 equipment는 이미지가 히트박스 역할.
장비 컴포넌트 버튼(볶기, 불조절 등)은 이미지 외부에 렌더.
EquipmentOverlayWrapper가 droppable을 담당하고 내부 컴포넌트는 skipDroppable.

---

## 5. 화면 구조

```
┌─────────────────────────────────────────────────┐
│              상단: 메뉴 빌지 큐                    │
├──────┬──────────────────────────────┬────────────┤
│      │                              │            │
│ 왼쪽 │       메인 뷰포트              │  오른쪽    │
│사이드│  (주방 이미지 + 히트박스 레이어) │  사이드바  │
│ 바   │                              │  (그릇들)  │
│      │                              │            │
├──────┴──────────────────────────────┴────────────┤
│              하단: 핸드바                          │
└─────────────────────────────────────────────────┘
```

### 어드민 페이지 (3탭 구조)

```
/admin
  ├ "히트박스 편집" 탭 — zone 목록(추가/삭제) + HitboxEditor + HitboxEditorPanel
  ├ "재료 관리" 탭 — StoreIngredientsManager (CRUD)
  └ "레시피 관리" 탭 — RecipeManager (수동 편집 + AI 자연어 분석)
```

---

## 6. 재료 인스턴스 구조

```
재료 인스턴스:
  - ingredient_id  : 어떤 재료인지
  - quantity       : 수량 (g, ml, ea 등)
  - action_history : [{actionType: 'stir', seconds: 12}, ...]
  - plate_order    : 그릇에 담긴 순서
  - location_type  : zone/equipment/container/hand/disposed
```

### 투입량 결정 (unit별 분기)

| unit | 드롭 시 동작 |
|------|-------------|
| g / ml / ea | 수량 입력 팝업 (QuantityInputModal). default_quantity가 기본값 |
| spoon / portion / pinch / handful / ladle / spatula | 즉시 생성 (qty=1). 재드롭 시 기존 인스턴스 누적 |

같은 ingredient_id + 같은 목적지에 재드롭 → 기존 인스턴스 quantity 누적 (모든 unit 공통)

---

## 7. 장비 물리 엔진

### 웍
- 불 세기(burner_level)에 따라 온도 상승 (stirring과 무관하게 독립 동작)
- **볶기 버튼 홀드 시에만** stir 누적 (최대 30초, 게이지바 표시)
- 온도 초과 → overheating / burned
- dirty → 씽크대 3초 홀드로 세척
- burned → 세척 불가

### 튀김채
- 내리기 버튼 → basket_status = 'down' → fry 누적 시작
- 올리기 → 누적 중지

### 전자레인지(MW)
- 초 설정 후 작동 → 카운트다운 → done
- running 동안 microwave 누적

---

## 8. 레시피 시스템

### 레시피 판별
그릇 안 재료 인스턴스를 recipe_ingredients와 1:1 비교.
수량(±tolerance), action_history, plate_order, container 타입 네 가지 모두 확인.

### AI 자연어 분석
- Supabase Edge Function: analyze-recipe
- 모델: Claude Sonnet (claude-sonnet-4-20250514)
- 프론트엔드 → Edge Function → Anthropic API → JSON 응답
- store_ingredients + containers 목록을 prompt에 포함하여 매칭 정확도 향상
- 단계별 사고 절차(STEP 1~6)로 plate_order/duration 정확도 확보

---

## 9. 데이터 구조 흐름

```
[정적 계층]              [설정 계층]                  [런타임 계층]
ingredients_master  →   store_ingredients        →   game_ingredient_instances
                        containers               →   game_container_instances
                        kitchen_zones            →   game_equipment_state
                        area_definitions         →   game_orders
                        recipes                  →   game_sessions
                        recipe_ingredients       →   game_action_log
                        recipe_steps
```

---

## 10. DB 테이블 구조 (최신)

### 정적 데이터

```
ingredients_master
  id uuid PK, name text UNIQUE
```

### 설정 데이터 (매장별, store_id FK)

```
stores
  id uuid PK, name text, code text

store_users
  id, store_id(FK), name, avatar_key, role(admin/staff)

kitchen_zones
  id, store_id(FK), zone_key text, label text
  image_url text(nullable), image_width int(default 1920), image_height int(default 1080)
  UNIQUE(store_id, zone_key)

store_ingredients
  id, store_id(FK), master_id(FK→ingredients_master)
  display_name, state_label(nullable)
  unit(g/ml/ea/spoon/portion/pinch/handful/ladle/spatula)
  default_quantity float, image_url(nullable)

containers
  id, store_id(FK), name
  container_type(bowl/plate/pot/box), image_url(nullable)

area_definitions
  id, store_id(FK), zone_id(FK→kitchen_zones), label
  area_type(ingredient/container/navigate/equipment/basket)
  x, y, w, h (float, 0~1 비율)
  points jsonb(nullable) — polygon 꼭짓점
  ingredient_id(FK, nullable), container_id(FK, nullable)
  navigate_zone_id(FK, nullable), equipment_type(nullable), equipment_index(nullable)
  drag_image_url(nullable), overlay_image_url(nullable)
  parent_area_id(FK→self, nullable), sort_order int(default 0)
  CHECK: basket이면 4개 FK null 허용, 아니면 최소 1개 not null

recipes
  id, store_id(FK), name, target_container_id(FK→containers, nullable), created_at

recipe_ingredients
  id, recipe_id(FK→recipes ON DELETE CASCADE), ingredient_id(FK→store_ingredients)
  quantity float, quantity_tolerance float(default 0.1), plate_order int(default 1)
  required_action_type(nullable: stir/fry/microwave/boil/mix)
  required_duration_min(nullable), required_duration_max(nullable)

recipe_steps
  id, recipe_id(FK), store_id(FK), step_order int, image_url text
```

### 런타임 데이터

```
game_sessions
  id, store_id(FK), user_id(FK→store_users)
  started_at, ended_at(nullable), score(nullable)
  status(active/completed/abandoned)

game_orders
  id, session_id(FK), recipe_id(FK)
  order_sequence int, status(pending/in_progress/completed), created_at

game_equipment_state
  id, session_id(FK), equipment_type(wok/frying_basket/microwave/sink), equipment_index
  wok_status(nullable), wok_temp(nullable), burner_level(nullable, 0~3)
  basket_status(nullable: up/down), basket_ingredient_ids(jsonb, nullable)
  mw_status(nullable: idle/running/done), mw_remaining_sec(nullable)
  UNIQUE(session_id, equipment_type, equipment_index)

game_ingredient_instances
  id, session_id(FK), ingredient_id(FK→store_ingredients)
  quantity float, location_type(zone/equipment/container/hand/disposed)
  zone_id(FK, nullable), equipment_state_id(FK, nullable), container_instance_id(FK, nullable)
  action_history jsonb(default '[]'), plate_order(nullable), created_at
  CHECK: location_type에 따라 해당 FK not null

game_container_instances
  id, session_id(FK), container_id(FK→containers)
  assigned_order_id(FK→game_orders, nullable)
  is_complete boolean(default false), is_served boolean(default false)

game_action_log
  id, session_id(FK), action_type text, payload jsonb, created_at
```

---

## 11. 게임 흐름

```
1. 상단 빌지 큐에 주문 들어옴 → game_orders 생성
2. container 히트박스 드래그 → 사이드바 드롭 → 주문 선택
3. navigate 히트박스 클릭 → 왼쪽 사이드바에 냉장고 이미지
4. ingredient 히트박스 드래그 → 웍/튀김채/MW/그릇/핸드바 드롭
   → unit에 따라 수량 팝업 또는 즉시 생성
5. 웍 볶기 버튼 홀드 → action_history에 stir 누적 (최대 30초)
6. 웍/튀김채 드래그 → 그릇 드롭 → 재료 이동 + 웍 dirty
7. 그릇 재료 vs recipe_ingredients 1:1 비교 → 완성 판별
8. 서빙 버튼 → completed
```

---

## 12. Zustand 스토어

| 스토어 | 역할 |
|--------|------|
| gameStore | 재료/그릇/주문 상태 + incrementIngredientQuantity |
| equipmentStore | 장비 물리 상태 + stirring_equipment_ids + washing_equipment_ids |
| uiStore | 뷰포트/사이드바/모달(OrderSelect, QuantityInput) 상태 |

---

## 13. 드래그앤드롭 규칙

### DragSource 타입
| 타입 | 설명 |
|------|------|
| hitbox-ingredient | ingredient 히트박스 → 재료 인스턴스 생성 |
| hitbox-container | container 히트박스 → 그릇 인스턴스 생성 |
| equipment-content | 웍·튀김채 → 그릇으로 내용물 이동 |

### DropTarget 타입
| 타입 | 허용 DragSource |
|------|----------------|
| right-sidebar | hitbox-container |
| wok | hitbox-ingredient, hand-ingredient |
| frying-basket | hitbox-ingredient, hand-ingredient |
| microwave | hitbox-ingredient, hand-ingredient |
| container-instance | equipment-content |
| hand-bar | hitbox-ingredient |

### 드래그 이미지 우선순위
```
1. area_definitions.drag_image_url
2. area_definitions.overlay_image_url (fallback)
3. store_ingredients.image_url
4. display_name 텍스트
```

---

## 14. 절대 원칙

1. **비율 좌표(0~1)** — 히트박스 x/y/w/h, points 전부. px 저장 금지.
2. **물리엔진 클라이언트 전용** — Zustand에서만 계산. 세션 중 DB write 금지.
3. **navigate FK 참조** — navigate_zone_id는 UUID. zone_key 텍스트 금지.
4. **action_history 판별** — 별도 status 컬럼 추가 금지. action_history로 모든 상태 판별.
5. **assigned_order_id 묶음** — 더블클릭/group_id 추가 금지.
6. **equipment 컴포넌트** — 단순 히트박스가 아닌 컴포넌트 배치.
7. **슬라이드 렌더링 크기 기준** — DB image_width/height는 viewBox용. 클램프는 img.offsetWidth.
8. **재료 인스턴스는 드롭 성공 후에만 생성** — 드래그 시작 시 생성 금지.

---

## 15. 알려진 타입 불일치

| 위치 | DB | TypeScript | 메모 |
|------|-----|-----------|------|
| store_ingredients.unit | 9개 (g/ml/ea/spoon/portion/pinch/handful/ladle/spatula) | 6개 (handful/ladle/spatula 누락) | 수정 필요 |

---

## 16. DB 변경 이력

| 변경 | SQL |
|------|-----|
| 초기 스키마 | 001_kitchen_flow_schema.sql |
| 시드 데이터 | 002_seed_data.sql |
| points 컬럼 | ALTER TABLE area_definitions ADD COLUMN points jsonb DEFAULT NULL |
| recipe_steps 테이블 | 004 migration |
| overlay_image_url | ALTER TABLE area_definitions ADD COLUMN overlay_image_url text DEFAULT NULL |
| parent_area_id | ALTER TABLE area_definitions ADD COLUMN parent_area_id uuid DEFAULT NULL + FK |
| sort_order | ALTER TABLE area_definitions ADD COLUMN sort_order integer DEFAULT 0 |
| area_type basket | CHECK 수정 (basket 추가) |
| area_has_target | CHECK 수정 (basket이면 FK null 허용) |
| Storage RLS | assets 버킷 INSERT/UPDATE/DELETE 정책 추가 |
| recipe_ingredients action_type | CHECK에 'mix' 추가 |
| store_ingredients unit | CHECK에 'handful'/'ladle'/'spatula' 추가 |

---

## 17. 외부 서비스

### Supabase Edge Function: analyze-recipe
- URL: https://nunrougezfkuknxuqsdg.supabase.co/functions/v1/analyze-recipe
- 모델: claude-sonnet-4-20250514
- 인증: Authorization: Bearer {SUPABASE_ANON_KEY}
- 기능: 자연어 레시피 → 구조화 JSON (재료 매칭 + plate_order + duration 계산)
- 콜드 스타트 시 첫 호출 502 가능 → 두 번째부터 정상

---

_최종 업데이트: v3 — 이미지 히트박스 + 바구니 + 패치 1~4 반영_