# KitchenFlow — 빌지큐 어드민 위치 배치 계획서

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드, CSS, DB 스키마, 타입 정의를 직접 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 사용자/Claude Code 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — npm run build 오류 없음 + 시각적 동작 검증
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일을 수정하는 것
- 파일 경로, 변수명, 함수명을 추정으로 하드코딩 지시하는 것
- 버그 발생 시 표면적 증상만 패치하는 것. 반드시 근본 원인을 분석하여 해결

**지휘관의 한계 인식:**
- 지휘관(Claude AI)은 최신 코드를 직접 볼 수 없다
- 모든 구현 결정 전에 Claude Code에게 관련 파일을 읽고 보고하도록 지시해야 한다

---

## 1. 배경과 목적

### 현재 상태

UI 레이아웃 개편(파트 A)에서 빌지큐는 position absolute 오버레이로 전환 완료.
현재 **임시 위치**(게임영역 상단 중앙, top: 0, left: 50%, transform: translateX(-50%))로 배치되어 있다.

빌지큐는 게임영역의 직접 자식이라 **화면(뷰포트)에 고정**되어 있다.
섹션을 이동해도 빌지큐는 움직이지 않는다.

### 목표

1. 빌지큐를 **파노라마 이미지에 고정** — 섹션 이동 시 이미지와 함께 스크롤
2. 어드민에서 **히트박스 배치하듯이** 빌지큐 위치를 시각적으로 배치
3. 빌지큐 위치를 DB에 **비율 좌표(0~1)**로 저장
4. 각 빌지(주문 카드)에 **주문명, 주문 번호, 경과시간** 표시

---

## 2. 핵심 설계 분석

### 2-1. 렌더링 구조 변경 (근본 변경)

빌지큐를 이미지에 고정하려면, **파노라마 이미지와 동일한 좌표 기준 컨테이너 안에** 빌지큐가 있어야 한다.

**Step 1 정보 검토에서 확인된 실제 구조:**

```
.viewport (position: relative; overflow: hidden)
└── .inner (position: relative; inline-flex; transform: translateX)
    ├── <img> 복사본 L (pointerEvents: none)
    ├── .centerSlot (position: relative; flex-shrink: 0)
    │   ├── <img ref={imgRef}> 원본 파노라마 이미지
    │   └── HitboxLayer (absolute, inset: 0)
    └── <img> 복사본 R (pointerEvents: none)
```

**중요**: viewport-inner(.inner)는 이미지 3장분(L+C+R) 폭의 inline-flex 컨테이너다.
여기에 BillQueue를 absolute로 넣으면 좌표 기준이 이미지 3장분 폭이 되어 비율 좌표가 맞지 않는다.

**centerSlot이 정확한 삽입 위치다:**
- centerSlot은 원본 파노라마 이미지와 HitboxLayer가 있는 컨테이너
- `position: relative`이므로 absolute 자식의 기준점으로 적합
- 히트박스와 정확히 동일한 좌표 기준(파노라마 이미지)을 공유

```
현재 구조:
  게임영역 (position: relative; overflow: hidden)
  ├── MainViewport (absolute, inset: 0)
  │   └── .inner (inline-flex, translateX)
  │       ├── img L (복사본)
  │       ├── .centerSlot (relative)
  │       │   ├── img C (원본 파노라마)
  │       │   └── HitboxLayer (absolute, inset: 0)
  │       └── img R (복사본)
  ├── BillQueue (absolute, 상단 중앙 고정) ← 화면 고정
  ├── LeftSidebar (absolute 오버레이)
  ├── RightSidebar (absolute 오버레이)
  └── Handbar (absolute 오버레이)

변경 후 구조 (bill_queue_position이 존재할 때):
  게임영역 (position: relative; overflow: hidden)
  ├── MainViewport (absolute, inset: 0)
  │   └── .inner (inline-flex, translateX)
  │       ├── img L (복사본)
  │       ├── .centerSlot (relative)
  │       │   ├── img C (원본 파노라마)
  │       │   ├── HitboxLayer (absolute, inset: 0)
  │       │   └── BillQueue (absolute, 비율 좌표 기반) ← 이미지 고정!
  │       └── img R (복사본)
  ├── LeftSidebar (absolute 오버레이)
  ├── RightSidebar (absolute 오버레이)
  └── Handbar (absolute 오버레이)

변경 후 구조 (bill_queue_position이 null일 때):
  게임영역 (position: relative; overflow: hidden)
  ├── MainViewport (absolute, inset: 0)
  │   └── .inner (inline-flex, translateX)
  │       ├── img L (복사본)
  │       ├── .centerSlot (relative)
  │       │   ├── img C (원본 파노라마)
  │       │   └── HitboxLayer (absolute, inset: 0)
  │       └── img R (복사본)
  ├── BillQueue (absolute, 상단 중앙 고정) ← 기존 화면 고정 유지
  ├── LeftSidebar (absolute 오버레이)
  ├── RightSidebar (absolute 오버레이)
  └── Handbar (absolute 오버레이)
```

