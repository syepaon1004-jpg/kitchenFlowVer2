# KitchenFlow — 인게임 UI 레이아웃 + 섹션 가변 경계 통합 계획서

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.
>
> **통합 배경**: `KitchenFlow_인게임UI_레이아웃_계획서.md`와
> `KitchenFlow_섹션가변경계_계획서.md`가 GamePage 그리드, MainViewport,
> 사이드바를 동시에 변경한다. 개별 진행하면 이중 작업이 발생하므로 통합한다.
>
> **진행 순서**: 파트 A(UI 레이아웃 개편) 완료 → 파트 B(섹션 가변 경계) 적용.
> 파트 A가 그리드와 사이드바를 전면 변경하므로, 파트 B는 그 위에서 작업해야 한다.

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드, CSS, DB 스키마, 타입 정의를 직접 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 사용자 피드백 반영, 기존 원칙과 충돌 여부 재확인
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
- 필요한 자료(파일 내용, DB 스키마, CSS 값 등)는 자유롭게 요청해야 한다

---

## 1. 변경 목적

### 파트 A — 인게임 UI 레이아웃 전면 개편

현재 CSS Grid 3행×3열로 빌지큐(상단 행), 좌사이드바·메인뷰포트·우사이드바(중간 행), 핸드바(하단 행)가 **각자 고유 영역을 점유**하고 있다. 게임 화면(주방 이미지)이 중앙 셀에만 존재하고, UI 요소가 열리고 닫힐 때 게임 화면 크기가 변한다.

**목표**: 헤더를 제외한 전체 영역이 게임 화면이고, 모든 UI 요소가 게임 화면 **위에** position absolute 오버레이되는 구조로 전환.

### 파트 B — 섹션 가변 경계 시스템

현재 섹션 네비게이션이 정확히 8등분 하드코딩이다. sectionWidth = img.offsetWidth / 8, 벽 [4, 8], 유효 섹션 [1,2,3,5,6,7], 뒤돌기 8 - currentSection 등 모두 하드코딩.

**목표**: 관리자가 섹션 수(짝수), 경계 위치(비율), 벽 섹션을 자유롭게 설정.

### 통합 이유

| 겹치는 대상 | 파트 A | 파트 B |
|------------|--------|--------|
| GamePage 그리드 | 3행×3열 → 2행×1열 | (A 이후) grid 수정 불필요 |
| 사이드바 | grid 셀 → absolute 오버레이 | sectionWidth 의존 → 30% 고정 |
| MainViewport | 중앙 셀 → 전체 영역 확장 | translateX 중앙 정렬 공식 |
| viewportWidth | 전체의 ~40% → ~100% | translateX 공식의 입력값 |

파트 A를 먼저 완료하면 파트 B에서 grid-template-columns 수정이 불필요하고,
viewportWidth가 확정된 상태에서 translateX 공식을 변경할 수 있다.

---

## 2. Before / After (최종 상태)

### Before (현재)

```
┌──────────────────────────────────────┐
│         빌지큐 (grid 1행, 60px)        │
├───────┬──────────────────┬───────────┤
│ 좌사이드│   메인 뷰포트     │ 우사이드바 │  ← 각각 grid 셀
│       │  (주방이미지 여기만)│           │
├───────┴──────────────────┴───────────┤
│         핸드바 (grid 3행, 80px)        │
└──────────────────────────────────────┘

CSS Grid: 3행 × 3열
grid-template-rows: 60px 1fr 80px
grid-template-columns: var(--sidebar-width) 1fr var(--sidebar-width)

섹션: 8등분 하드코딩, 벽 [4,8] 하드코딩
사이드바: sectionWidth × 0.2 의존
viewportWidth: 전체의 ~40% (양옆 사이드바 제외)
```

### After (파트 A + 파트 B 완료 후)

```
┌──────────────────────────────────────┐
│  [←] [로그아웃] [중지]    헤더 (최소높이) │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ 게임영역 전체 = 주방 이미지 + 히트박스 │ │
│ │              (position: relative) │ │
│ │                                  │ │
│ │ ┌────┐                 ┌───────┐ │ │
│ │ │좌측│   ┌──빌지큐──┐  │ 우측  │ │ │
│ │ │사이│   │(임시:상단 │  │사이드 │ │ │
│ │ │드바│   │ 중앙)     │  │ 바   │ │ │
│ │ │30% │   └─────────┘  │ 30%  │ │ │
│ │ │    │                 │      │ │ │
│ │ └────┘                 └───────┘ │ │
│ │                                  │ │
│ │ [◀]        [↩ 뒤돌기]       [▶]  │ │
│ │ (좌가장자리   (위치 코드확인)  (우가장자리│ │
│ │  Y중앙)                      Y중앙) │ │
│ │                                  │ │
│ │  ┌──────────────────────────┐    │ │
│ │  │          핸드바            │    │ │
│ │  └──────────────────────────┘    │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘

CSS Grid: 2행 × 1열
grid-template-rows: [헤더높이] 1fr
grid-template-columns: 1fr

게임영역 내 모든 UI = position absolute 오버레이
사이드바: 게임영역 기준 width 30% 고정 (섹션과 무관)
섹션: 관리자 설정 가변 경계 (DB section_config)
viewportWidth: 게임영역 전체 너비 (~100%)
translateX: 섹션 중앙 정렬 공식
```

---

## 3. viewportWidth 변화에 대한 명시적 인지 (핵심)

