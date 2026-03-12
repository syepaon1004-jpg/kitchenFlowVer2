# KitchenFlow — 빌지큐 어드민 위치 배치 계획서 v2

> **v1 → v2 변경**: 점 좌표 1개 → 박스(x,y,w,h) 복수 영역. 드래그 배치. 전면 재설계.
>
> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — npm run build 오류 없음 + 시각적 동작 검증
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일을 수정하는 것
- 파일 경로, 변수명, 함수명을 추정으로 하드코딩 지시하는 것
- 버그 발생 시 표면적 증상만 패치하는 것. 근본 원인 분석 후 해결

---

## 1. v1에서 변경된 점

| 항목 | v1 (현재 구현) | v2 (목표) |
|------|--------------|----------|
| 좌표 형태 | 점 (x, y) | 박스 (x, y, w, h) |
| 개수 | 1개 | 복수 |
| DB 컬럼 | `bill_queue_position` jsonb | `bill_queue_areas` jsonb (배열) |
| 배치 방식 | 수치 입력 + 클릭 | 드래그로 박스 그리기 (히트박스와 동일 UX) |
| 렌더링 | BillQueue 컴포넌트 통째로 이동 | 각 영역마다 독립 BillQueue 인스턴스 |
| 주문 분배 | N/A (1개) | 전부 동일 — 모든 영역에 같은 주문 |
| 카드 배치 | 기존 가로 + overflow-x scroll | 가로 나열, 스크롤 없음, 최대 5개 |

### 롤백 대상 (v1 → v2 교체)

| 파일 | 변경 내용 |
|------|----------|
| db.ts | `BillQueuePosition` → `BillQueueArea` 타입 교체 |
| uiStore.ts | `billQueuePosition` → `billQueueAreas` 상태 교체 |
| MainViewport.tsx | 단일 BillQueue → 복수 영역 렌더링 |
| GamePage.tsx | 조건부 렌더링 로직 변경 |
| BillQueue.tsx | 박스 크기 제약 + 최대 5개 표시 |
| BillQueue.module.css | overflow-x: auto 제거, 스크롤 없음 |
| HitboxEditor.tsx | 점 마커 제거 → 박스 마커 렌더링 |
| HitboxEditorPanel.tsx | BillQueueSection 전면 교체 |
| AdminPage.tsx | 관련 props/콜백 변경 |

### DB 변경

```sql
-- v1 컬럼 제거
ALTER TABLE kitchen_zones DROP COLUMN IF EXISTS bill_queue_position;

-- v2 컬럼 추가
ALTER TABLE kitchen_zones ADD COLUMN bill_queue_areas jsonb DEFAULT NULL;
```

---

## 2. 확정 설계

### 2-1. DB 구조

`kitchen_zones.bill_queue_areas` jsonb — 배열 또는 null

```json
[
  { "x": 0.05, "y": 0.02, "w": 0.35, "h": 0.06 },
  { "x": 0.55, "y": 0.02, "w": 0.35, "h": 0.06 }
]
```

| 필드 | 타입 | 설명 |
|------|------|------|
| x | number | 이미지 좌측 기준 비율 (0~1) — 박스 좌상단 |
| y | number | 이미지 상단 기준 비율 (0~1) — 박스 좌상단 |
| w | number | 이미지 대비 박스 너비 비율 (0~1) |
| h | number | 이미지 대비 박스 높이 비율 (0~1) |

- NULL이면 빌지큐 영역 미설정 → fallback (기존 화면 고정)
- 빈 배열 `[]`이면 빌지큐 영역 0개 → fallback과 동일 취급
- 배열 원소 수 제한 없음 (어드민이 자유롭게 추가/삭제)

### 2-2. TypeScript 타입

```typescript
export interface BillQueueArea {
  x: number;  // 이미지 좌측 기준 비율 (0~1)
  y: number;  // 이미지 상단 기준 비율 (0~1)
  w: number;  // 이미지 대비 너비 비율 (0~1)
  h: number;  // 이미지 대비 높이 비율 (0~1)
}
```

KitchenZone:
```
bill_queue_areas: BillQueueArea[] | null
```

### 2-3. 렌더링 구조 (게임)

