# KitchenFlow 시뮬레이터 — 개발·수정 지침서 v2

> **v1 → v2 변경 사항**: 히트박스 polygon 지원 추가. 렌더링 방식 div → SVG 통일.

---

## 0. 작업 시작 전 체크리스트

- [ ] `KitchenFlow_프로젝트지식_v2.md` 최신본을 읽었는가
- [ ] `KitchenFlow_개발계획_v2.md`를 읽었는가
- [ ] 이 지침서를 읽었는가
- [ ] 수정하려는 영역의 **원칙 섹션**을 확인했는가
- [ ] 물리법칙·DB 제약에 위배되는 작업인지 확인했는가 → 해당 시 **먼저 사용자에게 확인**

---

## 1. 기술 스택 & 폴더 구조

### 스택
| 역할 | 선택 |
|------|------|
| 프레임워크 | React 18 + TypeScript + Vite |
| 상태관리 | Zustand |
| 드래그앤드롭 | @dnd-kit |
| 백엔드 | Supabase (PostgreSQL + RLS) |
| 배포 | Netlify |

### 폴더 구조 규칙
```
src/
  components/
    game/           # 게임 화면 전용
    admin/          # 어드민 전용
    shared/         # 공용
  stores/           # Zustand 스토어 (런타임 상태)
  hooks/            # 커스텀 훅
  lib/
    supabase.ts     # Supabase 클라이언트 (단일 인스턴스)
    physics/        # 물리엔진 순수 함수들
    recipe/         # 레시피 판별 로직
    hitbox/         # pointInPolygon, collision detection
  types/
    db.ts           # DB 스키마 타입 (수동 유지)
    game.ts         # 런타임 상태 타입
  pages/            # 라우팅 단위 페이지
```

---

## 2. 절대 원칙

### 원칙 1 — 물리엔진은 클라이언트 전용
런타임 물리 상태는 Zustand에서만 계산. 세션 중 Supabase write 금지. 세션 종료 시 1회만.

```typescript
// ✅ 올바름
usePhysicsStore.getState().tickWok(equipmentId)

// ❌ 금지
await supabase.from('game_equipment_state').update({ wok_temp: newTemp })
```

### 원칙 2 — 히트박스 좌표는 비율값(0~1)
`x, y, w, h` 및 `points` 배열의 모든 좌표는 부모 이미지 기준 0~1 비율.
렌더링 시에만 변환. DB에 px 저장 금지.

```typescript
// ✅ 올바름 - 렌더링 시 SVG viewBox 기준 변환
points={area.points!.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')}

// ❌ 금지 - DB에 px 저장
{ x: 320, y: 180, w: 64, h: 64 }
```

### 원칙 3 — navigate는 FK로 참조
`area_definitions.navigate_zone_id`는 `kitchen_zones.id` (UUID FK).
zone_key 문자열 저장 금지.

### 원칙 4 — 재료 상태는 action_history로 판별
별도 status 컬럼 추가 금지. action_history의 actionType + seconds로 계산.

### 원칙 5 — 그릇 묶음은 assigned_order_id로
bundle_pair_id, group_id, 더블클릭 UI 추가 금지.

### 원칙 6 — equipment는 컴포넌트 배치
area_type='equipment'는 단순 드롭존이 아님. 장비 컴포넌트 렌더링 + 물리법칙 작동.

### 원칙 7 — 슬라이드 클램프는 렌더링 크기 기준
DB의 image_width/height는 히트박스 비율 좌표 계산용.
슬라이드 클램프는 `img.offsetWidth` (렌더링된 실제 크기) 사용.

```typescript
// ✅ 올바름
const renderedWidth = imgRef.current.offsetWidth;

// ❌ 금지
const renderedWidth = zone.image_width; // DB값 사용 금지
```

---

## 3. 히트박스 Shape 규칙

### 두 가지 모드

| 모드 | 조건 | 저장 형식 |
|------|------|----------|
| rectangle | `points = null` | x, y, w, h (비율) |
| polygon | `points != null` | points 배열 + bounding box (x/y/w/h) |

### points 저장 규칙
- 꼭짓점 순서: 시계 방향 (TL → TR → BR → BL)
- 최소 3개 꼭짓점
- 모든 좌표 0~1 범위 클램프
- polygon 저장 시 bounding box(x/y/w/h)도 함께 계산해서 저장