**핵심**: BillQueue가 centerSlot의 자식이 되면, .inner의 translateX에 의해 이미지와 함께 스크롤되고, 좌표 기준은 파노라마 이미지와 정확히 일치한다.

### 2-2. 좌표 체계

빌지큐 좌표 = 히트박스와 동일한 **파노라마 이미지 기준 비율 좌표(0~1)**

```
x: 이미지 좌측 기준 비율 (0 = 좌측 끝, 1 = 우측 끝)
y: 이미지 상단 기준 비율 (0 = 상단, 1 = 하단)
```

좌표는 빌지큐 컨테이너의 **좌상단 기준점**이다.
width/height는 저장하지 않는다 — 빌지큐 크기는 내부 컨텐츠(주문 카드 수)에 따라 가변이므로 고정 크기 저장이 의미 없다.

### 2-3. 히트박스와의 차이점

| 항목 | 히트박스 | 빌지큐 |
|------|---------|--------|
| 저장 위치 | area_definitions 테이블 | kitchen_zones 컬럼 (또는 stores) |
| zone별 여부 | zone별 다수 | 메인 zone에 1개 |
| 크기 저장 | w, h 비율값 저장 | 크기 미저장 (컨텐츠 가변) |
| 상호작용 | 드래그/클릭 대상 | 표시 전용 (내부 카드만 클릭) |
| area_type | ingredient/container/navigate/equipment/basket | 해당 없음 |

**빌지큐는 area_definitions에 넣지 않는다.** 히트박스가 아니며, area_type에 해당하는 타입도 없다. 기존 히트박스 시스템의 CHECK constraint, FK 참조 등과 무관한 별도 데이터다.

### 2-4. 저장 위치 결정

**Option A: `kitchen_zones.bill_queue_position` jsonb 컬럼**
- 장점: zone 단위로 설정 가능, 어드민에서 zone 선택 후 바로 편집
- 단점: main_kitchen zone에만 의미 있고 나머지 zone에서는 null

**Option B: `stores.bill_queue_config` jsonb 컬럼**
- 장점: 매장 단위 설정, 의미적으로 명확
- 단점: 어떤 zone의 이미지 기준인지 별도 참조 필요

**결정: Option A — `kitchen_zones.bill_queue_position`**

이유:
- 좌표가 해당 zone의 이미지 기준이므로, zone에 종속하는 것이 자연스럽다
- 어드민에서 히트박스 편집 탭에서 zone을 선택한 상태에서 빌지큐 위치도 함께 편집 가능
- main_kitchen 외 zone에서는 null (문제 없음 — 빌지큐는 메인 뷰포트에만 렌더링)

### 2-5. z-index 고려사항 (Step 1에서 확정)

BillQueue가 centerSlot 안으로 이동하면:
- centerSlot은 .inner 안에 있고, .inner에 transform이 있어 **stacking context가 생성됨**
- MainViewport 자체의 z-index = auto(0)
- 따라서 centerSlot 안의 BillQueue는 게임영역 레벨의 사이드바(z-20)/핸드바(z-10)보다 **아래에 표시**됨

**이것은 올바른 동작이다:**
- 사이드바/핸드바는 항상 빌지큐 위에 표시되어야 함 (오버레이 UI)
- BillQueue는 centerSlot 내에서 HitboxLayer보다 높은 z-index만 가지면 됨