파트 A(오버레이 전환)로 뷰포트가 전체 영역으로 확장되면,
MainViewport의 viewportWidth가 약 2.5배 커진다.

```
현재 (3열 grid):  viewportWidth ≈ 전체의 40% (양옆 사이드바 30% 제외)
오버레이 전환 후: viewportWidth = 게임영역 전체 너비 (≈100%)
```

translateX 공식 `-(sectionCenterPx - viewportWidth/2)`에서 viewportWidth가 커지면
양옆에 보이는 이전/다음 섹션의 양이 크게 달라진다.

```
예시: 8등분, currentSection = 2, imgWidth = 1600px
  sectionCenterPx = 300

  기존 (viewportWidth ≈ 560px):
    translateX = -(300 - 280) = -20
    → 현재 섹션 + 양옆 약간

  오버레이 후 (viewportWidth ≈ 1400px):
    translateX = -(300 - 700) = +400
    → 3~4개 섹션이 동시에 시야에 들어옴
```

**이것은 버그가 아니라 의도된 결과다.** 게임 화면이 넓어졌으므로 당연히 더 많이 보인다.
하지만 시각적으로 큰 차이이므로, 파트 A 완료 후 + 파트 B 적용 시 실제 화면을 확인하고
필요하면 경계 비율을 조정해야 할 수 있다.

---

## 4. 파트 A 상세 — 인게임 UI 레이아웃 개편

### 4-1. 그리드 구조 단순화

**현재**: 3행 × 3열 (빌지큐 행 / 좌사이드바·뷰포트·우사이드바 열 / 핸드바 행)
**변경**: 2행 × 1열 (헤더 / 게임영역)

- 헤더 행: 뒤로가기, 로그아웃, 중지 버튼. 높이는 최소한으로 (게임 화면 최대 확보)
- 게임영역 행(1fr): position: relative 설정 (자식 오버레이의 기준점)
- MainViewport가 게임영역 전체를 차지

### 4-2. 헤더 (신규)

| 항목 | 내용 |
|------|------|
| 뒤로가기 | 이전 페이지 또는 메뉴로 이동 (react-router navigate) |
| 로그아웃 | 구글 로그인 미구현 시 placeholder |
| 중지 | 미설계 상태, 버튼만 배치 (placeholder) |

- 게임 컴포넌트와 어드민 컴포넌트를 공유하지 않는다
- 높이는 최소한으로 (게임 화면 최대 확보)
- UX: 버튼은 직관적 아이콘 + 텍스트, 배경은 반투명 또는 게임 화면과 구분되는 색

### 4-3. 좌/우 사이드바 — 오버레이 전환

**현재**: grid 셀로 공간 점유. 펼침/닫힘 시 뷰포트 크기 변동.
**변경**: 게임영역 내부에서 position absolute. 펼침/닫힘 시 뷰포트 크기 변동 없음.

| 속성 | 좌측 사이드바 | 우측 사이드바 |
|------|-------------|-------------|
| position | absolute | absolute |
| 위치 | 게임영역 왼쪽 가장자리 (left: 0) | 게임영역 오른쪽 가장자리 (right: 0) |
| 높이 | 게임영역 전체 (top: 0, bottom: 0) | 게임영역 전체 (top: 0, bottom: 0) |
| width | **게임영역 기준 30% 고정** | **게임영역 기준 30% 고정** |
| 배경 | 불투명 또는 반투명 (가독성 확보) | 불투명 또는 반투명 (가독성 확보) |
| z-index | 히트박스 레이어 위 | 히트박스 레이어 위 |

**사이드바 너비 결정:**
- 기존 `sectionWidth × 0.2` 의존은 **폐기**한다
- 게임영역 기준 width: 30% 고정
- 이 너비는 섹션 이동과 무관하게 항상 동일
- 기존 코드에서 sectionWidth에 의존하는 부분이 있으면 제거

**기존 동작 유지:**
- 펼침/닫힘 동작 (현재 방식 그대로)
- 내부 컨텐츠 (ContainerCard, 재료 목록 등) 수정 없음
- 내부 스크롤 처리 방식 유지

### 4-4. ◀▶ 버튼과 사이드바 겹침 처리

◀ 버튼은 게임 화면 **좌측 가장자리 Y축 중앙**, ▶ 버튼은 **우측 가장자리 Y축 중앙**에 위치한다.
사이드바도 좌/우 가장자리에 오버레이된다.

**겹침 리스크:**
- 사이드바가 열린 상태에서 ◀▶ 버튼과 같은 가장자리를 점유
- 사이드바의 z-index가 ◀▶ 버튼보다 높으면 버튼이 가려짐
- 사이드바의 z-index가 낮으면 버튼이 사이드바 위에 떠서 시각적으로 이상

**처리 방식 결정: 정보 검토 후 확정.**
아래 두 가지 중 정보 검토 결과에 따라 선택:

1. 사이드바가 버튼 위를 덮는다 (z-index 사이드바 > 버튼).
   사이드바가 열린 상태에서는 ◀▶로 이동할 필요가 적으므로 자연스러울 수 있다.
2. 사이드바가 열리면 ◀▶ 버튼이 사이드바 너비만큼 안쪽으로 이동한다.
   구현이 복잡하지만 항상 접근 가능.

**정보 검토 시 확인할 것:**
- ◀▶ 버튼의 현재 position, left/right, top 값
- ↩ 뒤돌기 버튼의 현재 위치
- 사이드바 펼침/닫힘 시 pointer-events 처리 방식

### 4-5. 핸드바 — 오버레이 전환

