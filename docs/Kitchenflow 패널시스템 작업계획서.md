# KitchenFlow — 패널 시스템 전면 구현 작업계획서

> **작성일**: 2026-04-01
> **작성자**: Claude AI (지휘관)
> **승인자**: sjb (최상위 지휘관)
> **목적**: 기존 파노라마+히트박스 시스템을 종이접기 패널 주방 시스템으로 전면 교체하는 전체 구현 계획
> **이 문서는 대화 메모리 압축 시에도 맥락을 유지하기 위한 완전한 참조 문서다.**

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악. 원칙서 위배 사전 확인.
2. 정보 검토 — Claude Code에 최신 코드 확인 지시 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 sjb에게 제시하고 승인 요청
4. 검토    — 피드백 반영, 원칙 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현 지시
6. 확인    — tsc --noEmit + npm run build + 브라우저 실기기 검증
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일 경로/코드를 지시
- 구현 코드 스니펫을 직접 작성하여 지시
- 승인과 수정 요청을 동시에 하기
- 기존 파노라마/히트박스 코드를 재활용하려는 시도

**Claude Code 지시 시 반드시 읽게 할 문서:**
- `CLAUDE.md` (매 작업)
- `KitchenFlow_패널시스템_원칙서.md` (매 작업)
- 해당 Phase별 추가 문서 (아래 각 Phase에 명시)

---

## 1. 전체 구조 개요

### 1.1 교체 대상 (제거)

| 제거 대상 | 대체 |
|-----------|------|
| 파노라마 이미지 기반 주방 배경 + 슬라이드 | 패널 시스템 배경 이미지 (고정) |
| SVG 히트박스 좌표 체계 (area_definitions 히트박스 관련) | 패널 위 장비 배치 |
| 섹션 네비게이션 (section_config, currentSection) | 후순위 (장비 기준 네비게이션으로 대체 예정) |
| 빌지큐 파노라마 좌표 기반 위치 | 패널 시스템에 맞게 재설계 |
| 어드민 "히트박스 편집" 탭 | 새 "주방 레이아웃" 탭 |
| HitboxEditor, HitboxEditorPanel, SectionEditor | 새 편집 컴포넌트 |
| HitboxLayer, HitboxItem, DraggableHitbox | 새 장비 렌더링 |
| BasketGroup (호버 펼침) | 새 바구니 시스템 |

### 1.2 유지 대상 (연결은 후순위)

| 유지 대상 | 상태 |
|-----------|------|
| 재료 DnD (@dnd-kit) | 로직 유지, 연결점만 변경 (2차) |
| 웍/튀김채/MW/씽크 물리 로직 (equipmentStore) | 유지, 트리거 방식만 변경 (2차) |
| 레시피/주문/점수 시스템 | 그대로 유지 |
| game_equipment_state 테이블 | 구조 유지, 참조 방식만 변경 |
| 인증/유저 시스템 | 영향 없음 |
| GameHeader, BillQueue, Handbar, 사이드바 | UI 재배치 (Phase 4) |

### 1.3 1차 구현 경계선

**만든다 (껍데기):**
- 패널 시스템 전체 (편집 + 미리보기 + DB 저장)
- 모든 장비의 배치, 외형, 고유 인터랙션
- 모든 버튼과 UI 요소

**만들되 연결하지 않는다:**
- 볶기 버튼 (UI만, 웍 로직 미연결)
- 불조절 버튼 (UI만, 불 로직 미연결)
- 씻기 버튼 (UI만, 세척 로직 미연결)
- 홀로그램 재료 텍스트 (영역만, 데이터 미연결)

**만들지 않는다:**
- 바구니/서랍 내부 그리드 편집 영역 (별도 2배 확대 편집 영역)
- 재료 드래그 앤 드롭 연결
- 장비 올려놓기 기능 (placeable)
- 장비 기준 섹션 네비게이션
- @dnd-kit droppable 미리 설정 (2차에서 클릭/터치 방식 결정)

---

## 2. 변경 불가 원칙 요약 (원칙서에서 발췌)

### 2.1 CSS 3D 기술 제약
- 순수 CSS 3D만 (Three.js 등 금지)
- transform 순서: `translateZ → rotateX` (이동 먼저, 방향 나중)
- hit-test: scene 레벨 `getBoundingClientRect()` (pointer-events 의존 금지)
- 애니메이션: 0.6초 CSS transition
- DOM: div 부모-자식 중첩, 편집/미리보기 동일 DOM, rotateX만 전환

### 2.2 패널 구조
- 패널 3장 고정 (추가/삭제 불가)
- 패널 1: 기준면 (상부 벽면), 패널 2: 수평 (작업면), 패널 3: 수직 (하부 전면)
- 주방 패널: 미리보기/인게임에서 DOM 유지 + 투명 (display:none 금지)
- 폴드 냉장고 내부 패널 2장: 모든 모드에서 보임 (흰색)
- 화구: 패널 2 전용 (유일한 배치 하드 제약)