null fallback(게임영역 직접 자식)일 때는 기존 z-index: 25로 사이드바 위에 표시 — 화면 고정이니까 항상 보여야 하므로 이것도 올바름.

### 2-6. 게임에서 어떤 zone의 bill_queue_position을 읽을 것인가

게임 시작 시 로딩하는 zone 목록에서, **현재 메인 뷰포트에 표시되는 zone**(main_kitchen 등)의 `bill_queue_position`을 읽는다.

빌지큐는 메인 뷰포트에서만 렌더링되므로, 좌사이드바(navigate로 열리는 하위 zone)에서는 표시되지 않는다.

### 2-7. NULL 처리 — 조건부 렌더링 위치 (확정)

**bill_queue_position 값에 따라 BillQueue의 DOM 위치 자체가 달라진다:**

| 조건 | 렌더링 위치 | 동작 |
|------|-----------|------|
| `bill_queue_position !== null` | centerSlot 안 (이미지 자식) | 이미지와 함께 스크롤, 비율 좌표 기반 배치 |
| `bill_queue_position === null` | 게임영역 직접 자식 (기존 위치) | 화면 고정, 상단 중앙 (기존 임시 위치 유지) |

**구현 패턴:**
- GamePage에서 현재 zone의 bill_queue_position을 확인
- null이면 GamePage의 게임영역에 BillQueue를 기존 방식으로 렌더링
- 값이 있으면 GamePage에서 렌더링하지 않고, MainViewport의 centerSlot 안에 렌더링

**이것은 BillQueue 컴포넌트를 두 곳에서 조건부로 렌더링하는 것이 아니다.**
하나의 렌더링 위치를 조건에 따라 결정하는 것이다. 동시에 두 곳에 렌더링되면 안 된다.

**정보 검토 시 확인할 것:**
- BillQueue가 key나 state를 가지고 있는지 — DOM 위치가 바뀌면 리마운트되므로 state 유실 가능성
- BillQueue가 Zustand store를 사용하면 리마운트해도 state 유실 없음 (store에서 관리)
- React Portal 사용 가능성 — Portal로 렌더링 대상 DOM을 동적으로 변경하면 컴포넌트 리마운트 없이 위치 변경 가능

---

## 2-A. 빌지(주문 카드) 표시 내용

### 필수 표시 항목

각 빌지(주문 카드)에는 아래 3가지 정보가 표시되어야 한다:

| 항목 | 데이터 소스 | 비고 |
|------|-----------|------|
| 주문명 | game_orders → recipe_id → recipes.name | 레시피 이름 |
| 주문 번호 | game_orders의 순번 또는 id 기반 | 주문 구분용 |
| 경과시간 | game_orders.created_at(또는 세션 시작 시 생성 시각) 기준 실시간 경과 | mm:ss 또는 초 단위 |

### 경과시간 계산

- 경과시간은 **주문이 생성된 시점부터** 실시간으로 증가해야 한다
- 게임 tick(1초)마다 갱신하거나, setInterval로 별도 갱신
- 서빙 완료(completed) 또는 실패(failed) 된 주문은 경과시간을 멈추거나 카드를 제거

### 현재 구현 확인 필요

**지휘관은 현재 BillQueue 내부에 무엇이 표시되고 있는지 모른다.**
Step 1 정보 검토에서 다음을 반드시 확인해야 한다:

- BillQueue에 현재 어떤 정보가 표시되는지 (주문명? 번호? 경과시간?)
- 주문 카드 컴포넌트의 현재 구조와 props
- game_orders의 현재 필드 (created_at이 있는지, 주문 번호 필드가 있는지)
- 경과시간 갱신 로직이 이미 있는지

**정보 검토 결과에 따라:**
- 이미 3가지 모두 표시되고 있다면 → 내부 컨텐츠 변경 없음
- 누락된 항목이 있다면 → 해당 항목 추가 구현 필요
- DB에 필요한 필드가 없다면 → DB 변경 추가 검토

---

## 3. DB 변경

### kitchen_zones 테이블에 컬럼 추가

```sql
ALTER TABLE kitchen_zones
ADD COLUMN bill_queue_position jsonb DEFAULT NULL;
```

### bill_queue_position JSON 구조