```
.centerSlot (position: relative)
├── img C (원본 파노라마)
├── HitboxLayer (absolute, inset: 0)
├── BillQueueZone[0] (absolute, 비율 좌표 기반 박스)
│   └── BillQueue (가로 나열, 최대 5개, 스크롤 없음)
├── BillQueueZone[1] (absolute, 비율 좌표 기반 박스)
│   └── BillQueue (동일 주문, 동일 표시)
└── ... (N개)
```

각 BillQueueZone:
- `position: absolute`
- `left: x*100%`, `top: y*100%`, `width: w*100%`, `height: h*100%`
- 내부에 BillQueue가 **박스 크기에 맞춰** 렌더링
- 모든 영역이 동일한 주문을 표시

### 2-4. BillQueue 변경사항

| 항목 | 변경 |
|------|------|
| 최대 표시 개수 | active orders에서 **최대 5개만** slice |
| overflow | `overflow-x: auto` 제거 → `overflow: hidden` |
| 카드 크기 | 박스 w에 맞춰 카드가 축소/확대 (flex 기반) |
| 스크롤 | 없음 |

### 2-5. 조건부 렌더링 위치 (v1과 동일 패턴)

| 조건 | 렌더링 위치 | 동작 |
|------|-----------|------|
| bill_queue_areas 존재 (길이 > 0) | centerSlot 안 (복수 영역) | 이미지 고정, 섹션 이동 시 스크롤 |
| bill_queue_areas null 또는 빈 배열 | 게임영역 직접 자식 (기존) | 화면 고정, 상단 좌측 |

### 2-6. 어드민 배치 UI

