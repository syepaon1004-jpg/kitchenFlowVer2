# KitchenFlow — 인게임 UI 디자인 개선 계획서 (최종)

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.
>
> **범위**: 인게임 오버레이 UI의 시각적 디자인 + 배치 개선. 기능 로직 변경 없음.

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드, CSS를 직접 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 사용자 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — npm run build 오류 없음 + 시각적 동작 검증 (사용자 캡처 기반)
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일을 수정하는 것
- 버그 발생 시 표면적 증상만 패치하는 것. 반드시 근본 원인을 분석하여 해결

**변경 허용 범위:**
- CSS 스타일 (색상, 크기, 간격, 그림자, border-radius, 투명도)
- 레이아웃 배치 (position, 크기, 여백)
- CSS 클래스명 / CSS Module 파일
- HTML 구조 변경 (기능에 영향 없는 wrapper div 추가/제거 등)
- 장비 컴포넌트의 인라인 스타일 색상값 변경

**변경 금지 범위:**
- onDragStart, onDragEnd, onDragMove 등 DnD 핸들러 로직
- Zustand 스토어 상태 구조 및 액션
- 물리엔진 함수 (tickWok, tickFryingBasket 등)
- 레시피 판별 로직
- 섹션 네비게이션 로직 (goNext, goPrev, goTurn)
- droppable/draggable ID 체계
- 모달의 열기/닫기/제출 로직
- ContainerCard의 이미지 렌더링 로직 (getContainerImageUrl, recipe_steps step_order 매핑)
- 좌사이드바의 열림/닫힘 로직 (navigate 히트박스 클릭, 기존 토글 버튼)
- 우사이드바의 열림/닫힘 로직 (드래그 호버 자동 열기, << 토글)

---

## 1. 디자인 방향

### 테마 전환

