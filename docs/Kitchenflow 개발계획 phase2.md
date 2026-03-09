# KitchenFlow 개발 계획서 — Phase 2 (디테일 구현)

> **목적**: Phase 1(0~5)에서 완성된 코어 게임 루프 위에 디테일 기능을 추가한다.  
> **중요**: 각 작업 시작 전 반드시 관련 파일을 직접 읽고 현재 구조를 파악한 뒤 수정한다.  
> 코드 스니펫을 그대로 붙여넣지 말 것. 현재 파일 구조에 맞게 적용한다.  
> 각 항목은 독립적으로 완결된다. 다음 항목 시작 전 `npm run build` 오류 없음 확인.

---

## 현재 완료 상태 (Phase 1 결과)

- Phase 0: 프로젝트 뼈대 ✅
- Phase 1: 어드민 히트박스 에디터 (polygon 지원) ✅
- Phase 2: 게임 레이아웃 + SVG 히트박스 렌더링 ✅
- Phase 3: DnD 상호작용 ✅
- Phase 4: 물리엔진 (웍/튀김채/MW/씽크) ✅
- Phase 5: 레시피 판별 + 서빙 ✅

---

## DB 변경 이력

| 버전 | 변경 내용 |
|------|----------|
| v1 | 초기 스키마 (001_kitchen_flow_schema.sql) |
| v1 | 시드 데이터 (002_seed_data.sql) |
| v2 | drawer_fridge zone 재구성 |
| v2 | points 컬럼 추가 (003_add_points_column.sql) |
| Phase2 | recipe_steps 테이블 추가 (아래 참고) |

---

## Phase 2-A: 버그 수정

### 버그 1 — 웍/튀김채 draggable 근본 수정 (핵심)

**작업 시작 전 읽을 파일**:
```
src/components/equipment/WokComponent.tsx
src/components/equipment/FryingBasketComponent.tsx
src/pages/GamePage.tsx
src/types/game.ts
```

**근본 문제**:
현재 웍/튀김채 내부 재료들이 개별 또는 묶음으로 draggable 처리되어 있음.
웍/튀김채 컴포넌트 자체에 draggable이 없어서:
- 웍을 그릇에 드래그해서 내용물을 붓는 동작 불가
- 웍을 씽크에 드래그해서 세척하는 동작 불가

**올바른 동작**:
- 웍/튀김채 컴포넌트 전체가 하나의 draggable
- 웍을 드래그 → container-instance에 드롭 → 웍 내용물 전체가 그릇으로 이동 → wok_status = 'dirty'
- 웍을 드래그 → equipment-sink에 드롭 → 세척 (burned면 차단)
- 튀김채를 드래그 → container-instance에 드롭 → 내용물 이동 (basket_status = 'up'일 때만 draggable 활성화)
- 내용물 없는 웍/튀김채는 draggable 비활성화

**수정 지침**:

WokComponent.tsx:
- 파일을 읽고 현재 draggable 구조 파악
- 재료 개별/묶음 draggable 있으면 제거
- 웍 컴포넌트 전체(또는 드래그 핸들 영역)에 useDraggable 적용
- data에 type='equipment', equipmentType='wok', equipmentStateId 포함
- 내용물 없을 때 disabled=true

FryingBasketComponent.tsx:
- 파일을 읽고 현재 draggable 구조 파악
- 동일하게 컴포넌트 전체 draggable 적용
- basket_status==='down'일 때 disabled=true (내려가 있는 동안 드래그 불가)
- data에 type='equipment', equipmentType='frying_basket', equipmentStateId 포함

GamePage.tsx onDragEnd:
- 파일을 읽고 현재 Case 4, Case 5 처리 구조 파악
- equipment(wok/basket) → container-instance 케이스가 현재 구조에 맞게 처리되는지 확인
- equipment(wok) → equipment-sink 케이스가 현재 구조에 맞게 처리되는지 확인
- 누락되거나 잘못된 부분만 수정