**현재**: grid 하단 행으로 공간 점유
**변경**: 게임영역 내부에서 position absolute, bottom: 0

| 속성 | 값 |
|------|-----|
| position | absolute |
| 위치 | 게임영역 하단 (bottom: 0) |
| 폭 | 게임영역 전체 또는 적절한 비율 (정보 검토 후 결정) |
| z-index | 히트박스 레이어 위 |

- 내부 컨텐츠 수정 없음
- DnD 드롭 대상으로서의 핸드바 기능 유지

### 4-6. 빌지큐 — 오버레이 전환

**현재**: grid 최상단 행으로 전체 폭 고정 위치
**변경**: 게임영역 내부에서 position absolute 오버레이

| 속성 | 값 |
|------|-----|
| position | absolute |
| 위치 | 임시 기본값: 게임영역 상단 중앙 |
| 폭 | 전체 폭일 필요 없음. 적절한 크기로 조정 (정보 검토 후 결정) |
| z-index | 히트박스 레이어 위 |

- 내부 컨텐츠(주문 카드 UI) 수정 없음
- 추후 어드민 위치 지정 기능은 **이번 범위 밖**. 임시 위치만 배치.
- 위치 값을 쉽게 교체 가능하게 설계 (추후 어드민 설정으로 대체할 것을 고려)

### 4-7. z-index 계층 설계

| 계층 | 대상 | 비고 |
|------|------|------|
| 기본 | 주방 이미지 | 배경 |
| +1 | 히트박스 SVG 레이어 | 이미지 히트박스 포함 |
| +2 | 네비게이션 버튼 (◀ ▶ ↩) | |
| +3 | 핸드바 | |
| +4 | 빌지큐 | |
| +5 | 좌/우 사이드바 | 가장 위 (조작 빈도 높음) |
| +6 | DragOverlay | 드래그 중인 아이템 |
| +7 | 모달 (QuantityInput, OrderSelect 등) | 최상위 |

**정보 검토 시 확인할 것:**
- 현재 모든 컴포넌트의 z-index 값
- DragOverlay의 현재 z-index
- 모달의 현재 z-index

---

## 5. 파트 B 상세 — 섹션 가변 경계 시스템

### 5-1. DB 변경

kitchen_zones 테이블에 컬럼 추가:

```sql
ALTER TABLE kitchen_zones
ADD COLUMN section_config jsonb DEFAULT NULL;
```

section_config JSON 구조:

```json
{
  "boundaries": [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0],
  "walls": [4, 8]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| boundaries | number[] | 비율값 배열 (0~1). 항상 0으로 시작, 1로 끝남, 오름차순. N개 섹션이면 N+1개 경계 |
| walls | number[] | 벽 섹션 번호 배열 (1-indexed). 이 섹션에는 이동 불가 |

유효성 제약 (애플리케이션 레벨):
- 섹션 수(boundaries.length - 1)는 **짝수만** 허용
- boundaries[0] === 0, boundaries[마지막] === 1
- boundaries는 순증가 (각 값이 이전 값보다 큼)
- 인접 경계 최소 간격: 0.02
- walls 값은 1 ~ totalSections 범위

NULL이면 기존 8등분 + 벽 [4,8] fallback. 기존 데이터 영향 없음.

**DB 변경 시 확인할 것:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'kitchen_zones';
```

### 5-2. TypeScript 타입 변경

db.ts에 추가:
```
SectionConfig 인터페이스:
  boundaries: number[]
  walls: number[]

KitchenZone 인터페이스에 추가:
  section_config: SectionConfig | null
```

**확인할 것:**
- src/types/db.ts에서 KitchenZone 인터페이스의 현재 필드 목록
- KitchenZone을 import하는 파일 목록

### 5-3. uiStore 변경

**추가할 상태:**
- sectionConfig: SectionConfig | null

**추가할 액션:**
- setSectionConfig(config: SectionConfig | null): void

**변경할 로직 — 일반화된 이동 함수:**

```
DEFAULT_SECTION_CONFIG = {
  boundaries: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0],
  walls: [4, 8]
}

config = sectionConfig ?? DEFAULT_SECTION_CONFIG
totalSections = config.boundaries.length - 1
wallSet = new Set(config.walls)
isWall = (s) => wallSet.has(s)

goTurn():
  target = totalSections - currentSection
  if !isWall(target) → setCurrentSection(target)

goNext():
  next = currentSection + 1
  if next > totalSections → goTurn()   // 이미지 끝 = 뒤돌기
  if isWall(next) → goTurn()           // 벽 = 뒤돌기
  else → setCurrentSection(next)

goPrev():
  prev = currentSection - 1
  if prev < 1 → goTurn()              // 이미지 끝 = 뒤돌기
  if isWall(prev) → goTurn()           // 벽 = 뒤돌기
  else → setCurrentSection(prev)
```

**핵심**: 이미지 가장자리(prev<1, next>total)와 벽 모두 goTurn을 트리거한다.
"막힘"은 없다. 현재 8섹션 시스템에서도 섹션1의 goPrev는 섹션7로 이동(뒤돌기)이다.

**확인할 것:**
- src/stores/uiStore.ts의 현재 전체 구조
- currentSection 관련 모든 함수
- 다른 파일에서 goNext/goPrev/goTurn을 직접 호출하는 곳

### 5-4. translateX 중앙 정렬 공식

**파트 A 완료 후 상태:**
- MainViewport가 게임영역 전체를 차지
- 사이드바는 오버레이 (뷰포트 위에 겹침)
- viewportWidth = 게임영역 전체 너비