```typescript
// bounding box 자동 계산 (polygon 저장 시 필수)
const xs = points.map(p => p[0]);
const ys = points.map(p => p[1]);
const x = Math.min(...xs);
const y = Math.min(...ys);
const w = Math.max(...xs) - x;
const h = Math.max(...ys) - y;
```

### 렌더링 규칙
rectangle과 polygon 모두 **SVG로 통일** 렌더링.
div + CSS left/top/width/height 방식 사용 금지.
**게임 HitboxItem과 어드민 HitboxEditor 모두 동일하게 적용.**
둘의 차이는 fill/stroke 색상뿐이다.

```tsx
// 게임 HitboxItem: 완전 투명
<polygon points="..." fill="transparent" stroke="none" />
<rect x y width height fill="transparent" stroke="none" />

// 어드민 에디터: area_type별 색상 표시
<polygon points="..." fill="rgba(0,200,0,0.15)" stroke="rgba(0,200,0,0.8)" strokeWidth="2" />
<rect x y width height fill="rgba(0,200,0,0.15)" stroke="rgba(0,200,0,0.8)" strokeWidth="2" />
```

SVG 컨테이너 (게임/어드민 공통):
```tsx
<svg viewBox="0 0 1000 1000" preserveAspectRatio="none"
  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
  {areas.map(area => <HitboxItem key={area.id} area={area} />)}
</svg>
```

이 규칙을 지키지 않으면 어드민 에디터에서 핸들 좌표 계산 기준이
rectangle(div)과 polygon(SVG) 사이에 달라져 핸들 위치가 어긋나는 버그가 발생한다.

---

## 4. DB 테이블별 작업 규칙

### area_definitions — 히트박스

```
컬럼 목록:
  id, store_id, zone_id, label, area_type
  x, y, w, h          ← 비율(0~1). polygon 모드에서는 bounding box
  points              ← jsonb, nullable. polygon 꼭짓점 배열
  ingredient_id, container_id, navigate_zone_id
  equipment_type, equipment_index, drag_image_url
```

- 4가지 연결 FK 중 반드시 하나는 not null (CHECK constraint)
- area_type과 연결 FK 반드시 일치

| area_type | not null이어야 하는 필드 |
|-----------|------------------------|
| ingredient | ingredient_id |
| container | container_id |
| navigate | navigate_zone_id |
| equipment | equipment_type + equipment_index |

### game_ingredient_instances — 재료 인스턴스

location_type에 따라 딱 하나의 위치 FK만 채움.

| location_type | 채울 필드 |
|---------------|-----------|
| zone | zone_id |
| equipment | equipment_state_id |
| container | container_instance_id |
| hand | (모두 null) |
| disposed | (모두 null) |

---

## 5. Zustand 스토어 설계 규칙

| 스토어 | 역할 |
|--------|------|
| `useGameStore` | 재료/그릇/주문 상태 |
| `useEquipmentStore` | 장비 물리 상태 |
| `useUiStore` | 뷰포트/사이드바/모달 상태 |

물리엔진 tick은 `useGameTick` hook에서만 실행.
컴포넌트에서 직접 setInterval로 상태 변경 금지.

---

## 6. 드래그앤드롭(@dnd-kit) 규칙

### DragSource 타입
| 타입 | 설명 |
|------|------|
| `hitbox-ingredient` | ingredient 히트박스 → 재료 인스턴스 생성 |
| `hitbox-container` | container 히트박스 → 그릇 인스턴스 생성 |
| `equipment-content` | 웍·튀김채 안의 재료 → 그릇으로 이동 |

### DropTarget 타입
| 타입 | 허용 DragSource |
|------|----------------|
| `right-sidebar` | `hitbox-container` |
| `wok` | `hitbox-ingredient`, `hand-ingredient` |
| `frying-basket` | `hitbox-ingredient`, `hand-ingredient` |
| `microwave` | `hitbox-ingredient`, `hand-ingredient` |
| `container-instance` | `equipment-content` |
| `hand-bar` | `hitbox-ingredient` |

### Collision Detection
polygon 히트박스에는 커스텀 collision detection 사용.
`src/lib/hitbox/collision.ts`의 `polygonCollision` 함수.
point-in-polygon은 `src/lib/hitbox/pointInPolygon.ts`의 ray casting 알고리즘.