### 2.3 장비 원칙
- 장비 = 패널 표면의 2D 면 (독립 3D 오브젝트 아님)
- UI상 웍 없음 — 화구 자체가 장비, 볶기/불조절 버튼이 화구에 직접 존재
- 화구 불 단계: 0(꺼짐) → 1(약불) → 2(강불) → 0 순환, 색상 변화
- 홀로그램: 패널 1 영역, 화구 X좌표/크기 동일, 미리보기/인게임에서만 자동 생성
- 서랍: 3레이어(컨테이너 > 내부 판 + face), translateZ만 변화, rotateX(-90deg) 고정
- 서랍/폴드냉장고 외형: 은색 철판 + 까만색 손잡이
- 폴드 냉장고: 내부 패널 2장, 가운데 rotateX(90deg), 재료 bottom rotateX(-90deg) 역회전
- 바구니: 패널 2 수평 보정(getBasketCorrection), 셀 rotateX(-90deg), maxRow 기준 Z축 상승
- 바구니/서랍 내부 편집: 별도 2배 확대 편집 영역 (1차 미구현)
- 선반: UI 전용, 기능 없음

### 2.4 워크플로우
- 편집 → 미리보기 → 저장 (순서 고정, 미리보기 없이 저장 불가)
- 미리보기에서 패널 덩어리 상하 위치 조정 → DB 기록 → 인게임 기반 렌더링

### 2.5 기존 코딩 원칙 (계속 유효)
- 물리엔진 클라이언트 전용 (Zustand, 세션 중 DB write 금지)
- action_history 판별 (status 컬럼 금지)
- assigned_order_id 묶음 (group_id 금지)
- 재료 인스턴스 드롭 성공 후에만 생성
- any 타입 금지 (unknown + 타입 가드)
- Zustand 셀렉터 인라인 filter/map 금지
- CSS 변수는 gameVariables.css에 정의
- 어드민/게임 컴포넌트 공유 금지 (shared만 공용)

### 2.6 폐기된 원칙 (패널 시스템으로 인해 적용 안 됨)
- 비율 좌표(0~1) 히트박스 저장 → 히트박스 시스템 자체가 폐기
- navigate FK 참조 → 섹션 네비게이션 폐기
- SVG 통일 렌더링 → SVG 히트박스 폐기
- equipment 히트박스 위 컴포넌트 배치 → 패널 위 2D 면 직접 배치
- 슬라이드 클램프 img.offsetWidth → 파노라마 슬라이드 폐기
- drag_image_url vs overlay_image_url 분리 → 히트박스 이미지 폐기

### 2.7 문서 간 불일치 해결

| 불일치 | 3D패널 설명서 | 원칙서 | 결정 |
|--------|-------------|--------|------|
| 패널 수 | "추가/삭제 가능" | "3장 고정" | **원칙서 우선: 3장 고정** |

---

## 3. DB 스키마 설계

### 3.1 새 테이블: `panel_layouts`

매장(store)당 1개의 패널 레이아웃 설정.

```sql
CREATE TABLE panel_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- 배경 이미지 (기존 kitchen_zones.image_url을 대체)
  background_image_url text DEFAULT NULL,
  
  -- 패널 높이 비율 (3개 요소, 합계 = 1.0)
  -- 예: [0.3, 0.4, 0.3] → 패널1 30%, 패널2 40%, 패널3 30%
  panel_heights jsonb NOT NULL DEFAULT '[0.3, 0.4, 0.3]',
  
  -- CSS perspective 값 (기본 45도)
  perspective_deg numeric NOT NULL DEFAULT 45,
  
  -- 미리보기에서 조정한 패널 덩어리의 수직 위치 (뷰포트 높이 대비 비율, 0~1)
  -- 0.5 = 중앙, 0.3 = 위쪽, 0.7 = 아래쪽
  preview_y_offset numeric NOT NULL DEFAULT 0.5,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- 매장당 1개 레이아웃
  UNIQUE(store_id)
);

-- RLS 활성화
ALTER TABLE panel_layouts ENABLE ROW LEVEL SECURITY;
```

### 3.2 새 테이블: `panel_equipment`

패널 위에 배치된 개별 장비.

```sql
CREATE TABLE panel_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES panel_layouts(id) ON DELETE CASCADE,
  
  -- 어떤 패널에 배치되었는지 (1, 2, 3)
  panel_number smallint NOT NULL CHECK (panel_number IN (1, 2, 3)),
  
  -- 장비 종류
  equipment_type text NOT NULL CHECK (equipment_type IN (
    'drawer',        -- 서랍 (냉장고)
    'fold_fridge',   -- 폴드 냉장고
    'basket',        -- 바구니
    'burner',        -- 화구
    'sink',          -- 씽크대
    'worktop',       -- 작업대
    'shelf'          -- 선반
  )),
  
  -- 패널 내 위치 (패널 너비/높이 대비 비율 0~1)
  x numeric NOT NULL CHECK (x >= 0 AND x <= 1),
  y numeric NOT NULL CHECK (y >= 0 AND y <= 1),
  width numeric NOT NULL CHECK (width > 0 AND width <= 1),
  height numeric NOT NULL CHECK (height > 0 AND height <= 1),
  
  -- 같은 타입의 장비 구분 (burner 0, burner 1 등)
  -- game_equipment_state와 연동 시 (equipment_type, equipment_index) 쌍으로 매칭
  equipment_index smallint NOT NULL DEFAULT 0,
  
  -- 장비별 추가 설정 (미래 확장용)
  -- 서랍: { "grid_rows": 3, "grid_cols": 4, "merged_cells": [...] }
  -- 바구니: { "grid_rows": 2, "grid_cols": 3 }
  -- 폴드 냉장고: { "internal_config": {...} }
  -- 1차에서는 빈 객체 또는 최소 설정만
  config jsonb NOT NULL DEFAULT '{}',
  
  -- 올려놓기 가능 여부 (2차 기능, 스키마에 미리 포함)
  placeable boolean NOT NULL DEFAULT false,
  
  -- 정렬 순서 (Z-index, 렌더링 순서)
  sort_order smallint NOT NULL DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- 화구는 반드시 패널 2에만 배치
  CHECK (equipment_type != 'burner' OR panel_number = 2),
  
  -- 같은 레이아웃 내에서 (타입, 인덱스) 유니크
  UNIQUE(layout_id, equipment_type, equipment_index)
);

-- RLS 활성화
ALTER TABLE panel_equipment ENABLE ROW LEVEL SECURITY;
```