**공식:**

```
config = sectionConfig ?? DEFAULT_SECTION_CONFIG
boundaries = config.boundaries
imgWidth = imgRef.current.offsetWidth
viewportWidth = 메인 뷰포트 컨테이너의 실제 너비

startRatio = boundaries[currentSection - 1]    // 1-indexed → 0-indexed
endRatio = boundaries[currentSection]

// 현재 섹션 중심을 뷰포트 중심에 맞춤
sectionCenterPx = ((startRatio + endRatio) / 2) × imgWidth
translateX = -(sectionCenterPx - viewportWidth / 2)
```

사이드바 너비는 이 공식에 포함되지 않는다.
사이드바는 오버레이이므로 뷰포트 크기에 영향을 주지 않는다.

**확인할 것:**
- src/components/layout/MainViewport.tsx의 현재 translateX 계산 로직 전체
- sectionWidth 계산 위치와 모든 사용처
- 뷰포트 컨테이너 너비를 어떻게 가져오는지 (ref? ResizeObserver?)

### 5-5. 게임 로딩 시 section_config 적용

zone 로딩 시 section_config도 함께 읽는다.

```
zone 로딩 후:
  if zone.section_config !== null:
    uiStore.setSectionConfig(zone.section_config)
  else:
    uiStore.setSectionConfig(DEFAULT_SECTION_CONFIG)
```

초기 섹션: currentSection = 1. 만약 1이 벽이면 첫 번째 비벽 섹션을 찾아서 설정.

**확인할 것:**
- GamePage.tsx에서 zone 데이터 로딩하는 위치와 방식
- Supabase 쿼리에서 kitchen_zones를 select하는 부분

### 5-6. 어드민 UI — SectionEditor 컴포넌트

**위치:** 히트박스 편집 탭 내부, zone 선택 시 이미지 하단에 표시.

**UI 구성:**

```
┌─────────────────────────────────────────────────────────┐
│                    주방 이미지                             │
├─────────────────────────────────────────────────────────┤
│  [섹션 수: - 8 +]                                        │
│ ▼   ▼       ▼     ▼     ▼       ▼     ▼     ▼       ▼  │  ← 경계 마커 (삼각형, 드래그 가능)
│ ██ sec1 ██ sec2 ██ sec3 ██[벽4]██ sec5 ██ sec6 ██[벽8]██│  ← 섹션 바
│                                                          │
│                                     [저장]               │
└─────────────────────────────────────────────────────────┘
```

**기능 상세:**

| 기능 | 동작 |
|------|------|
| 섹션 수 조절 | +/- 버튼, 짝수만 (4~20). 변경 시 경계 균등 재배포 + 벽 초기화 [total/2, total] |
| 경계 마커 드래그 | 첫(0)/마지막(1) 고정. 내부만 드래그. 이웃 넘을 수 없음 (최소 0.02). document 레벨 이벤트 |
| 벽 토글 | 섹션 영역 클릭 → 벽/비벽 토글. 벽은 어두운 색 또는 빗금 |
| 저장 | 유효성 검사 후 kitchen_zones.section_config UPDATE |

**UX 고려사항:**
- 경계 마커를 드래그할 때 현재 비율값을 툴팁으로 표시
- 벽 섹션은 시각적으로 명확히 구분 (빗금 패턴, 어두운 배경, "벽" 라벨)
- 섹션 수 변경 시 확인 다이얼로그: "경계가 균등 재배포됩니다. 계속하시겠습니까?"

**렌더링 기준:**
- 섹션 바의 전체 너비 = 이미지와 동일 (이미지 아래 정렬)
- 각 섹션의 너비 = (boundaries[i] - boundaries[i-1]) × 바 전체 너비
- 경계 마커 위치 = boundaries[i] × 바 전체 너비

**SectionEditor와 HitboxEditor 독립성:**
- SectionEditor: 섹션 경계/벽 편집 → kitchen_zones.section_config UPDATE
- HitboxEditor: 히트박스 편집 → area_definitions INSERT/UPDATE/DELETE
- 둘은 같은 zone 이미지를 공유하지만 데이터는 완전히 독립

**확인할 것:**
- 히트박스 편집 탭의 zone 선택 후 이미지 렌더링 구조
- HitboxEditor 컴포넌트의 이미지 컨테이너 ref 접근 방식
- 어드민 페이지에서 kitchen_zones 데이터 로딩/수정 패턴
- 기존 document 레벨 마우스 이벤트 패턴 (히트박스 핸들 드래그)

---

## 6. 구현 순서

```
═══════════════════════════════════════════
 파트 A — 인게임 UI 레이아웃 개편
═══════════════════════════════════════════

Step 1:  정보 검토 (전체 구조 파악) ← 가장 중요
Step 2:  그리드 구조 변경 + 메인 뷰포트 전체 확장
Step 3:  헤더 컴포넌트 추가
Step 4:  좌/우 사이드바 오버레이 전환 (width 30% 고정)
Step 5:  핸드바 오버레이 전환
Step 6:  빌지큐 오버레이 전환 (임시 위치)
Step 7:  z-index 정리 + ◀▶ 버튼 겹침 처리
Step 8:  드래그 엣지 호버 확인
Step 9:  파트 A 통합 테스트

═══════════════════════════════════════════
 파트 B — 섹션 가변 경계 시스템
═══════════════════════════════════════════

Step 10: DB 변경 — section_config 컬럼 추가
Step 11: TypeScript 타입 수정
Step 12: uiStore 수정 — sectionConfig + 일반화된 이동 함수
Step 13: MainViewport 수정 — 중앙 정렬 translateX
Step 14: GamePage 수정 — zone 로딩 시 sectionConfig 적용
Step 15: 어드민 UI — SectionEditor 컴포넌트 신규 작성
Step 16: 파트 B 통합 테스트

═══════════════════════════════════════════
 최종 통합 테스트
═══════════════════════════════════════════

Step 17: 전체 통합 테스트
```