**현재:** 다크 테마 (#0a0a1a 배경, #1a1a2e 패널, #333 테두리)
**변경:** 라이트 오버레이 카드 테마

주방 이미지가 배경 전체를 채우고, 그 위에 밝은 반투명 카드(backdrop-filter: blur)가 오버레이되는 구조.

### Primary 색상 통일

전체 앱에서 `#4a90d9`로 통일. 인게임 내 `#2196F3` → `#4a90d9`로 변경.

---

## 2. 색상 변수 시스템

### 2-1. 브랜드 컬러

```css
--color-primary: #4a90d9;
--color-primary-hover: #3a7bc8;
--color-primary-light: #e8f0fe;
```

### 2-2. 인게임 오버레이

```css
--game-card-bg: rgba(255, 255, 255, 0.93);
--game-card-bg-hover: rgba(255, 255, 255, 0.97);
--game-area-bg: #2a2a3a;
--game-text-primary: #333333;
--game-text-secondary: #666666;
--game-text-tertiary: #999999;
--game-border: rgba(0, 0, 0, 0.08);
--game-border-strong: rgba(0, 0, 0, 0.15);
--game-shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.1);
--game-shadow-md: 0 2px 12px rgba(0, 0, 0, 0.15);
--game-shadow-lg: 0 4px 20px rgba(0, 0, 0, 0.2);
--game-nav-bg: rgba(255, 255, 255, 0.88);
--game-nav-bg-hover: rgba(255, 255, 255, 0.96);
--game-nav-text: #333333;
```

### 2-3. 장비 컴포넌트

```css
--equip-bg: rgba(255, 255, 255, 0.90);
--equip-text: #333333;
--equip-btn-radius: 6px;
```

### 2-4. 상태 색상 (유지)

```css
--color-success: #4CAF50;
--color-warning: #FF9800;
--color-error: #d32f2f;
--color-info: #4a90d9;
--color-fire: #ff5722;
--color-fire-active: #e65100;
--color-dirty: #795548;
--color-sink: #03a9f4;
--color-mix: #7b1fa2;
```

### 2-5. 액센트

```css
--color-accent: #F5C518;
--color-accent-light: #FFF8E1;
```

---

## 3. 컴포넌트별 스펙

### 3-1. GameHeader → 플로팅 버튼 해체

| 속성 | 현재 | 변경 |
|------|------|------|
| 구조 | 풀 가로바 (grid row 1) | 해체. 개별 플로팅 버튼으로 분리 |
| 홈 버튼 | "← 돌아가기" 텍스트 | 🏠 아이콘, 좌상단 플로팅 카드 |
| 로그아웃/중단 | 바 우측 | 우상단 개별 플로팅 카드 |
| 배경 | #0a0a1a 풀바 | 없음 (버튼만 개별 카드) |
| GamePage grid | auto 1fr | 1fr (헤더 행 제거) |

### 3-2. BillQueue

| 속성 | 현재 | 변경 |
|------|------|------|
| 배경 | #1a1a2e 풀바 | 라이트 카드, 좌상단 고정 (홈 버튼 옆) |
| 주문칩 | 주황 반투명 | 흰색/크림 카드 + 상태 dot |
| 활성 주문 | 주황 배경 | 골드 연한 배경 (--color-accent-light) |

### 3-3. LeftSidebar

| 속성 | 현재 | 변경 |
|------|------|------|
| 배경 | #0f3460 | --game-card-bg |
| 토글 버튼 | ">>" 남색 배경 | ">>" 라이트 카드 스타일 |
| 헤더 텍스트 | #e0e0e0 | --game-text-primary |
| 열림/닫힘 로직 | navigate 클릭 + 토글 | 변경 없음 (스타일만) |

### 3-4. RightSidebar + ContainerCard

| 속성 | 현재 | 변경 |
|------|------|------|
| 배경 | #16213e | --game-card-bg |
| 토글 버튼 | "<<" 남색 배경 | "<<" 라이트 카드 스타일 |
| ContainerCard 배경 | rgba(255,255,255,0.05) | #ffffff 또는 매우 연한 회색 |
| ContainerCard 이미지 렌더링 | getContainerImageUrl 로직 | **변경 금지**. CSS만 변경 |
| 드래그 호버 열기 | onDragMove 200ms | **변경 금지** |

### 3-5. Handbar → 하단 좌측 카드

| 속성 | 현재 | 변경 |
|------|------|------|
| 배경 | #1a1a2e 풀바 | 라이트 카드, 하단 좌측 |
| 높이 | 80px 전체 너비 | auto, 콘텐츠 맞춤 |
| 재료칩 | 초록 반투명 | 슬롯 형태 카드 |
| "재료를 여기에 드롭하세요" | #aaa 전체 너비 | 카드 내 안내 텍스트 |
| droppable 영역 | 전체 Handbar | **유지.** 카드 영역이 droppable |

### 3-6. 네비게이션 버튼

| 속성 | 현재 | 변경 |
|------|------|------|
| 배경 | rgba(0,0,0,0.55) | --game-nav-bg (밝은 반투명) |
| hover | rgba(0,0,0,0.8) | --game-nav-bg-hover |
| 텍스트 | #fff | --game-nav-text (#333) |
| radius | 6px | 50% (원형) |
| 그림자 | 없음 | --game-shadow-md |

### 3-7. 모달 (QuantityInput, OrderSelect)

| 속성 | 현재 | 변경 |
|------|------|------|
| 오버레이 | rgba(0,0,0,0.6) | rgba(0,0,0,0.35) + blur(2px) |
| 모달 배경 | #1a1a2e | --game-card-bg (흰색 카드) |
| 모달 테두리 | 1px solid #444 | none, --game-shadow-lg |
| radius | 8px | 14px |
| 제목/입력 텍스트 | #eee | --game-text-primary |
| 확인 버튼 | 파란 반투명 | --color-primary, #fff 텍스트 |
| 취소 버튼 | border #555 | 연한 border, --game-text-tertiary |

### 3-8. 장비 컴포넌트 (웍/튀김채/MW/싱크) — 디자인 변경

**구조/배치/기능은 현재와 동일하게 유지. 색상만 변경.**

| 속성 | 현재 | 변경 |
|------|------|------|
| 컨테이너 배경 | rgba(0,0,0,0.6) | --equip-bg (rgba(255,255,255,0.90)) |
| 텍스트 | #fff | --equip-text (#333) |
| border-radius | 6px | 10px |
| 그림자 | 없음 | --game-shadow-md |
| backdrop-filter | 없음 | blur(8px) |
| 버너 비활성 | #555 배경 | #f5f5f5 배경, borderStrong 테두리 |
| 버너 활성 | #ff5722 | 유지 (--color-fire) |
| 볶기 버튼 | 주황 인라인 | --color-warning |
| 내리기/올리기 | 주황/초록 인라인 | --color-warning / --color-success |
| 시작 버튼 | 주황 인라인 | --color-warning |
| 상태 border | 탄:#d32f2f, 과열:#ff9800 등 | **유지** (상태 색상 불변) |
| 드롭오버 배경 | rgba(76,175,80,0.2) | rgba(76,175,80,0.15) |

**인라인 스타일 처리:**
- 정적 값(기본 배경, 기본 텍스트)은 CSS 변수로 전환
- 동적 값(상태별 border, 버너 활성색)은 인라인 유지 허용. 색상값만 변수 참조로 교체

---

## 4. 배치 변경

### Before (현재)
```
┌─[← 돌아가기]────────────────────[로그아웃][중단]─┐  ← 다크 풀바
├─────────────────────────────────────────────────┤
│ [>>]  [빌지큐(주문칩들)]           ◀▶     [<<]  │
│                                                 │
│ [좌사이드바]  주방 이미지        [우사이드바]     │
│                                                 │
│                [뒤돌기]                          │
├────────────[재료를 여기에 드롭하세요]────────────┤  ← 다크 풀바
└─────────────────────────────────────────────────┘
```

### After (변경 후)
```
┌─────────────────────────────────────────────────┐
│ [🏠] [주문 칩칩칩]                [로그아웃][중단]│  ← 개별 플로팅
│                                                 │
│ [>>]                              ┌플레이팅───┐  │
│                                   │ 접시 이미지│  │
│  ◀      주방 이미지 전체        ▶ │ 접시 이미지│  │
│                                   │ 접시 이미지│  │
│                                   └──[<<]────┘  │
│           [뒤돌기]                               │
│                                                 │
│ ┌손 슬롯──────┐                                 │
│ │🖐️🖐️🖐️🖐️🖐️│                                 │
│ └─────────────┘                                 │
└─────────────────────────────────────────────────┘
  전체 = 주방 이미지. 모든 UI = 플로팅 카드.
```

---

## 5. 구현 순서

```
Phase 1: 색상 변수 시스템 구축
  Step 1: gameVariables.css에 색상 변수 추가
  Step 2: 인게임 외 CSS 하드코딩 → 변수 참조 (시각 변화 0)
  Step 3: 검증

Phase 2: 인게임 라이트 테마 전환
  Step 4: GamePage 배경 + GameHeader 해체 → 플로팅 버튼
  Step 5: BillQueue 라이트 카드 + 배치
  Step 6: LeftSidebar 라이트 카드
  Step 7: RightSidebar + ContainerCard 라이트 카드
  Step 8: Handbar 카드화 + 배치
  Step 9: 네비게이션 버튼 라이트 스타일
  Step 10: 모달 라이트 카드
  Step 11: 장비 컴포넌트 라이트 전환

Phase 3: 통합 검증
  Step 12: 전체 시각 검증 (사용자 캡처)
  Step 13: DnD 전체 기능 테스트
  Step 14: 태블릿 해상도 검증
  Step 15: npm run build 최종
```

---

## 6. 기존 원칙 준수 체크

| 원칙 | 준수 방법 |
|------|----------|
| 물리엔진 클라이언트 전용 | 변경 없음. CSS만 수정 |
| 좌표 비율값(0~1) | 변경 없음 |
| action_history로 판별 | 변경 없음 |
| 슬라이드 클램프 img.offsetWidth | 변경 없음 |
| 파일 읽기 전 수정 금지 | 매 Step 정보 검토 선행 |
| any 타입 금지 | 타입 변경 없음 |
| 하드코딩 금지 | 색상을 CSS 변수로 전환 |
| 어드민/게임 분리 | 어드민 CSS는 변수 참조만, 시각 동일 |
| recipe_steps 이미지 교체 로직 | 변경 금지 |
| 우사이드바 기본 닫힘 | 변경 없음 |

## 7. DB 변경: 없음

## 8. 완료 기준

- [ ] gameVariables.css 색상 변수 시스템 완성
- [ ] 인게임 외 페이지: 변수 참조 전환, 시각 변화 0
- [ ] Primary #4a90d9 통일
- [ ] GameHeader → 플로팅 버튼
- [ ] BillQueue 라이트 카드
- [ ] LeftSidebar 라이트 카드
- [ ] RightSidebar + ContainerCard 라이트 카드
- [ ] Handbar 하단 좌측 카드
- [ ] 네비게이션 원형 버튼
- [ ] 모달 라이트 카드
- [ ] 장비 4종 라이트 전환
- [ ] DnD 전체 기능 정상
- [ ] 태블릿 해상도 정상
- [ ] npm run build 오류 없음

---

_계획서 최종본 작성 완료_