### 3.3 RLS 정책

기존 프로젝트의 RLS 패턴을 따른다. Claude Code가 기존 RLS 정책 패턴을 확인한 후 동일하게 작성해야 한다.

**의도:**
- `panel_layouts`: store_id 기반. 해당 매장 소속 인증 유저만 SELECT. admin만 INSERT/UPDATE/DELETE.
- `panel_equipment`: layout_id → panel_layouts → store_id 체인. 동일 접근 규칙.

**Claude Code 확인 사항:**
- 기존 `area_definitions` 또는 `kitchen_zones`의 RLS 정책 SQL을 확인
- 동일 패턴으로 새 테이블에 적용
- `store_users` 테이블과 `auth.uid()` 조인 방식 확인

### 3.4 panel_heights 유효성 (애플리케이션 레벨)

DB CHECK로 jsonb 내부를 검증하기 어려우므로 프론트엔드에서 검증:
- 배열 길이 = 3 (패널 3장 고정)
- 모든 값 > 0
- 합계 = 1.0 (±0.001 허용)
- 최소 높이 비율: 0.1 (너무 얇은 패널 방지)

### 3.5 좌표 체계 설계 근거

장비 좌표 `(x, y, width, height)`를 패널 기준 비율(0~1)로 저장하는 이유:
1. 패널 높이가 변경되어도 장비의 상대적 위치가 유지됨
2. 뷰포트 크기(반응형)에 독립적
3. 편집 모드에서 패널 높이를 드래그로 변경할 때 장비가 자동으로 비율 유지

**렌더링 변환:**
```
렌더링 시:
  장비 실제 x = equipment.x × 패널렌더링너비
  장비 실제 y = equipment.y × 패널렌더링높이
  장비 실제 width = equipment.width × 패널렌더링너비
  장비 실제 height = equipment.height × 패널렌더링높이
```

### 3.6 기존 테이블 영향 분석

| 테이블 | 영향 |
|--------|------|
| area_definitions | 1차에서 건드리지 않음. Phase 5에서 정리. 히트박스 관련 데이터는 새 시스템에서 사용하지 않음 |
| kitchen_zones | 1차에서 건드리지 않음. image_url은 panel_layouts.background_image_url로 개념 이동 |
| game_equipment_state | 구조 유지. (equipment_type, equipment_index) 매칭으로 panel_equipment와 간접 연결 |
| stores | 변경 없음. panel_layouts.store_id FK 대상 |

---

## 4. TypeScript 타입 설계

### 4.1 새 DB 타입 (src/types/db.ts에 추가)

```
-- 의도만 기술, 실제 코드는 Claude Code가 현재 db.ts 패턴 확인 후 작성 --

PanelLayout 인터페이스:
  id: string (uuid)
  store_id: string (uuid)
  background_image_url: string | null
  panel_heights: number[] (길이 3, 합계 1.0)
  perspective_deg: number
  preview_y_offset: number
  created_at: string
  updated_at: string

EquipmentType 유니온: 
  'drawer' | 'fold_fridge' | 'basket' | 'burner' | 'sink' | 'worktop' | 'shelf'

PanelEquipment 인터페이스:
  id: string (uuid)
  layout_id: string (uuid)
  panel_number: 1 | 2 | 3
  equipment_type: EquipmentType
  x: number (0~1)
  y: number (0~1)
  width: number (0~1)
  height: number (0~1)
  equipment_index: number
  config: Record<string, unknown>
  placeable: boolean
  sort_order: number
  created_at: string
```

### 4.2 런타임 타입 (src/types/game.ts에 추가 또는 새 파일)

```
-- 의도만 기술 --

PanelMode: 'edit' | 'preview'

EditorState 인터페이스:
  mode: PanelMode
  selectedEquipmentId: string | null
  isDragging: boolean
  panelHeights: number[] (편집 중 로컬 상태)

PreviewState 인터페이스:
  yOffset: number (미리보기에서 조정 중인 Y 위치)
  isFolded: boolean (접힘 상태)

EquipmentInteractionState 인터페이스:
  drawers: Record<string, { isOpen: boolean }> (서랍 id → 열림 상태)
  burners: Record<string, { fireLevel: 0 | 1 | 2 }> (화구 id → 불 단계)
  baskets: Record<string, { isExpanded: boolean }> (바구니 id → 펼침 상태)
  foldFridges: Record<string, { isOpen: boolean }> (폴드냉장고 id → 열림 상태)
```