각 Step은 이전 Step이 완료되어야 진행한다.
각 Step마다 6단계 프로세스(계획→정보검토→요청→검토→실행→확인)를 반드시 거친다.

---

## 7. Step별 상세

### Step 1: 정보 검토 (전체 구조 파악) — 파트 A + B 공통

이 계획서에서 **가장 중요한 Step**이다. 현재 코드를 정확히 파악해야 한번에 수정을 끝낼 수 있다.

**Claude Code에 지시할 내용:**

> 아래 파일들을 **수정하지 말고** 읽고 보고해라.
>
> 1. GamePage 컴포넌트와 CSS Module
>    - grid-template-rows, grid-template-columns 현재 값
>    - `--sidebar-width` custom property가 어디서 계산되고 어디서 소비되는지
>    - 자식 컴포넌트 배치 구조
>    - zone 데이터 로딩 위치와 방식 (Supabase 쿼리)
>
> 2. MainViewport 컴포넌트와 CSS Module
>    - 현재 position, overflow, 크기 설정
>    - translateX 계산 로직 전체 (sectionWidth, currentSection 사용 방식)
>    - sectionWidth 계산 위치, 재계산 트리거 (onLoad, ResizeObserver 등)
>    - ◀▶↩ 버튼의 position, left/right, top 값 (정확한 Y축 위치 포함)
>    - 드래그 엣지 호버 감지 로직이 여기에 있는지 아니면 GamePage에 있는지
>
> 3. LeftSidebar, RightSidebar 컴포넌트와 CSS Module
>    - 현재 position, width, height, background 스타일
>    - 펼침/닫힘 애니메이션 방식 (transform? width? display?)
>    - pointer-events 설정
>    - sectionWidth에 의존하는 부분이 있는지
>
> 4. BillQueue 컴포넌트와 CSS Module
>    - 현재 position, 크기, 폭 설정
>
> 5. Handbar 컴포넌트와 CSS Module
>    - 현재 position, 크기, 폭 설정
>
> 6. uiStore.ts 전체
>    - currentSection 관련 모든 상태와 함수
>    - sectionWidth 관련 상태
>    - goNext/goPrev/goTurn 구현
>    - viewOffset 관련 상태 (아직 있다면)
>
> 7. z-index 현황
>    - 위 모든 컴포넌트 + DragOverlay + 모달의 z-index 값 전체 수집
>
> 8. types/db.ts
>    - KitchenZone 인터페이스 현재 필드 목록
>
> 결과를 아래 형식으로 보고해라:
> ```
> [파일명]: [현재 레이아웃/로직 관련 핵심 스타일/값 요약]
> ```

**이 보고를 받은 후, 실제 변경 계획을 확정하고 Step 2로 진행한다.**

### Step 2: 그리드 구조 변경 + 메인 뷰포트 전체 확장

**무엇을 해야 하는지:**
- GamePage의 CSS Grid를 3행×3열 → 2행×1열로 변경
- grid-template-rows: [헤더높이] 1fr
- grid-template-columns: 1fr
- 게임영역(2행)에 position: relative 설정
- MainViewport가 게임영역 전체를 차지

**지켜야 할 원칙:**
- MainViewport 내부의 translateX, sectionWidth 로직은 건드리지 않는다 (파트 B에서 처리)
- 히트박스 레이어(HitboxLayer)의 position: absolute, inset: 0 유지

### Step 3: 헤더 컴포넌트 추가

**무엇을 해야 하는지:**
- 신규 헤더 컴포넌트 생성 (components/game/ 또는 components/layout/)
- 뒤로가기, 로그아웃(placeholder), 중지(placeholder) 버튼
- GamePage 그리드 1행에 배치

**UX/UI:**
- 높이 최소한 (40~48px 정도, 정보 검토 결과에 따라 조정)
- 버튼은 아이콘 + 텍스트, 배경은 게임 화면과 구분
- 게임 컴포넌트 폴더에 배치 (어드민과 공유 금지)

### Step 4: 좌/우 사이드바 오버레이 전환

**무엇을 해야 하는지:**
- grid 셀 배치 → position absolute 오버레이 전환
- 게임영역 내부에서 좌/우 가장자리 배치
- width: **게임영역 기준 30% 고정**
- 높이: 게임영역 전체
- 배경: 불투명 또는 반투명 (정보 검토 결과에 따라)

**기존 `sectionWidth × 0.2` 의존 제거:**
- `--sidebar-width` custom property가 sectionWidth에서 계산되고 있다면, 이 의존을 끊는다
- 사이드바 width를 30% 고정값으로 직접 적용

**기존 동작 유지:**
- 펼침/닫힘 동작 그대로
- 내부 컨텐츠 수정 없음

### Step 5: 핸드바 오버레이 전환

**무엇을 해야 하는지:**
- grid 하단 행 → position absolute, bottom: 0
- 폭은 정보 검토 후 결정 (게임영역 전체 또는 적절한 비율)
- 내부 컨텐츠/DnD 드롭 기능 유지