**완료 기준**:
- 웍 드래그 → 그릇 드롭 → 내용물 이동 + dirty 전환 콘솔 확인
- 웍 드래그 → 씽크 드롭 → 3초 후 clean 전환 확인
- 튀김채 up 상태에서 드래그 → 그릇 드롭 → 내용물 이동 확인
- npm run build 오류 없음

---

### 버그 2 — MW done 상태 재료 드래그 불가

**작업 시작 전 읽을 파일**:
```
src/components/equipment/MicrowaveComponent.tsx
```

**근본 문제**: MW done 상태일 때 내부 재료 draggable이 비활성화되어 재료를 꺼낼 수 없음.

**올바른 동작**: running 중일 때만 draggable 비활성화. idle/done 상태에서는 재료 draggable 활성화.

**수정 지침**: 파일을 읽고 disabled 조건을 파악한 뒤 `mw_status === 'running'`일 때만 비활성화하도록 수정.

**완료 기준**: MW done 상태에서 재료 드래그 가능 확인.

---

### 버그 3 — 장비 내 재료 드래그 이미지 텍스트 표시

**작업 시작 전 읽을 파일**:
```
src/components/equipment/MicrowaveComponent.tsx
src/pages/GamePage.tsx (onDragStart, DragOverlay 부분)
```

**근본 문제**: MW 내부 재료 draggable data에 dragImageUrl이 없어서 DragOverlay가 이미지 대신 텍스트 표시.
(웍/튀김채는 버그1 수정으로 재료 개별 draggable이 제거되므로 해당 없음)

**드래그 이미지 우선순위 (전체 적용)**:
```
1. area_definitions.drag_image_url
2. store_ingredients.image_url
3. 없으면 재료명 텍스트
```

**수정 지침**:
- MicrowaveComponent의 재료 draggable data에 dragImageUrl 필드 추가
- ingredient_id로 storeIngredientsMap에서 image_url 조회
- GamePage onDragStart에서 이 값을 받아 DragOverlay에 반영하는지 확인

**완료 기준**: MW 재료 드래그 시 이미지 표시 확인.

---

## Phase 2-B: DB 추가 — recipe_steps

**작업 시작 전 읽을 파일**:
```
src/types/db.ts
supabase/migrations/ (기존 migration 파일 구조 파악)
```

**수행할 작업**:

1. Supabase에서 아래 SQL 실행:
```sql
CREATE TABLE recipe_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 0,
  image_url text NOT NULL,
  UNIQUE(recipe_id, step_order)
);

ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store members can read recipe_steps"
  ON recipe_steps FOR SELECT USING (true);
CREATE POLICY "store admins can manage recipe_steps"
  ON recipe_steps FOR ALL USING (true);
```

2. migration 파일로 004_recipe_steps.sql 생성

3. src/types/db.ts에 RecipeStep 인터페이스 추가

**step_order 기준**:
```
step_order 0 = 빈 접시 이미지 (containers.image_url과 동일 이미지 권장)
step_order N = 그릇 내 재료 plate_order 최댓값이 N일 때 표시
```

**완료 기준**: Supabase 대시보드에서 recipe_steps 테이블 확인.

---

## Phase 2-C: 오른쪽 사이드바 리디자인

**작업 시작 전 읽을 파일**:
```
src/components/layout/RightSidebar.tsx
src/components/layout/RightSidebar.module.css
src/stores/uiStore.ts
src/pages/GamePage.tsx
```

**현재 문제**: 항상 열려 있어서 주방 이미지를 가림. 그릇 이미지 미표시. 스텝 이미지 전환 없음.

**새 동작 설계**:

기본 상태: 닫힘. 오른쪽 가장자리에 `<<` 버튼만 표시.

열리는 조건:
1. `<<` 버튼 클릭
2. 드래그 중 `<<` 버튼 영역에 200ms 이상 호버

닫히는 조건: 사이드바 외부 클릭

**수정 지침**:

uiStore.ts:
- 파일을 읽고 현재 구조 파악
- rightSidebarOpen 상태 + setRightSidebarOpen + toggleRightSidebar 액션 추가