---

## 5. Phase 1 — DB + 타입 (Step 1-1 ~ 1-3)

### Step 1-1: 새 테이블 생성 + 마이그레이션 SQL

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서

**무엇을:**
1. 지휘관이 섹션 3의 SQL을 sjb에게 제시
2. sjb가 Supabase SQL Editor에서 실행
3. 테이블 생성 확인

**SQL 실행 순서:**
1. `panel_layouts` CREATE TABLE
2. `panel_equipment` CREATE TABLE
3. RLS 정책 (Claude Code가 기존 패턴 확인 후 작성)

**검증:**
- Supabase 대시보드에서 테이블 존재 확인
- 컬럼 타입, CHECK 제약, UNIQUE 제약 확인
- RLS 정책 활성화 확인

### Step 1-2: TypeScript 타입 정의

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서

**Claude Code 지시:**
1. `src/types/db.ts` 현재 패턴 확인 (기존 인터페이스 네이밍, export 방식)
2. 섹션 4.1의 의도에 맞게 PanelLayout, PanelEquipment, EquipmentType 타입 추가
3. `src/types/game.ts` 현재 패턴 확인
4. 섹션 4.2의 의도에 맞게 런타임 타입 추가

**왜:** 이후 모든 Phase에서 이 타입을 참조. 타입이 먼저 정의되어야 코드 작성 시 타입 안전성 확보.

**검증:** `tsc --noEmit` 오류 없음

### Step 1-3: RLS 정책

**Claude Code 지시:**
1. 기존 `area_definitions` 또는 `kitchen_zones`의 RLS 정책 SQL 확인
2. 동일 패턴으로 `panel_layouts`, `panel_equipment`에 적용
3. SQL을 지휘관에게 보고

**지휘관이 확인 후 sjb에게 SQL 전달 → sjb가 실행**

---

## 6. Phase 2 — 어드민 편집 (Step 2-1 ~ 2-6)

### Step 2-1: 기존 히트박스 편집 탭 제거

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서

**Claude Code 지시:**
1. 현재 어드민 페이지의 탭 구조 확인 (파일 경로, 컴포넌트명)
2. "히트박스 편집" 탭(또는 "주방 레이아웃" 이름의 기존 탭)을 비활성화하거나 빈 상태로 전환
3. 기존 컴포넌트 파일은 아직 삭제하지 않음 (Phase 5에서 정리)

**왜:** 새 탭을 만들기 전에 기존 탭의 자리를 확보. 기존 코드 참조가 필요할 수 있으므로 삭제는 나중에.

**원칙 확인:** 어드민/게임 컴포넌트 공유 금지. 새 컴포넌트는 `src/components/admin/` 하위에 생성.

### Step 2-2: 새 "주방 레이아웃" 탭 생성

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서, 3D패널시스템_설명서

**무엇을:**
- 어드민 페이지에 새 "주방 레이아웃" 탭 추가
- 탭 내부에 모드 전환 버튼: "편집" / "미리보기"
- 초기 상태: 편집 모드
- Supabase에서 해당 store의 panel_layouts + panel_equipment 로드
- 데이터 없으면 기본값으로 빈 레이아웃 표시

**컴포넌트 구조 의도:**
```
KitchenLayoutTab (탭 루트)
  ├── LayoutToolbar (모드 전환, 저장 버튼)
  ├── PanelEditor (편집 모드)
  │   ├── BackgroundImageArea (배경 이미지)
  │   ├── PanelStrip (패널 3장 + 높이 조절 핸들)
  │   ├── EquipmentPalette (장비 드래그 팔레트)
  │   └── EquipmentOnPanel (배치된 장비 표시)
  └── PanelPreview (미리보기 모드)
      ├── FoldedPanelScene (CSS 3D 접힌 뷰)
      └── PreviewControls (Y오프셋 조절, 장비 인터랙션)
```

**Claude Code가 결정할 것:** 실제 파일 분할, 네이밍, 기존 어드민 탭 패턴 준수 방식

### Step 2-3: 패널 3장 편집 모드

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서, 3D패널시스템_설명서

**무엇을:**
1. 배경 이미지 영역에 배경 사진을 표시 (Supabase Storage에서 로드)
2. 배경 위에 패널 3장을 반투명 오버레이로 수직 나열
3. 패널 간 경계에 드래그 핸들 → 높이 비율 조절
4. 높이 비율 합계 = 1.0 유지 (한 패널 늘리면 인접 패널 줄어듦)
5. 각 패널에 번호 라벨 표시 (1, 2, 3)

**원칙 확인:**
- 패널 3장 고정 (추가/삭제 UI 없음)
- 최소 높이 비율 0.1 제한

**왜 이 순서인가:** 패널이 먼저 렌더링되어야 장비를 위에 배치할 수 있음.

### Step 2-4: 장비 드래그 배치

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서