허용되지 않은 조합의 드롭은 무효 처리 (아무 변화 없음).

---

## 7. 좌표계 변환 규칙

### 어드민 에디터 — 마우스 → 비율 저장
```typescript
const rect = containerEl.getBoundingClientRect();
const x = (e.clientX - rect.left) / rect.width;  // 0~1
const y = (e.clientY - rect.top) / rect.height;   // 0~1
```

### 게임 렌더링 — 비율 → SVG 좌표
```typescript
// viewBox="0 0 1000 1000" 기준
const svgX = ratio * 1000;
```

### 슬라이드 클램프 — 렌더링 크기 기준
```typescript
const renderedImageWidth = imgRef.current.offsetWidth; // onLoad 시 저장
const maxOffset = -(renderedImageWidth - containerWidth);
const clamped = Math.min(0, Math.max(maxOffset, newOffset));
```

---

## 8. 어드민 에디터 히트박스 편집 규칙

### 그리기 모드 전환
- rectangle 모드 (기본): 드래그로 시작/끝점 지정
- polygon 모드: 클릭으로 꼭짓점 추가, 더블클릭으로 완성

### 편집 핸들 규칙
- 배치된 히트박스 클릭 → 선택 + 꼭짓점 핸들 표시
- 핸들: 8px 원형, 색상은 area_type별 구분색
- 핸들 드래그 → 해당 꼭짓점만 이동
- 히트박스 본체 드래그 → 전체 이동
- **mousemove/mouseup은 반드시 document 레벨에 등록**
  (이미지 밖으로 마우스 이동해도 핸들 끊기지 않음)
- 모든 좌표 0~1 클램프

### area_type별 핸들/테두리 색상
| area_type | 색상 |
|-----------|------|
| ingredient | 초록 rgba(0,200,0) |
| container | 파랑 rgba(0,100,255) |
| navigate | 노랑 rgba(255,200,0) |
| equipment | 주황 rgba(255,120,0) |

---

## 9. 웍 물리엔진 규칙

상태 전이:
```
clean → (재료 비우면) → dirty
dirty → (씽크 3초) → clean
clean/dirty → (온도 초과) → overheating
overheating → (계속 방치) → burned
burned → 씽크 세척 불가, 버려야 함
```

- dirty 상태에서 재료 투입 불가 (UI에서 차단)
- burner_level 0~3, 레벨별 온도 상승: [0, 5, 10, 20]°C/초
- 자연 냉각: 3°C/초
- 250°C 초과 → overheating
- 350°C 초과 → burned

---

## 10. 튀김채 물리엔진 규칙

```typescript
// ✅ 올바름
if (basket.status === 'down') {
  accumulateActionHistory(basket.ingredientIds, 'fry', 1)
}

// ❌ 금지
accumulateActionHistory(basket.ingredientIds, 'fry', 1) // status 무관
```

---

## 11. 어드민 vs 게임 분리 원칙

- `src/components/admin/` ↔ `src/components/game/` 절대 import 금지
- 공용 UI만 `src/components/shared/`에 위치
- 어드민 히트박스: 색상 표시 + 편집 가능
- 게임 히트박스: 완전 투명 (fill/stroke 없음)

---

## 12. Storage 파일명 규칙

**영문 소문자 + 언더스코어만 허용.**
공백, 한글, 대문자, 특수문자 포함 파일명 업로드 전 rename 필수.

```
✅ 올바름: frame_1.png, fold_fridge_interior.png
❌ 금지: Frame 1.png, 냉장고내부.png, Frame_1.PNG
```

---

## 13. TypeScript 타입 규칙

- `any` 타입 사용 금지. 모르는 타입은 `unknown` + 타입 가드.
- DB 타입(`db.ts`)과 런타임 타입(`game.ts`) 분리 유지.
- Supabase 자동생성 타입 사용 금지. 수동 유지.

---

## 14. 자주 틀리는 패턴 (금지 목록)