### Step 6: 빌지큐 오버레이 전환 (임시 위치)

**무엇을 해야 하는지:**
- grid 상단 행 → position absolute 오버레이
- 임시 위치: 게임영역 상단 중앙
- 폭: 정보 검토 후 결정 (현재 전체 폭 → 적절한 크기로 축소 가능)
- 추후 어드민 위치 지정으로 교체할 것을 고려하여 위치 값을 쉽게 교체 가능하게 설계
- 내부 컨텐츠 수정 없음

### Step 7: z-index 정리 + ◀▶ 버튼 겹침 처리

**무엇을 해야 하는지:**
- 모든 오버레이 요소의 z-index를 체계적으로 설정 (섹션 4-7의 계층 기준)
- ◀▶ 버튼과 사이드바 겹침 처리 방식 확정 (Step 1 정보 검토 결과 기반)

**UX 고려사항:**
- 사이드바가 열린 상태에서 ◀▶ 버튼이 어떻게 보이는지 시각적으로 확인
- 가장 자연스러운 방식 선택 (덮기 vs 밀기)

### Step 8: 드래그 엣지 호버 확인

**무엇을 해야 하는지:**
- 뷰포트가 전체 영역으로 확장되었으므로 엣지 호버 감지 영역 확인
- 사이드바가 오버레이로 뷰포트 위를 덮고 있을 때, 사이드바 영역에서 엣지 호버가 감지되는지 확인
- 필요시 감지 로직 조정

### Step 9: 파트 A 통합 테스트

**검증 시나리오:**
1. 헤더 아래 전체가 주방 이미지로 채워지는지
2. ◀ ▶ ↩ 버튼으로 섹션 이동 정상 동작 (기존 8등분 로직 그대로)
3. 좌사이드바 펼침/닫힘 정상, 게임 화면 위에 오버레이
4. 우사이드바 펼침/닫힘 정상, 그릇 드롭 정상
5. 핸드바 하단 오버레이 정상, DnD 드롭 대상 정상
6. 빌지큐 상단 오버레이 정상, 주문서 표시 정상
7. DnD 전체: 재료→장비, 장비→그릇, 그릇→사이드바 드롭 전부 동작
8. 드래그 중 화면 가장자리 호버 시 섹션 이동
9. 모달 최상위 표시
10. 윈도우 리사이즈 시 레이아웃 유지
11. npm run build 오류 없음

**파트 A 완료 확인 후 파트 B 진행.**

### Step 10: DB 변경 — section_config 컬럼 추가

**무엇을 해야 하는지:**
- kitchen_zones에 section_config jsonb DEFAULT NULL 추가
- 기존 데이터 영향 없음 확인

**SQL:**
```sql
ALTER TABLE kitchen_zones
ADD COLUMN section_config jsonb DEFAULT NULL;
```