**무엇을:**
1. 화면 측면에 장비 팔레트 (7종: drawer, fold_fridge, basket, burner, sink, worktop, shelf)
2. 팔레트에서 장비를 드래그하여 패널 위에 드롭 → 배치
3. 배치된 장비 클릭 → 선택 상태 → 리사이즈 핸들, 복제/삭제 버튼
4. 배치된 장비 드래그 → 이동
5. 장비끼리, 장비-패널 경계 간 스냅 정렬 (10px 이내)

**배치 제약 (하드 밸리데이션):**
- burner는 panel_number=2에만 드롭 가능. 다른 패널에 드롭 시도 시 거부 + 시각적 피드백.
- 다른 장비는 1/2/3 어디든 가능.

**equipment_index 자동 할당:**
- 같은 타입의 장비를 추가할 때 기존 최대 index + 1
- 예: burner 0이 이미 있으면 다음 burner는 index 1

**좌표 저장:**
- 드롭 위치를 패널 기준 비율(0~1)로 변환하여 로컬 상태에 저장
- DB 저장은 Step 2-6에서 일괄

### Step 2-5: 패널 높이 조절

**무엇을:**
- Step 2-3에서 만든 높이 조절 핸들의 드래그 동작 구현
- 드래그 중 실시간으로 패널 높이 비율 변경
- 장비 위치는 패널 내 비율이므로 자동으로 스케일

**제약:**
- 최소 높이 비율 0.1
- 합계 1.0 유지

### Step 2-6: DB 저장/불러오기

**무엇을:**
1. **불러오기 (탭 진입 시):**
   - `panel_layouts` WHERE store_id = 현재 매장
   - 없으면 기본값 (패널 높이 [0.3, 0.4, 0.3], perspective 45, 장비 없음)
   - 있으면 `panel_equipment` WHERE layout_id 함께 로드

2. **저장 (미리보기 후):**
   - `panel_layouts` UPSERT (store_id 기준)
   - `panel_equipment` 전체 교체: 기존 전부 DELETE → 새로 INSERT
   - 트랜잭션으로 묶어야 함

**원칙 확인:**
- 편집 → 미리보기 → 저장 순서 고정
- 저장 버튼은 미리보기 모드에서만 활성화

**왜 전체 교체인가:** 장비 추가/삭제/이동이 복잡하므로 diff 계산보다 전체 교체가 단순하고 안전.

---

## 7. Phase 3 — 미리보기 (Step 3-1 ~ 3-6)

### Step 3-1: CSS 3D 패널 접기

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서, 3D패널시스템_설명서

**무엇을:**
1. 편집 → 미리보기 전환 시 패널 DOM의 rotateX 값을 변경
2. 패널 1: 기준면 (살짝 기울어짐, perspective에 의해)
3. 패널 2: 앞으로 90° (rotateX 90deg → 수평)
4. 패널 3: 아래로 90° (rotateX 90deg → 수직)
5. 전환 애니메이션: 0.6초 CSS transition

**DOM 구조 (편집과 미리보기 공유):**
```
<div class="scene" style="perspective: {perspective_deg}">
  <div class="panel-1" style="transform: rotateX({편집:0 / 미리보기:tilt})">
    [장비들]
    <div class="panel-2" style="transform-origin: bottom; transform: rotateX({편집:0 / 미리보기:90deg})">
      [장비들]
      <div class="panel-3" style="transform-origin: bottom; transform: rotateX({편집:0 / 미리보기:90deg})">
        [장비들]
      </div>
    </div>
  </div>
</div>
```

**핵심:** 부모-자식 중첩이므로 패널 2가 90° 접히면 패널 3도 같이 접히고, 패널 3의 90°는 그 위에 추가되어 수직이 됨.

**원칙 확인:**
- CSS 3D만 사용
- preserve-3d 체인 유지
- transform 순서 주의 (이 단계에서는 rotateX만, translateZ는 서랍/바구니에서)

### Step 3-2: 패널 투명 + 장비만 표시

**무엇을:**
- 미리보기 모드에서 주방 패널 3장을 시각적으로 투명하게 처리
- 패널의 배경색/테두리를 제거하되 DOM은 유지
- 장비는 그대로 보임 (패널 위의 2D 면이므로 패널이 투명해도 장비의 3D 위치는 유지)
- 배경 이미지는 보임

**금지:** `display: none` 사용. `opacity: 0` 또는 `visibility: hidden` 또는 배경색 transparent 등으로 처리.

**폴드 냉장고 내부 패널 예외:** 2장의 흰색 패널은 미리보기에서도 보임.

### Step 3-3: 패널 덩어리 상하 위치 조정 + 위치 기록

**무엇을:**
1. 미리보기 모드에서 접힌 패널 덩어리 전체를 드래그로 상하 이동
2. 이동한 Y 위치를 로컬 상태에 기록
3. 저장 시 이 위치가 `panel_layouts.preview_y_offset`에 기록
4. 인게임은 이 값을 기반으로 패널 덩어리 위치 결정

**좌표:** 뷰포트 높이 대비 비율 (0~1). 0.5 = 중앙.

### Step 3-4: 장비 인터랙션

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서, 서랍작동방식_설명서, 바구니작동방식_설명서

**무엇을 (각 장비별):**

**서랍 (drawer):**
- 클릭 → 열림/닫힘 토글
- 열림: face(서랍 정면)와 내부 판의 translateZ 값 증가
- rotateX(-90deg)는 고정 — 애니메이션하지 않음
- hit-test: scene 레벨 getBoundingClientRect()