```json
{
  "x": 0.35,
  "y": 0.05
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| x | number | 이미지 좌측 기준 비율 (0~1) — 빌지큐 좌상단 x |
| y | number | 이미지 상단 기준 비율 (0~1) — 빌지큐 좌상단 y |

- NULL이면 빌지큐 미배치 (또는 fallback 동작 — 사용자 확인 필요)
- main_kitchen zone에만 설정, 나머지 zone에서는 null

### RLS 영향

기존 kitchen_zones RLS 정책(store_id 기반 read/write)이 그대로 적용된다.
별도 RLS 변경 불필요.

---

## 4. TypeScript 타입 변경

### db.ts

```
KitchenZone 인터페이스에 추가:
  bill_queue_position: { x: number; y: number } | null
```

별도 인터페이스를 만들 수도 있으나, 필드가 x, y 2개뿐이므로 인라인 타입으로도 충분하다.
정보 검토 시 기존 패턴(SectionConfig처럼 별도 인터페이스 vs 인라인)을 확인하고 통일한다.

---

## 5. 변경 대상 컴포넌트

### 5-1. BillQueue 조건부 렌더링 위치

**현재**: 게임영역의 직접 자식 (absolute 오버레이, 화면 고정)
**변경**: bill_queue_position 유무에 따라 조건부

| 조건 | 렌더링 위치 | 위치 스타일 |
|------|-----------|-----------|
| position !== null | centerSlot 자식 | `left: ${x*100}%`, `top: ${y*100}%` |
| position === null | 게임영역 자식 (기존) | 기존 임시 위치 (상단 중앙, 화면 고정) |

**무엇을 해야 하는지:**
- GamePage에서 현재 zone의 bill_queue_position을 확인
- null이면 기존 위치에 기존 방식으로 렌더링 (변경 없음)
- 값이 있으면 GamePage에서 렌더링하지 않고, MainViewport의 centerSlot 안에 렌더링
- 기존 임시 위치 스타일은 fallback으로 유지

**지켜야 할 원칙:**
- 이 Step에서는 빌지큐 렌더링 **위치**만 변경한다. 내부 컨텐츠 보완은 Step 4에서 처리.
- pointer-events: auto 유지 (주문 카드 클릭 가능해야 함)
- z-index는 히트박스 SVG 레이어 위에 위치해야 함

### 5-2. MainViewport에서 BillQueue 조건부 렌더링

**무엇을 해야 하는지:**
- MainViewport가 현재 메인 zone의 bill_queue_position을 props 또는 store에서 받아야 함
- position이 존재하면 BillQueue를 centerSlot 안에 렌더링 (비율 좌표 기반)
- position이 null이면 MainViewport에서 BillQueue를 렌더링하지 않음 (GamePage에서 기존 방식으로 렌더링)

**GamePage 측 변경:**
- bill_queue_position이 null일 때만 BillQueue를 게임영역에 렌더링
- bill_queue_position이 있으면 GamePage에서는 렌더링하지 않음 (MainViewport가 담당)

**정보 검토 시 확인할 것:**
- MainViewport가 현재 zone 데이터를 어떻게 접근하는지 (props? store? 직접 쿼리?)
- BillQueue가 현재 어떤 props를 받는지
- centerSlot의 정확한 DOM 구조와 position/overflow 설정

### 5-3. 어드민 빌지큐 위치 배치 UI

**무엇을 해야 하는지:**
- 어드민 히트박스 편집 탭에서, 선택된 zone의 이미지 위에 빌지큐 위치 마커를 표시
- 마커를 드래그하여 위치를 조정 가능
- 저장 시 kitchen_zones.bill_queue_position에 비율 좌표 UPDATE

**UI 설계:**
- 히트박스 에디터(HitboxEditor) 이미지 위에 빌지큐 위치 마커 오버레이
- 마커는 히트박스와 시각적으로 구분 (예: 다른 색상, 아이콘, 라벨 "빌지큐")
- 드래그로 위치 조정 (mousedown → mousemove → mouseup, 비율 좌표 계산)
- 히트박스 편집과 동시에 동작 (히트박스 편집 모드와 빌지큐 배치 모드가 충돌하지 않도록)

**배치 방식 옵션:**
1. HitboxEditorPanel에 "빌지큐 위치" 섹션 추가 → x, y 수치 직접 입력 + 이미지 위 마커 표시
2. 이미지 위에서 직접 드래그 배치 (히트박스 그리기와 유사하지만 별도 모드)

→ **Option 1 권장** (수치 입력 + 마커 표시). 히트박스 그리기와 모드 충돌 없이 간단하게 구현 가능.
드래그 배치는 추가 UX 개선 시 나중에 구현 가능.

**정보 검토 시 확인할 것:**
- HitboxEditor에서 이미지 위 마우스 좌표를 비율로 변환하는 기존 함수가 있는지
- HitboxEditorPanel의 현재 구조 (어디에 섹션을 추가할 수 있는지)
- zone 데이터 저장(UPDATE) 로직이 어디에 있는지

---

## 6. 구현 순서

```
Step 1: 정보 검토 — 전체 구조 파악 (BillQueue 내부 표시 내용 포함)
Step 2: DB 변경 — bill_queue_position 컬럼 추가 (+ 필요 시 game_orders 관련)
Step 3: 타입 수정 — KitchenZone 인터페이스에 bill_queue_position 추가
Step 4: 빌지 카드 표시 내용 보완 — 주문명/번호/경과시간 (Step 1 결과에 따라 범위 결정)
Step 5: BillQueue 조건부 렌더링 위치 — bill_queue_position 유무에 따라
Step 6: z-index / stacking context 확인 및 조정
Step 7: 어드민 빌지큐 위치 배치 UI
Step 8: 통합 테스트
```

---

## 7. Step별 상세

### Step 1: 정보 검토 (전체 구조 파악)

**Claude Code에 지시할 내용:**

> 아래 파일들을 **수정하지 말고** 읽고 보고해라.
>
> 1. GamePage 컴포넌트
>    - BillQueue가 현재 어디에 렌더링되는지 (DOM 위치)
>    - BillQueue에 전달하는 props
>    - 게임영역 wrapper div의 구조
>
> 2. MainViewport 컴포넌트
>    - viewport-inner의 정확한 DOM 구조 (어떤 자식이 있는지)
>    - viewport-inner의 CSS (position, overflow, transform 관련)
>    - 현재 zone 데이터를 어떻게 접근하는지 (props? store? 쿼리?)
>    - HitboxLayer가 viewport-inner 안에서 어떻게 배치되는지
>
> 3. BillQueue 컴포넌트와 CSS Module
>    - 현재 position, top, left, transform 스타일
>    - 내부 구조 (주문 카드 렌더링 방식)
>    - **각 주문 카드에 현재 무엇이 표시되는지** (주문명? 주문 번호? 경과시간? 기타?)
>    - 주문 카드 컴포넌트가 별도 파일인지 BillQueue 안에 인라인인지
>    - 경과시간 갱신 로직이 있는지 (setInterval, useGameTick 연동 등)
>    - pointer-events 설정
>    - z-index 현재 값
>    - 받는 props 목록
>    - 로컬 state가 있는지 (DOM 위치 변경 시 리마운트 영향)
>
> 3-A. game_orders 관련
>    - game_orders에 created_at 또는 주문 생성 시각 필드가 있는지
>    - 주문 번호를 어떻게 부여하는지 (순번? id? 별도 필드?)
>
> 4. HitboxEditor 컴포넌트
>    - 마우스 좌표 → 비율 좌표 변환 함수가 있는지
>    - zone 데이터를 어떻게 로딩/저장하는지
>    - 이미지 위 오버레이 렌더링 방식
>
> 5. HitboxEditorPanel 컴포넌트
>    - 현재 구조 (섹션/필드 목록)
>    - 데이터 저장 로직 위치
>
> 6. types/db.ts
>    - KitchenZone 인터페이스 현재 전체 필드 목록
>
> 7. z-index / stacking context 확인
>    - MainViewport 또는 viewport-inner에 z-index, isolation, opacity, transform 등
>      새로운 stacking context를 만드는 속성이 있는지
>    - BillQueue wrapper(게임영역 레벨)의 z-index
>
> 결과를 아래 형식으로 보고해라:
> ```
> [파일명]: [핵심 구조/스타일/로직 요약]
> ```

### Step 2: DB 변경

```sql
ALTER TABLE kitchen_zones
ADD COLUMN bill_queue_position jsonb DEFAULT NULL;
```

SQL은 사용자에게 제시 → 승인 후 Supabase SQL Editor에서 직접 실행.

### Step 3: 타입 수정

db.ts의 KitchenZone 인터페이스에 `bill_queue_position` 필드 추가.
정보 검토 결과에 따라 별도 인터페이스(BillQueuePosition) vs 인라인 타입 결정.

### Step 4: 빌지 카드 표시 내용 보완

**Step 1 정보 검토 결과에 따라 범위가 결정된다.**

필수 표시 항목: 주문명, 주문 번호, 경과시간

| 상황 | 작업 |
|------|------|
| 3가지 모두 이미 표시됨 | 이 Step 스킵 |
| 일부 누락 | 누락 항목만 추가 |
| 경과시간 갱신 로직 없음 | 타이머 로직 추가 (게임 tick 연동 또는 별도 setInterval) |
| game_orders에 created_at 없음 | DB 변경 추가 필요 → 사용자 승인 후 진행 |

**지켜야 할 원칙:**
- 기존 표시 요소를 제거하거나 재배치하지 않는다 — 누락 항목 **추가**만
- 경과시간은 클라이언트 전용 계산 (Zustand 또는 로컬 state). DB에 실시간 write 금지 (원칙 1)

### Step 5: BillQueue 조건부 렌더링 위치

**무엇을 해야 하는지:**
- bill_queue_position이 있으면: BillQueue를 centerSlot 안에 렌더링, 비율 좌표 기반 배치
- bill_queue_position이 null이면: BillQueue를 게임영역에 기존 방식(화면 고정, 상단 중앙)으로 렌더링
- 두 곳에 동시 렌더링되면 안 됨 — 조건에 따라 하나의 위치에만 렌더링

**지켜야 할 원칙:**
- BillQueue 내부 컨텐츠/기능은 Step 4에서 확정된 상태를 유지
- .viewport의 overflow: hidden으로 인해 화면 밖 빌지큐는 자동으로 잘림 (의도된 동작)
- pointer-events 전략은 기존 패턴 유지 (wrapper: none, 컨텐츠: auto)
- DOM 위치 변경 시 BillQueue 내부 state 유실 여부 확인 (Zustand 사용 시 문제 없음)

### Step 6: z-index / stacking context 확인 및 조정

**정보 검토 결과에 따라:**
- BillQueue가 centerSlot 안에서 히트박스 SVG 위에 표시되는지 확인
- 사이드바가 열렸을 때 BillQueue 위에 올라오는지 확인
- 문제 있으면 z-index 조정

### Step 7: 어드민 빌지큐 위치 배치 UI

**무엇을 해야 하는지:**
- HitboxEditorPanel에 "빌지큐 위치" 섹션 추가
- x, y 수치 입력 필드 (0~1 범위)
- HitboxEditor 이미지 위에 빌지큐 위치 마커 표시 (시각적 확인용)
- 저장 시 kitchen_zones.bill_queue_position UPDATE

**지켜야 할 원칙:**
- 기존 히트박스 편집 기능에 영향을 주지 않는다
- 빌지큐 마커는 히트박스와 시각적으로 명확히 구분
- 좌표는 반드시 비율값(0~1)으로 저장

### Step 8: 통합 테스트

**검증 시나리오:**
1. 어드민에서 빌지큐 위치를 설정하고 저장
2. 게임 화면에서 빌지큐가 설정한 위치에 표시되는지 확인
3. 섹션 이동(◀ ▶) 시 빌지큐가 이미지와 함께 스크롤되는지 확인
4. 뒤돌기(↩) 시 빌지큐가 뒷면에 있으면 보이지 않고, 앞면에 있으면 보이는지 확인
5. 사이드바 열림/닫힘 시 빌지큐와의 z-index 관계 정상
6. 빌지큐 내부 주문 카드에 주문명, 주문 번호, 경과시간 표시 확인
7. 경과시간이 실시간으로 증가하는지 확인
8. 빌지큐 위치 미설정(null) 시 화면 고정 fallback 동작 확인
9. 윈도우 리사이즈 시 빌지큐 비율 좌표 기반 위치 유지
10. npm run build 오류 없음

---

## 8. 변경하지 않는 것 (명시)

| 항목 | 이유 |
|------|------|
| BillQueue 내부 구조 | 주문명/번호/경과시간이 이미 있으면 유지. 없으면 추가만 (기존 파괴 금지) |
| 히트박스 렌더링 로직 | SVG viewBox, 비율 좌표 변환 유지 |
| DnD 상호작용 | 기존 케이스 유지 |
| 물리엔진 | 변경 없음 |
| 사이드바/핸드바 | 변경 없음 |
| 섹션 네비게이션 | 변경 없음 |
| 기존 히트박스 에디터 기능 | 빌지큐 마커 추가만, 기존 기능 미수정 |

---

## 9. 기존 원칙 준수 체크

| 원칙 | 준수 방법 |
|------|----------|
| 원칙 2 — 비율 좌표(0~1) | bill_queue_position은 이미지 기준 비율값. px 저장 금지 |
| 원칙 1 — 물리엔진 클라이언트 전용 | 변경 없음 |
| any 타입 금지 | bill_queue_position 타입 명시 |
| 하드코딩 금지 | 위치값은 DB에서 읽어옴. 코드에 좌표 하드코딩 금지 |
| 어드민/게임 컴포넌트 공유 금지 | 어드민 마커와 게임 BillQueue는 별도 |
| 파일 읽기 전 수정 금지 | Step 1 정보 검토 필수 |
| 근본 원인 해결 | z-index 문제 시 stacking context 분석 후 해결 |

---

## 10. 리스크 및 주의사항

### 10-1. .viewport의 overflow (Step 1에서 확정)

`.viewport`에 `overflow: hidden`이 설정되어 있다 (Step 1 확인). centerSlot 안의 BillQueue가 현재 뷰포트 영역 밖에 위치하면 자동으로 잘린다. **이것은 의도된 동작이다** — 빌지큐가 보이지 않는 섹션에 있으면 안 보이는 것이 맞다.

다만 BillQueue가 y축으로 길어져서(주문 카드가 많으면) 이미지 하단 밖으로 넘어갈 수 있다. 현재 BillQueue에 `overflow-x: auto` + 가로 flex 배치이므로 세로 확장은 제한적이지만, 구현 시 확인 필요.

### 10-2. stacking context (Step 1에서 확정)

.inner에 transform이 있어 stacking context가 **생성됨을 확인**. centerSlot 안의 BillQueue z-index는 게임영역 레벨의 사이드바/핸드바와 직접 비교되지 않는다.

MainViewport 자체의 z-index = auto(0)이므로, centerSlot 안의 모든 요소는 사이드바(z-20)/핸드바(z-10)보다 아래에 표시됨. **이것은 올바른 동작이다** — 사이드바/핸드바는 오버레이 UI로서 항상 빌지큐 위에 표시되어야 한다.

### 10-3. 빌지큐가 보이지 않는 섹션에 배치된 경우

빌지큐 x좌표가 0.8이고, 현재 섹션 1(좌측)을 보고 있다면, 빌지큐는 화면 밖에 있어서 보이지 않는다.

**이것은 의도된 동작이다.** 실제 주방에서 주문서가 붙어 있는 위치는 고정이고, 그 위치를 보고 있을 때만 보인다.

다만, 주문 확인이 필요한 순간에 빌지큐가 안 보일 수 있으므로 UX 관점에서 검토가 필요하다. 이것은 이번 구현 범위에서는 기능적으로만 완성하고, UX 개선(주문 알림 등)은 별도 작업으로 처리한다.

### 10-4. 조건부 렌더링 위치에 따른 리마운트

bill_queue_position이 null → 값 설정 (또는 그 반대)으로 변경되면, BillQueue의 DOM 위치가 바뀌면서 React가 컴포넌트를 리마운트한다. BillQueue 내부에 로컬 state가 있다면 유실될 수 있다.

→ BillQueue가 Zustand store만 사용하면 문제 없음 (리마운트해도 store 유지)
→ 로컬 state가 있다면 store로 이관하거나, 게임 중에는 bill_queue_position이 변경되지 않으므로 실질적 문제 없음
→ 정보 검토에서 BillQueue의 state 관리 방식 확인

---

## 11. 완료 기준

### DB + 타입
- [ ] kitchen_zones.bill_queue_position 컬럼 존재
- [ ] KitchenZone 타입에 bill_queue_position 포함

### 렌더링
- [ ] bill_queue_position 존재 시: BillQueue가 centerSlot 안에서 렌더링
- [ ] bill_queue_position null 시: BillQueue가 게임영역에서 기존 화면 고정 렌더링
- [ ] 비율 좌표 기반 위치 적용
- [ ] 섹션 이동 시 이미지와 함께 스크롤 (position 있을 때)
- [ ] 섹션 이동 시 화면 고정 (position null일 때)
- [ ] 주문 카드 클릭/상호작용 정상
- [ ] z-index 계층 정상 (사이드바 열림 시 관계)

### 빌지 카드 표시 내용
- [ ] 각 주문 카드에 주문명(레시피 이름) 표시
- [ ] 각 주문 카드에 주문 번호 표시
- [ ] 각 주문 카드에 경과시간 표시 (실시간 증가)
- [ ] 서빙 완료/실패 주문의 경과시간 처리 (멈춤 또는 카드 제거)

### 어드민
- [ ] 히트박스 편집 탭에서 빌지큐 위치 마커 표시
- [ ] 빌지큐 위치 x, y 입력 가능
- [ ] 저장 시 DB 정상 UPDATE
- [ ] 마커가 히트박스와 시각적으로 구분됨

### 빌드
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음

---

## 12. 새 대화 시작 시 첫 메시지 예시

```
너는 KitchenFlow 프로젝트의 지휘관이다. Claude Code와 Supabase를 다루는 지휘관이다.