RightSidebar.tsx:
- 파일을 읽고 현재 구조 파악
- rightSidebarOpen 상태에 따라 열림/닫힘 CSS 처리
- `<<` 토글 버튼 추가 (id='right-sidebar-toggle')
- 외부 클릭 감지로 닫기 (useEffect + document mousedown)
- ContainerCard에 그릇 이미지 표시:
  - assigned_order_id 없으면: containers.image_url
  - assigned_order_id 있으면: recipe_steps에서 현재 step 이미지
  - 현재 step = 그릇 내 재료 plate_order 최댓값 (없으면 0)
  - 해당 step_order 없으면 containers.image_url fallback

GamePage.tsx:
- 파일을 읽고 onDragMove 처리 구조 파악
- onDragMove에서 `<<` 버튼 호버 감지 → 200ms 타이머 → setRightSidebarOpen(true)
- 타이머 ref로 관리, 호버 벗어나면 타이머 취소
- recipe_steps를 storeId 기준으로 1회 로딩 → RightSidebar에 전달

**완료 기준**:
- 기본 닫힘 상태 확인
- `<<` 버튼 클릭으로 열림/닫힘 확인
- 드래그 중 `<<` 버튼 호버 200ms 후 자동 열림 확인
- 그릇 드롭 시 접시 이미지 표시 확인
- 주문 배정 후 step 0 이미지 표시 확인
- 재료 담길 때마다 step 이미지 업데이트 확인

---

## Phase 2-D: 왼쪽 사이드바 닫기

**작업 시작 전 읽을 파일**:
```
src/components/layout/LeftSidebar.tsx
src/stores/uiStore.ts
```

**현재 문제**: navigate 히트박스 클릭으로 열리지만 사이드바 외부 클릭해도 닫히지 않음.

**수정 지침**:
- 파일을 읽고 현재 열림/닫힘 구조 파악
- leftSidebarZoneId가 null이 아닐 때 document mousedown 이벤트 등록
- 클릭 대상이 사이드바 ref 내부가 아니면 setLeftSidebarZone(null) 호출
- 컴포넌트 언마운트 또는 닫힐 때 이벤트 리스너 제거

**완료 기준**: 냉장고 열고 → 사이드바 외부 클릭 → 사이드바 닫힘 확인.

---

## 작업 순서

```
Phase 2-A 버그1: 웍/튀김채 draggable 근본 수정 ← 가장 먼저
  ↓
Phase 2-A 버그2: MW done 재료 드래그
Phase 2-A 버그3: MW 재료 드래그 이미지
  ↓
Phase 2-B: DB recipe_steps 테이블 생성
  ↓
Phase 2-C: 오른쪽 사이드바 리디자인 (recipe_steps 의존)
  ↓
Phase 2-D: 왼쪽 사이드바 닫기
```

---

## Phase 2 완료 기준

- [ ] 웍 컴포넌트 자체 draggable → 그릇 드롭 시 내용물 이동 + dirty
- [ ] 웍 → 씽크 드롭 시 3초 세척
- [ ] 튀김채 컴포넌트 자체 draggable (up 상태만) → 그릇 드롭 시 내용물 이동
- [ ] MW done 상태 재료 draggable 활성화
- [ ] MW 재료 드래그 시 이미지 표시
- [ ] 오른쪽 사이드바 기본 닫힘 + `<<` 버튼으로 열림
- [ ] 드래그 중 `<<` 버튼 200ms 호버 시 자동 열림
- [ ] 그릇 이미지 + step 이미지 전환 동작
- [ ] 왼쪽 사이드바 외부 클릭 시 닫힘
- [ ] npm run build 오류 없음

---

## 미결 사항 (Phase 3 이후)

- Phase 6: 로그인 (매장코드 + 직원 선택) + 세션 DB 저장
- 점수 계산 + 결과 화면
- 주문 자동 생성 (현재 수동 INSERT)
- RLS 정책 검증

---

_최종 업데이트: Phase 2 계획 재작성 — 파일 선읽기 방식으로 전환, 하드코딩 스니펫 제거_