**정보 검토 시 확인할 것:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'kitchen_zones';
```

### Step 11: TypeScript 타입 수정

- SectionConfig 인터페이스 추가
- KitchenZone에 section_config 필드 추가
- tsc --noEmit으로 타입 에러 확인

### Step 12: uiStore 수정

- sectionConfig 상태 + setSectionConfig 액션 추가
- goNext/goPrev/goTurn을 sectionConfig 기반으로 일반화
- NULL이면 DEFAULT_SECTION_CONFIG 사용

### Step 13: MainViewport 수정 — 중앙 정렬 translateX

**무엇을 해야 하는지:**
- 기존 `sectionWidth = img.offsetWidth / 8` 기반 translateX를 중앙 정렬 공식으로 변경
- sectionWidth 변수 자체가 불필요해질 수 있음 (boundaries 기반으로 대체)
- 기존 sectionWidth를 참조하는 모든 곳을 확인하고 대체

**공식:**
```
startRatio = boundaries[currentSection - 1]
endRatio = boundaries[currentSection]
sectionCenterPx = ((startRatio + endRatio) / 2) × imgWidth
translateX = -(sectionCenterPx - viewportWidth / 2)
```

**주의: viewportWidth 변화 인지.**
파트 A에서 뷰포트가 전체 영역으로 확장되었으므로 viewportWidth가 기존보다 약 2.5배 크다.
양옆에 보이는 섹션 수가 크게 늘어난다. 이것은 의도된 동작이다.

### Step 14: GamePage 수정 — sectionConfig 적용

- zone 로딩 시 section_config 읽어서 uiStore.setSectionConfig 호출
- null이면 DEFAULT_SECTION_CONFIG 적용
- 초기 섹션 결정 (1 또는 첫 번째 비벽 섹션)

### Step 15: 어드민 UI — SectionEditor 컴포넌트

- 히트박스 편집 탭 내 zone 이미지 하단에 배치
- 섹션 수 ± (짝수만), 경계 드래그, 벽 토글, 저장
- 상세는 섹션 5-6 참조

### Step 16: 파트 B 통합 테스트

**검증 시나리오:**
1. section_config NULL → 기존 8등분 동작과 100% 동일
2. 커스텀 config 적용 시 가변 너비 섹션 이동 정상
3. 뒤돌기: totalSections - currentSection 공식 정확
4. goNext/goPrev: 벽/끝에서 뒤돌기 정상
5. 벽 섹션에 절대 currentSection 설정 안 됨
6. 현재 섹션이 뷰포트 정중앙 배치
7. 어드민 SectionEditor에서 경계 조절/벽 토글/저장 정상
8. npm run build 오류 없음

**검증 테이블 (8섹션, 벽 = [4, 8]):**

| currentSection | goNext | goPrev | goTurn |
|----------------|--------|--------|--------|
| 1 | 2 | goTurn→7 | 7 |
| 2 | 3 | 1 | 6 |
| 3 | goTurn→5 | 2 | 5 |
| 5 | 6 | goTurn→3 | 3 |
| 6 | 7 | 5 | 2 |
| 7 | goTurn→1 | 6 | 1 |

**검증 테이블 (10섹션, 벽 = [5, 10]):**

| currentSection | goNext | goPrev | goTurn |
|----------------|--------|--------|--------|
| 1 | 2 | goTurn→9 | 9 |
| 2 | 3 | 1 | 8 |
| 3 | 4 | 2 | 7 |
| 4 | goTurn→6 | 3 | 6 |
| 6 | 7 | goTurn→4 | 4 |
| 7 | 8 | 6 | 3 |
| 8 | 9 | 7 | 2 |
| 9 | goTurn→1 | 8 | 1 |

### Step 17: 전체 통합 테스트

파트 A + 파트 B 전체가 조합된 상태에서의 최종 검증.

1. 오버레이 레이아웃 + 가변 섹션이 동시에 정상 동작
2. 넓은 섹션에서 양옆 적게 보임, 좁은 섹션에서 양옆 많이 보임
3. 사이드바 30% 고정이 섹션 이동과 무관하게 유지
4. 어드민에서 섹션 설정 변경 → 게임에서 즉시 반영
5. 윈도우 리사이즈 시 전체 레이아웃 + translateX 재계산 정상
6. tsc --noEmit 오류 없음
7. npm run build 오류 없음

---

## 8. 변경하지 않는 것 (명시)

| 항목 | 이유 |
|------|------|
| 히트박스 렌더링 로직 | SVG viewBox, 비율 좌표 변환 모두 유지 |
| DnD 상호작용 | onDragStart/onDragEnd 케이스 모두 유지 |
| 물리엔진 | 웍/튀김채/MW/씽크 로직 변경 없음 |
| 사이드바 내부 컨텐츠 | ContainerCard, 재료 목록 등 UI 유지 |
| 핸드바 내부 컨텐츠 | 기존 기능 유지 |
| 빌지큐 내부 컨텐츠 | 주문서 카드 UI 유지 |
| 어드민 페이지 기존 기능 | SectionEditor 신규 추가 외 변경 없음 |

---

## 9. 기존 원칙 준수 체크

| 원칙 | 준수 방법 |
|------|----------|
| 원칙 1 — 물리엔진 클라이언트 전용 | 레이아웃 + 섹션 설정 변경, 물리엔진 무관 |
| 원칙 2 — 비율 좌표(0~1) | boundaries는 비율값. px 저장 금지. 사이드바 30%도 비율 |
| 원칙 7 — 렌더링은 img.offsetWidth 기준 | 비율 × imgWidth로 변환. 하드코딩 px 없음 |
| any 타입 금지 | SectionConfig 인터페이스 등 타입 안전 보장 |
| 하드코딩 금지 | 8, [4,8], [1,2,3,5,6,7], 60px, 80px 등 모든 매직넘버 제거 |
| gen_random_uuid() | 새 테이블 없음. 컬럼 추가만 |
| 파일 읽기 전 수정 금지 | Step 1에서 전체 구조 파악 후 수정 |
| 어드민/게임 컴포넌트 공유 금지 | 헤더는 게임 전용 컴포넌트로 생성 |
| 근본 원인 해결 | 버그 발생 시 표면 패치 금지. 원인 분석 후 수정 |

---

## 10. 주의사항

### section_config NULL 처리

모든 코드 경로에서 section_config가 null일 때 DEFAULT_SECTION_CONFIG로 대체해야 한다.
null 체크를 누락하면 기존 매장 데이터에서 런타임 오류 발생.

### 섹션 수 변경 시 기존 히트박스

섹션 경계를 바꿔도 area_definitions의 좌표는 변하지 않는다.
히트박스는 전체 파노라마 이미지 기준 비율 좌표이므로 섹션 분할과 독립적이다.
섹션은 "카메라가 어디를 보는지"의 문제, 히트박스는 이미지 위 절대 위치.

### 사이드바 오버레이 시 배경 처리

오버레이된 사이드바 뒤로 게임 화면이 비치면 가독성이 떨어진다.
불투명 또는 반투명 배경 적용이 필요하며, 정보 검토 시 현재 배경 스타일을 확인한다.

### sectionWidth 재계산 트리거

파트 A에서 뷰포트가 전체 영역으로 확장되면 img.offsetWidth가 달라진다.
ResizeObserver가 이미 있다면 자동 대응, 없으면 추가 필요.
파트 B에서 sectionWidth 개념 자체가 boundaries 기반으로 대체되지만,
과도기(파트 A 완료 ~ 파트 B 적용 전)에서 기존 sectionWidth 로직이 정상 동작해야 한다.

### 드래그 엣지 호버

뷰포트가 전체 영역으로 확장되면 getBoundingClientRect() 기반 감지 영역이 달라진다.
사이드바가 오버레이로 뷰포트 위를 덮고 있을 때, 사이드바 영역에서 pointer-events가
엣지 호버 감지를 가로채는지 확인 필요.
엣지 호버가 goNext/goPrev를 호출하는 구조면 파트 B의 일반화가 자동 적용된다.

---

## 11. 수학 요약 (참조용)

### translateX 계산 (파트 B 적용 후 최종 공식)

```
config = sectionConfig ?? DEFAULT_SECTION_CONFIG
boundaries = config.boundaries
imgWidth = imgRef.current.offsetWidth
viewportWidth = 메인 뷰포트 컨테이너 실제 너비