무조건 당장의 문제를 임시방편으로 해결하지 말고 근본 문제를 찾아서 해결해라.
사용자가 원하는 대답을 하지 말고 객관적인 사실에 근거하여 대답해라.
기존에 물리법칙, 원칙에 위배되는 수정이 필요하면 확인을 받고 진행해라.

## 임무

프로젝트 지식에 있는 `KitchenFlow_빌지큐_위치배치_계획서.md`와
`KitchenFlow_지휘관_인수인계.md`를 읽고,
나머지 프로젝트 지식도 확인한 후
**빌지큐 어드민 위치 배치** 기능을 지휘해라.

## 작업 프로세스 (매 Step 필수)

1. 계획 → 2. 정보 검토 → 3. 요청 → 4. 검토 → 5. 실행 → 6. 확인

## Claude Code 계획 승인 프로세스

1. Claude Code가 계획을 제출하면 사용자에게 공유
2. 지휘관이 계획을 세부적으로 검토
3. 문제 발견 시 수정된 계획을 다시 요청 (구현 지시 금지)
4. 수정 플랜까지 최종 확인 완료 후에만 "계획 승인. 구현 진행해라."
5. 계획을 승인하면서 동시에 수정사항을 추가하지 마라

## 핵심 인지사항

1. 빌지큐는 파노라마 이미지에 고정 — 섹션 이동 시 함께 스크롤
2. 빌지큐를 centerSlot(파노라마 이미지 + HitboxLayer가 있는 컨테이너) 안으로 이동해야 함. viewport-inner가 아닌 centerSlot이 정확한 좌표 기준임
3. 좌표는 이미지 기준 비율값(0~1) — kitchen_zones.bill_queue_position에 저장
4. 어드민 히트박스 편집 탭에서 빌지큐 위치 마커 표시 + 수치 입력
5. 각 빌지 카드에 주문명/주문 번호/경과시간 표시 필수 — 현재 구현 상태를 Step 1에서 확인 후 보완 범위 결정
6. z-index / stacking context 변경 확인 필수
7. area_definitions에 넣지 않음 (히트박스가 아님)
8. bill_queue_position이 null이면 기존 화면 고정(상단 중앙) fallback — 조건부 렌더링 위치

먼저 계획서의 내용을 이해했는지 정리하고 확인을 받아라.
확인 후 Step 1(정보 검토)부터 시작해라.
```

---

_작성 완료_