**화구 (burner):**
- 불조절 버튼 클릭 → 불 단계 순환: 0→1→2→0
- 불 단계에 따라 화구 전체 색상 변화 (0: 기본, 1: 주황/약, 2: 빨강/강)
- 볶기 버튼 → UI만 (로직 미연결)
- **UI상 웍 그래픽 없음** — 화구 자체 = 장비

**바구니 (basket):**
- 펼치기 버튼 클릭 → 셀들이 Z축으로 계단식 상승
- 접기 → 원래 위치로 복귀
- 패널 2 수평 보정 적용 (getBasketCorrection)
- 셀 세우기: rotateX(-90deg), transformOrigin: bottom center

**폴드 냉장고 (fold_fridge):**
- 클릭 → 열림/닫힘 토글
- 열림 시 내부 패널 2장 보임 (흰색, 가운데 기준 rotateX(90deg)로 수직)
- 내부 재료/바구니: bottom 기준 rotateX(-90deg)로 역회전

**씽크대 (sink):**
- 씻기 버튼 → UI만 (로직 미연결)

**작업대 (worktop):**
- 인터랙션 없음 (바탕 면)

**선반 (shelf):**
- 인터랙션 없음 (UI 전용)

**모든 3D 인터랙션의 hit-test:**
- 브라우저 기본 클릭이 CSS 3D 회전 요소에 작동하지 않음
- scene 레벨에서 클릭 좌표 → 각 장비의 getBoundingClientRect()와 비교 → 가장 가까운 장비 결정

### Step 3-5: 화구 홀로그램 자동 생성

**무엇을:**
- 미리보기 모드 진입 시, 각 화구에 대해 자동으로 홀로그램 생성
- 홀로그램 위치: 패널 1 영역, 화구와 동일한 X좌표
- 홀로그램 크기: 화구와 동일한 width
- 외형: 흰색 반투명 사각형
- 내용: 빈 상태 (재료 텍스트는 2차에서 연결)

**편집 모드에서:** 홀로그램 존재하지 않음 (DOM에도 없음)

**왜 자동 생성인가:** 홀로그램 위치/크기가 화구에 종속되므로 어드민이 별도 배치할 필요 없음.

### Step 3-6: 폴드 냉장고 내부 패널 회전

**읽어야 할 문서:** 패널시스템_원칙서 3.6절

**무엇을:**
- 폴드 냉장고가 열릴 때 내부 패널 2장이 보임
- 내부 패널: 흰색, 가운데 기준 rotateX(90deg) → 수직으로 세워짐
- 내부에 바구니/재료가 있을 경우 (2차): bottom 기준 rotateX(-90deg) → 역회전으로 수직 서있음
- 1차에서는 빈 흰색 패널만 렌더링

**주의:** 이 내부 패널은 주방 패널 3장과 달리 **모든 모드에서 보임**.

---

## 8. Phase 4 — 인게임 연동 (Step 4-1 ~ 4-3)

### Step 4-1: 저장된 레이아웃 데이터로 인게임 렌더링

**읽어야 할 문서:** CLAUDE.md, 패널시스템_원칙서

**무엇을:**
1. GamePage 진입 시 해당 store의 panel_layouts + panel_equipment 로드
2. 미리보기와 동일한 접힌 3D 뷰를 렌더링
3. preview_y_offset 적용하여 패널 덩어리 위치 설정
4. 패널 투명 + 장비만 표시 (미리보기와 동일 가시성)
5. 장비 인터랙션 활성화 (서랍 열기, 화구 불조절 등)
6. 홀로그램 자동 생성

**왜 미리보기와 거의 동일한가:** 인게임은 미리보기의 저장된 스냅샷. 차이는 편집 불가 + 게임 로직 연결뿐.

### Step 4-2: 기존 UI 재배치

**무엇을:**
- GameHeader: 상단 유지
- BillQueue: 위치 재설계 필요 (기존: 파노라마 좌표 기반 → 새: 패널 시스템에 맞게)
- Handbar: 하단 유지
- 사이드바: 기존 구조 유지하되 패널 시스템과 레이아웃 조정

**빌지큐 위치 문제:**
기존 빌지큐는 파노라마 이미지 위 특정 좌표에 고정되어 있었음.
패널 시스템에서는 파노라마가 없으므로 새로운 배치 방식이 필요.
**결정 보류 → sjb에게 확인 후 결정.**

### Step 4-3: 장비 컴포넌트 버튼 배치 (연결 미구현)

**무엇을:**
- 각 장비에 해당하는 게임 버튼을 렌더링 (Phase 3-4와 동일한 UI)
- 버튼 클릭 시 로컬 상태만 변경 (불 단계 순환, 서랍 열기 등)
- equipmentStore와의 연결은 2차
- @dnd-kit droppable 설정 안 함 (2차에서 인터랙션 방식 결정)

---

## 9. Phase 5 — 기존 코드 정리 (Step 5-1 ~ 5-3)

### Step 5-1: 제거 대상 컴포넌트/파일 삭제

**Claude Code 지시:**
1. 현재 import 관계를 분석하여 패널 시스템 도입 후 사용되지 않는 파일 목록 작성
2. 목록을 지휘관에게 보고
3. 승인 후 삭제