| 패턴 | 이유 | 대안 |
|------|------|------|
| navigate_zone_id에 zone_key 저장 | FK 참조 깨짐 | UUID 사용 |
| 히트박스 좌표 px 저장 | 화면 크기 대응 불가 | 비율 0~1 |
| 매 tick마다 Supabase write | 비용·성능 파괴 | Zustand만 |
| 재료에 status 컬럼 추가 | 경우의 수 무한 | action_history |
| bundle_pair_id로 그릇 묶기 | 설계 위반 | assigned_order_id |
| HitboxItem/에디터를 div로 렌더링 | polygon 표현 불가 + 핸들 좌표 기준 어긋남 | 게임/어드민 모두 SVG polygon/rect |
| image_width로 슬라이드 클램프 | 렌더링 크기와 다를 수 있음 | img.offsetWidth |
| mousemove를 컨테이너 레벨 등록 | 핸들 드래그 끊김 | document 레벨 등록 |
| polygon 저장 시 bounding box 생략 | broad phase collision 불가 | 함께 계산해서 저장 |
| any 타입 사용 | 타입 안전성 파괴 | 명시적 타입 + 타입 가드 |
| Zustand 셀렉터 안에서 filter/map 직접 호출 | 매 렌더마다 새 배열 참조 → 무한 리렌더 | useMemo로 파생 계산 분리 |
| MW done 상태에서 재료 draggable 비활성화 | 재료 꺼낼 수 없음 | running 중일 때만 비활성화 |
| 외부 URL(Notion 등)을 drag_image_url에 사용 | 만료 토큰으로 시간 지나면 접근 불가 | Supabase Storage URL 사용 |
| drag_image_url을 히트박스 드래그에만 적용 | 장비 내 재료 드래그 시 이미지 없음 | 장비 내 재료 draggable data에도 포함 |

---

## 15. 변경 불가 결정 사항

1. **물리엔진은 클라이언트 전용**
2. **좌표는 비율값 (px 방식 불가)**
3. **그릇 묶음은 assigned_order_id**
4. **재료 상태는 action_history**
5. **navigate_zone_id는 UUID FK**
6. **시점이동 버튼은 고정 UI (DB 저장 불가)**
7. **equipment 히트박스는 컴포넌트 배치**
8. **히트박스 렌더링은 SVG (div CSS 방식 불가)**
9. **슬라이드 클램프는 img.offsetWidth 기준**
10. **오른쪽 사이드바는 기본 닫힘 상태**
11. **레시피 판별 로직은 src/lib/recipe/evaluate.ts 순수 함수로만**

---

## 16. 오른쪽 사이드바 규칙

- 기본 상태: 닫힘. 오른쪽 가장자리에 `<<` 버튼만 표시.
- 열리는 조건: `<<` 버튼 클릭 OR 드래그 중 `<<` 버튼 영역 200ms 이상 호버.
- 드래그 호버 자동 열기는 `onDragMove`에서 감지. 타이머 ref로 관리.
- uiStore의 `rightSidebarOpen` 상태로 관리.

---

## 17. 그릇 이미지 + recipe_steps 규칙

- 그릇 드롭 직후: `containers.image_url` 표시.
- 주문 배정 후: `recipe_steps.step_order=0` 이미지 표시.
- 재료 담길 때마다: 그릇 내 `plate_order` 최댓값 = 현재 step_order.
- `recipe_steps`에 해당 step_order 없으면 이전 step 이미지 유지.
- step_order 0 이미지는 빈 접시와 동일한 이미지로 설정 권장.

```typescript
// 현재 step 계산
const currentStep = inContainerIngredients.length > 0
  ? Math.max(...inContainerIngredients.map(i => i.plate_order ?? 0))
  : 0;
```

---

## 18. 드래그 이미지 우선순위 (전체 적용)

아래 우선순위는 **모든 draggable**에 적용한다.  
히트박스 드래그뿐 아니라 장비 내 재료, 핸드바 재료 드래그에도 동일하게 적용.

```
1. area_definitions.drag_image_url (개별 지정값)
2. store_ingredients.image_url (fallback)
3. 없으면 재료명 텍스트
```

장비 내 재료 draggable data에 반드시 `dragImageUrl` 필드 포함:
```typescript
data: {
  type: 'ingredient',
  ingredientId: inst.ingredient_id,
  ingredientInstanceId: inst.id,
  dragImageUrl: storeIngredientsMap.get(inst.ingredient_id)?.image_url ?? null,
}
```

---

_최종 업데이트: Phase 2 계획 수립 (버그 수정 + recipe_steps + 사이드바 리디자인)_