**히트박스 그리기와 동일한 UX**:
- 빌지큐 배치 모드 ON → 이미지 위에서 드래그로 박스 그리기
- 그려진 박스는 핑크색(#ff4081)으로 표시 (히트박스와 구분)
- 박스 선택 → 우측 패널에서 x, y, w, h 수치 확인/편집
- 박스 삭제 가능
- 저장 시 `kitchen_zones.bill_queue_areas` 배열로 UPDATE

### 2-7. z-index (v1에서 확정, 동일)

- centerSlot 안의 BillQueueZone은 .inner의 stacking context 안
- MainViewport z-index = auto → 사이드바(20)/핸드바(10)보다 아래
- 올바른 동작: 사이드바/핸드바가 빌지큐를 덮음
- centerSlot 내에서 BillQueueZone이 HitboxLayer 위에 표시 (z-index: 2)

---

## 3. 구현 순서

```
Step 1: DB 변경 — bill_queue_position 제거, bill_queue_areas 추가
Step 2: 타입 변경 — BillQueuePosition → BillQueueArea, KitchenZone 필드 교체
Step 3: uiStore 변경 — billQueuePosition → billQueueAreas
Step 4: BillQueue 컴포넌트 수정 — 최대 5개, 스크롤 없음, 박스 크기 대응
Step 5: MainViewport 수정 — 복수 영역 렌더링
Step 6: GamePage 수정 — 조건부 렌더링 로직 변경
Step 7: 어드민 UI 전면 교체 — 박스 드래그 배치
Step 8: 통합 테스트
```

---

## 4. Step별 상세

### Step 1: DB 변경

```sql
ALTER TABLE kitchen_zones DROP COLUMN IF EXISTS bill_queue_position;
ALTER TABLE kitchen_zones ADD COLUMN bill_queue_areas jsonb DEFAULT NULL;
```

### Step 2: 타입 변경

- `BillQueuePosition` 인터페이스 → `BillQueueArea` 인터페이스 (x, y, w, h)
- `KitchenZone.bill_queue_position` → `KitchenZone.bill_queue_areas: BillQueueArea[] | null`

### Step 3: uiStore 변경

- `billQueuePosition: BillQueuePosition | null` → `billQueueAreas: BillQueueArea[] | null`
- `setBillQueuePosition` → `setBillQueueAreas`

### Step 4: BillQueue 컴포넌트 수정

**무엇을 해야 하는지:**
- active orders에서 최대 5개만 표시 (`.slice(0, 5)`)
- `overflow-x: auto` 제거 → `overflow: hidden`
- 카드가 부모 박스 너비에 맞춰 배치 (flex, gap)
- 스크롤 없음

**지켜야 할 원칙:**
- 경과시간 로직(Step 4 v1)은 유지
- getRecipeName props는 유지

### Step 5: MainViewport 수정

**무엇을 해야 하는지:**
- 단일 BillQueue 렌더링 → `billQueueAreas.map()`으로 복수 영역 렌더링
- 각 영역: absolute 박스 div + 내부 BillQueue
- 스타일: `left: x*100%`, `top: y*100%`, `width: w*100%`, `height: h*100%`

### Step 6: GamePage 수정

**무엇을 해야 하는지:**
- `billQueuePosition` 참조 → `billQueueAreas` 참조
- 조건: `billQueueAreas && billQueueAreas.length > 0` → MainViewport가 담당
- 아니면 → GamePage에서 기존 화면 고정 렌더링

### Step 7: 어드민 UI 전면 교체

**무엇을 해야 하는지:**
- 기존 BillQueueSection(점 좌표 + 클릭 배치) 전면 제거
- 새로운 빌지큐 박스 배치 UI:
  - 배치 모드 토글 (기존 billQueuePlaceMode 재활용)
  - 모드 ON 시 이미지 위 드래그로 박스 그리기 (히트박스 그리기와 동일 UX)
  - 그려진 박스 목록 표시 (우측 패널)
  - 박스 선택 시 x, y, w, h 수치 편집
  - 박스 삭제
  - 저장/전체삭제

**히트박스 그리기와의 차이:**
- 히트박스: area_definitions INSERT → 개별 row
- 빌지큐 박스: kitchen_zones.bill_queue_areas UPDATE → 배열 전체 교체

**HitboxEditor SVG 렌더링:**
- 기존 핑크 점 마커 제거
- 핑크색 rect로 박스 표시 (fill 반투명, stroke 실선)
- 박스 내부에 "빌지큐" 라벨

### Step 8: 통합 테스트

1. 어드민에서 빌지큐 박스 2개 드래그 배치 → 저장
2. 게임 화면에서 2개 영역에 동일 주문이 표시되는지 확인
3. 각 영역에 최대 5개 카드만 표시, 스크롤 없음 확인
4. 섹션 이동 시 이미지와 함께 스크롤 확인
5. 사이드바 열림 시 빌지큐 위에 표시 확인
6. 빌지큐 영역 전체 삭제 → fallback(화면 고정) 동작 확인
7. 경과시간 실시간 표시 확인
8. npm run build 오류 없음

---

## 5. 변경하지 않는 것

| 항목 | 이유 |
|------|------|
| 경과시간 로직 (BillQueue 내부) | v1 Step 4에서 추가, 유지 |
| 히트박스 렌더링/편집 | 빌지큐와 독립 |
| 물리엔진 | 변경 없음 |
| DnD 상호작용 | 변경 없음 |
| 사이드바/핸드바 | 변경 없음 |

---

## 6. 기존 원칙 준수

| 원칙 | 준수 방법 |
|------|----------|
| 원칙 2 — 비율 좌표(0~1) | bill_queue_areas의 x, y, w, h 모두 비율값 |
| 원칙 1 — 물리엔진 클라이언트 전용 | 변경 없음 |
| any 타입 금지 | BillQueueArea 타입 명시 |
| 하드코딩 금지 | 최대 5개는 상수로 관리 |
| 어드민/게임 컴포넌트 공유 금지 | 어드민 마커와 게임 BillQueue는 별도 |

---

## 7. 완료 기준

### DB + 타입
- [ ] kitchen_zones.bill_queue_areas 컬럼 존재 (bill_queue_position 제거됨)
- [ ] BillQueueArea 타입 (x, y, w, h)
- [ ] KitchenZone.bill_queue_areas: BillQueueArea[] | null

### 게임 렌더링
- [ ] 복수 영역에 동일 주문 표시
- [ ] 각 영역 최대 5개 카드, 스크롤 없음
- [ ] 가로 나열, 박스 크기에 맞춤
- [ ] 섹션 이동 시 이미지와 함께 스크롤
- [ ] null/빈배열 시 fallback(화면 고정) 동작
- [ ] 경과시간 실시간 표시 유지

### 어드민
- [ ] 빌지큐 배치 모드에서 드래그로 박스 그리기
- [ ] 그려진 박스 핑크색 rect로 표시
- [ ] 박스 목록/선택/편집/삭제
- [ ] 저장 시 kitchen_zones.bill_queue_areas UPDATE

### 빌드
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음

---

_v2 작성 완료_