**예상 삭제 대상 (확인 필요):**
- HitboxEditor, HitboxEditorPanel, SectionEditor (어드민)
- HitboxLayer, HitboxItem, DraggableHitbox (게임)
- BasketGroup (게임)
- 관련 CSS Module 파일
- 관련 훅 (있다면)

### Step 5-2: 미사용 DB 컬럼/테이블 정리

**결정 보류:** area_definitions 테이블 자체를 삭제할지, 컬럼만 정리할지는 sjb와 논의 후 결정.
다른 시스템(재료 배치, 내비게이션 등)에서 area_definitions를 참조할 수 있으므로 신중하게.

### Step 5-3: 타입 정리

사용되지 않는 타입 제거. `tsc --noEmit`으로 확인.

---

## 10. Zustand 스토어 설계

### 10.1 새 스토어: panelLayoutStore (또는 기존 스토어 확장)

**편집 모드 상태:**
- layout: PanelLayout | null (DB에서 로드한 레이아웃)
- equipment: PanelEquipment[] (DB에서 로드한 장비 목록)
- mode: 'edit' | 'preview'
- selectedEquipmentId: string | null
- localPanelHeights: number[] (편집 중 로컬)
- localPreviewYOffset: number (미리보기 중 로컬)
- isDirty: boolean (변경사항 있음)

**액션:**
- loadLayout(storeId: string): void
- saveLayout(): Promise<void>
- addEquipment(panelNumber, type, position): void
- updateEquipment(id, changes): void
- removeEquipment(id): void
- duplicateEquipment(id): void
- setPanelHeights(heights: number[]): void
- setMode(mode): void
- setPreviewYOffset(offset: number): void

### 10.2 장비 인터랙션 상태

미리보기/인게임에서 사용. 세션 중 로컬 상태. DB에 저장하지 않음.

**상태:**
- drawerStates: Record<string, boolean> (서랍 열림/닫힘)
- burnerLevels: Record<string, 0 | 1 | 2> (화구 불 단계)
- basketExpanded: Record<string, boolean> (바구니 펼침)
- foldFridgeOpen: Record<string, boolean> (폴드냉장고 열림)

**기존 equipmentStore와의 관계:**
- 1차에서는 별도 로컬 상태
- 2차에서 equipmentStore의 기존 로직(wok_temp, burner_level 등)과 연결

---

## 11. 검토 시 체크리스트

Claude Code 계획을 검토할 때 반드시 확인:

- [ ] 패널시스템 원칙서의 기술 제약 위반 여부
- [ ] CSS 3D transform 순서 정합성 (translateZ → rotateX)
- [ ] 패널 가시성 규칙 (편집: 보임, 미리보기/인게임: DOM 유지 + 투명)
- [ ] 폴드 냉장고 내부 패널: 모든 모드에서 보임 (흰색)
- [ ] 화구 패널 2 전용 제약
- [ ] 홀로그램: 편집에서 없음, 미리보기/인게임에서 자동 생성
- [ ] hit-test: getBoundingClientRect, pointer-events 의존 아님
- [ ] 기존 유지 시스템과의 충돌 (equipmentStore, gameStore)
- [ ] 기존 코딩 규칙 (any 금지, Zustand 셀렉터 규칙)
- [ ] 2차 효과 (이 변경이 다른 곳에 미치는 영향)
- [ ] 엣지 케이스 (빈 배열, null, 0, 경계값)
- [ ] UI상 웍 없음 (화구 자체 = 장비)
- [ ] 서랍 rotateX(-90deg) 고정, translateZ만 변화
- [ ] 바구니 패널 2 수평 보정 (getBasketCorrection)
- [ ] preserve-3d 체인 끊김 여부
- [ ] @dnd-kit droppable 미리 설정하지 않았는지

---

## 12. 위험 요소와 대응

### 위험 1: CSS 3D preserve-3d 체인 끊김
3D 변환을 사용하는 모든 부모-자식에 `transform-style: preserve-3d`가 필요.
중간에 `overflow: hidden` 등이 들어가면 체인이 끊김.

**대응:** Phase 3 시작 전 DOM 구조를 확정하고, 모든 3D 컨테이너에 preserve-3d 명시.

### 위험 2: getBoundingClientRect 정확도
CSS 3D 변환된 요소의 getBoundingClientRect는 화면에 투영된 2D 바운딩 박스를 반환.
비스듬한 각도에서 겹치는 장비가 있으면 오인식 가능.

**대응:** Z-order(sort_order)를 고려하여 겹침 시 상위 장비 우선. 실기기 테스트로 검증.

### 위험 3: 패널 높이 비율 합계 오차
float 연산으로 합계가 정확히 1.0이 안 될 수 있음.

**대응:** 마지막 패널 높이 = 1.0 - (패널1 + 패널2)로 보정.

### 위험 4: 전면 교체로 인한 게임 페이지 깨짐
기존 게임 페이지가 히트박스/파노라마에 의존하므로, 패널 시스템이 완성되기 전에는 게임 불가.

**대응:** 브랜치 전략. `feature/panel-system` 브랜치에서 작업, Phase 4 완료 후 main 머지.