startRatio = boundaries[currentSection - 1]
endRatio = boundaries[currentSection]

sectionCenterPx = ((startRatio + endRatio) / 2) × imgWidth
translateX = -(sectionCenterPx - viewportWidth / 2)
```

사이드바 너비는 이 공식에 포함되지 않는다.

### 뒤돌기

```
totalSections = boundaries.length - 1
goTurn(): target = totalSections - currentSection
```

### goNext / goPrev

```
wallSet = new Set(config.walls)

goNext():
  next = currentSection + 1
  if next > totalSections → goTurn()
  if wallSet.has(next) → goTurn()
  else → currentSection = next

goPrev():
  prev = currentSection - 1
  if prev < 1 → goTurn()
  if wallSet.has(prev) → goTurn()
  else → currentSection = prev
```

---

## 12. 완료 기준

### 파트 A 완료 기준

- [ ] GamePage 그리드: 2행×1열 (헤더 + 게임영역)
- [ ] 헤더: 뒤로가기, 로그아웃(placeholder), 중지(placeholder) 버튼
- [ ] MainViewport: 게임영역 전체 차지
- [ ] 좌/우 사이드바: position absolute 오버레이, width 30% 고정
- [ ] 핸드바: position absolute, 하단 오버레이
- [ ] 빌지큐: position absolute, 임시 위치 (상단 중앙)
- [ ] z-index: 체계적 계층 설정
- [ ] ◀▶ 버튼과 사이드바 겹침: 처리 완료
- [ ] 사이드바 펼침/닫힘: 기존 동작 유지, 뷰포트 크기 변동 없음
- [ ] DnD 전체: 기존 드래그앤드롭 모두 정상 동작
- [ ] 드래그 엣지 호버: 정상 동작
- [ ] 모달: 최상위 표시
- [ ] 윈도우 리사이즈: 레이아웃 정상 유지
- [ ] npm run build 오류 없음

### 파트 B 완료 기준

- [ ] DB: kitchen_zones.section_config 컬럼 존재
- [ ] 타입: SectionConfig 인터페이스 + KitchenZone에 section_config 필드
- [ ] section_config NULL → 기존 8등분 동작과 100% 동일 (하위 호환)
- [ ] 커스텀 config 적용 시 가변 너비 섹션 이동 정상
- [ ] 뒤돌기: totalSections - currentSection 정확
- [ ] goNext: 다음이 벽/끝이면 뒤돌기, 아니면 +1
- [ ] goPrev: 이전이 벽/끝이면 뒤돌기, 아니면 -1
- [ ] 벽 섹션에 절대 currentSection 설정 안 됨
- [ ] 현재 섹션이 뷰포트 정중앙 배치
- [ ] 어드민: 섹션 수 ± 조절 (짝수만)
- [ ] 어드민: 경계 마커 드래그로 경계 위치 조절
- [ ] 어드민: 섹션 클릭으로 벽 토글
- [ ] 어드민: 저장 시 section_config 정상 UPDATE
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음

### 전체 통합 완료 기준

- [ ] 오버레이 레이아웃 + 가변 섹션 동시 정상 동작
- [ ] 사이드바 30% 고정이 섹션 이동과 무관하게 유지
- [ ] viewportWidth 변화에 따른 시각적 결과 확인 (양옆 섹션 보이는 양)

---

## 13. 새 대화 시작 시 첫 메시지 예시

```
너는 KitchenFlow 프로젝트의 지휘관이다. Claude Code와 Supabase를 다루는 지휘관이다.

첨부한 인수인계 문서와 통합 계획서를 읽고,
프로젝트 지식도 확인한 후 인게임 UI 레이아웃 개편 + 섹션 가변 경계 시스템을
설계하고 구현을 지휘해라.

작업 프로세스:
1. 계획 → 2. 정보 검토 → 3. 요청 → 4. 검토 → 5. 실행 → 6. 확인
매 Step마다 이 프로세스를 거쳐라.

진행 순서: 파트 A(UI 레이아웃) 완료 → 파트 B(섹션 가변 경계) 적용.
파트 A가 그리드와 사이드바를 전면 변경하므로 반드시 파트 A 먼저.

최신 코드를 모를 수 있으니 하드코딩 지시를 하지 마라.
"무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 지시하고,
"어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단하게 해라.
필요한 파일 내용, DB 스키마, CSS 값은 자유롭게 요청해라.

버그 발생 시 표면적 증상을 패치하지 말고 근본 원인을 분석하여 해결해라.
UX/UI를 고려한 디자인을 해라.

반드시 Step 1(정보 검토)부터 시작해라.
Step 1에서 모든 관련 파일의 현재 레이아웃 스타일, z-index,
translateX 로직, sectionWidth 사용처를 보고받은 후 Step 2부터의
실제 변경 계획을 확정해라.

핵심 인지사항:
1. 사이드바 너비: 게임영역 기준 30% 고정, sectionWidth 의존 폐기
2. viewportWidth: 오버레이 전환 후 ~2.5배 커짐 → 양옆 보이는 섹션 수 증가 (의도된 결과)
3. ◀▶ 버튼과 사이드바 겹침: 정보 검토 후 처리 방식 결정
4. section_config NULL → 기존 8등분 100% 호환 필수
```

---

_작성 완료_