### 위험 5: 바구니/서랍 내부 편집 부재
1차에서 내부 그리드 편집을 만들지 않으므로, 실제 게임 플레이에 필요한 재료 배치가 불가.

**대응:** 이것은 의도된 범위 제한. 2차에서 구현. 1차는 껍데기(외형+인터랙션)에 집중.

---

## 13. 완료 기준

### Phase 1 완료
- [ ] panel_layouts, panel_equipment 테이블 존재
- [ ] RLS 정책 활성화
- [ ] TypeScript 타입 정의 완료
- [ ] tsc --noEmit 오류 없음

### Phase 2 완료
- [ ] 어드민에 "주방 레이아웃" 탭 존재
- [ ] 편집 모드에서 패널 3장 표시 + 높이 조절
- [ ] 장비 7종 드래그 배치 가능
- [ ] 화구는 패널 2에만 배치 가능 (다른 패널 거부)
- [ ] 장비 선택/이동/리사이즈/복제/삭제
- [ ] 스냅 정렬 동작
- [ ] DB 저장/불러오기 정상

### Phase 3 완료
- [ ] 편집 → 미리보기 전환 시 0.6초 접기 애니메이션
- [ ] 패널 투명 + 장비 보임
- [ ] 폴드냉장고 내부 패널 보임 (흰색)
- [ ] 서랍 열기/닫기 동작
- [ ] 화구 불 단계 순환 + 색상 변화
- [ ] 바구니 펼치기/접기 동작
- [ ] 폴드냉장고 열기/닫기 + 내부 패널 회전
- [ ] 홀로그램 자동 생성
- [ ] 패널 덩어리 Y 위치 조정
- [ ] 미리보기에서 저장 버튼 활성화 + 저장 성공

### Phase 4 완료
- [ ] 인게임에서 저장된 레이아웃 렌더링
- [ ] 미리보기와 동일한 3D 뷰
- [ ] 장비 인터랙션 동작 (로직 미연결)
- [ ] GameHeader, BillQueue, Handbar 배치
- [ ] npm run build 성공

### Phase 5 완료
- [ ] 미사용 파일 삭제
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 성공

---

## 14. 부록: 장비별 외형 명세

### 서랍 (drawer)
- 외형: 은색 철판 직사각형 + 하단에 까만색 손잡이 (가로 바)
- 열림 시: face가 Z축으로 나옴 + 내부 판(빨간/회색 직사각형)이 수직 방향으로 드러남
- 내부 판: 1차에서는 빈 직사각형 (추후 그리드 편집으로 채움)

### 폴드 냉장고 (fold_fridge)
- 외형: 은색 철판 직사각형 + 상단에 까만색 손잡이 (가로 바)
- 열림 시: 외형이 위로 올라가며 내부 패널 2장 노출
- 내부 패널: 흰색, 수직으로 세워짐 (rotateX 90deg)
- 내부 패널 위 바구니/재료: bottom 기준 rotateX(-90deg) 역회전

### 바구니 (basket)
- 외형: 직사각형 프레임 (테두리선)
- 셀: 그리드 칸 (1차에서는 기본 배경색 + 테두리)
- 미리보기에서 셀이 세워지고 펼쳐짐

### 화구 (burner)
- 외형: 직사각형 (색상이 불 단계에 따라 변화)
  - 0 (꺼짐): 회색/기본
  - 1 (약불): 주황색 계열
  - 2 (강불): 빨간색 계열
- 불조절 버튼 + 볶기 버튼이 화구 영역에 직접 존재
- **웍 그래픽 없음**

### 씽크대 (sink)
- 외형: 직사각형 (파란색/회색 계열)
- 씻기 버튼 존재 (3초 홀드, 1차에서는 UI만)

### 작업대 (worktop)
- 외형: 직사각형 (나무색/갈색 계열)
- 인터랙션 없음

### 선반 (shelf)
- 외형: 직사각형 (갈색/나무 계열, 선반 느낌)
- 인터랙션 없음, UI 전용

---

## 15. 부록: CSS 3D 변환 참조 (원칙서 + 설명서 기반)

### 패널 접기
```
scene: perspective({perspective_deg}px 거리로 변환)
  panel-1: rotateX({tilt}) — 기준면 기울기
    panel-2: transform-origin: bottom; rotateX(90deg) — 수평
      panel-3: transform-origin: bottom; rotateX(90deg) — 수직
```

### 서랍 열기
```
container (preserve-3d):
  내부 판: translateZ({열림정도}) rotateX(-90deg)  ← rotateX 고정
  face: translateZ({열림정도})
```

### 바구니 셀 세우기 + 펼치기
```
basket-container:
  cell: transformOrigin(bottom center) rotateX(-90deg)
        translateZ((maxRow - row) × cellHeight)  ← 펼침 시
```

### 폴드 냉장고 내부
```
fold-fridge-body:
  internal-panel: transform-origin(center) rotateX(90deg)  ← 수직 세움
    content: transform-origin(bottom) rotateX(-90deg)  ← 역회전으로 수직 서있음
```

### 바구니 패널 보정
```
패널 2: 보정 없음
패널 1, 3: translateZ(1px) rotateX(보정각도)
```

---

_작성 완료. sjb의 승인을 받은 후 Phase 1부터 실행._