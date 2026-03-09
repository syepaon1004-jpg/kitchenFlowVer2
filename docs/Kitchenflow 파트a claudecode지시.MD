# Claude Code 지시 — 파트 A: 인게임 UI 레이아웃 전면 개편

## 임무

GamePage의 CSS Grid를 3행×3열 → 2행×1열로 변경하고,
모든 UI 요소(사이드바, 핸드바, 빌지큐)를 게임영역 위 position absolute 오버레이로 전환한다.
헤더 컴포넌트를 신규 추가한다.

## 절대 규칙

1. **수정할 파일을 반드시 먼저 읽어라.** 추정으로 수정 금지.
2. **translateX, sectionWidth 계산 로직은 건드리지 마라.** 파트 B에서 변경한다.
3. **goNext/goPrev/goTurn 위치를 이동하지 마라.** 파트 B에서 uiStore로 이동한다.
4. **내부 컨텐츠(사이드바 내부, 핸드바 내부, 빌지큐 내부)는 수정하지 마라.**
5. **DnD 로직(onDragStart, onDragEnd 케이스)을 수정하지 마라.**
6. **물리엔진, 히트박스 렌더링을 수정하지 마라.**
7. **any 타입 사용 금지. 하드코딩 금지.**
8. **어드민 컴포넌트와 게임 컴포넌트를 공유하지 마라.**

## 변경 내용

### 1. GamePage 그리드 구조 변경

**현재:**
```
grid-template-rows: 60px 1fr 80px
grid-template-columns: var(--sidebar-width) 1fr var(--sidebar-width)
```

**변경:**
```
grid-template-rows: auto 1fr
grid-template-columns: 1fr
```

- `--sidebar-width` custom property 계산 및 인라인 스타일 **제거**
- grid 1행: GameHeader (신규)
- grid 2행: 게임영역 wrapper div
  - `position: relative` (오버레이 자식의 기준점)
  - `overflow: hidden`
  - 내부에 MainViewport + LeftSidebar + RightSidebar + BillQueue + Handbar 배치

### 2. GameHeader 신규 컴포넌트

- 위치: `src/components/game/GameHeader.tsx` + CSS Module
- 내용: 뒤로가기 버튼(react-router navigate(-1)), 로그아웃 버튼(placeholder, 기능 없음), 중지 버튼(placeholder, 기능 없음)
- 높이: 내용에 맞춤 (auto), 최소한으로
- 배경: 게임 화면과 구분되는 어두운 색
- 아이콘 + 텍스트 조합, 심플한 스타일

### 3. MainViewport 전체 확장

- 기존 grid column 2 배치 제거
- 게임영역 wrapper 내부에서 `width: 100%`, `height: 100%`
- 기존 `position: relative`, `overflow: hidden` 유지
- **translateX 계산 로직 변경 없음** (sectionWidth = window.innerWidth / 1.8 그대로)
- ◀▶↩ 버튼: z-index를 10 → **5**로 변경

### 4. LeftSidebar 오버레이 전환

**현재**: grid 자식, position 없음, 조건부 렌더링으로 열림/닫힘

**변경:**
- position: absolute, left: 0, top: 0, bottom: 0
- width: **30%**
- 기본 상태: 닫힘 (transform: translateX(-100%))
- 열림: transform: translateX(0)
- transition: transform 0.25s ease
- background: 불투명 (기존 배경색 유지, 뒤 게임 화면 안 비침)
- z-index: **20**
- 토글 버튼: 사이드바 오른쪽 바깥에 돌출 배치
  - position: absolute, right: 0, top: 50%, transform: translate(100%, -50%)
  - z-index: **25**
  - 닫힌 상태에서 화살표(▶ 또는 >> 등) 표시, 열린 상태에서 반대(◀ 또는 << 등)
- 조건부 렌더링 → 항상 렌더링 + CSS로 열림/닫힘 제어
- 열림 트리거: navigate 히트박스 클릭 (기존 로직 유지) + 토글 버튼 클릭
- 닫힘 트리거: 사이드바 외부 클릭 + 토글 버튼 클릭
- 내부 컨텐츠 수정 없음

**uiStore 확인:** leftSidebarZoneId 상태가 이미 있을 것. 이 상태로 열림/닫힘을 제어.
null이면 닫힘, 값이 있으면 열림.

### 5. RightSidebar 수정

**현재**: position: absolute (이미), width: 200px, z-index: 5

**변경:**
- GamePage grid column 3에서 분리 → 게임영역 wrapper의 직접 자식으로 이동
- width: 200px → **30%**
- z-index: 5 → **20**
- 토글 버튼 z-index: 10 → **25**
- 나머지 (슬라이드 애니메이션, 토글 버튼 위치) 기존 유지

### 6. BillQueue 오버레이 전환

**현재**: grid 1행, 전체 폭

**변경:**
- GamePage grid에서 분리 → 게임영역 wrapper의 직접 자식
- position: absolute
- top: 0, left: 50%, transform: translateX(-50%)
- width: auto 또는 적절한 max-width (내용물에 맞춤, 전체 폭 불필요)
- z-index: **15**
- 내부 컨텐츠 수정 없음

### 7. Handbar 오버레이 전환

**현재**: grid 3행, 전체 폭

**변경:**
- GamePage grid에서 분리 → 게임영역 wrapper의 직접 자식
- position: absolute, bottom: 0, left: 0, right: 0
- height: 80px (기존 grid 행 높이 참고하되, 적절히 조정)
- z-index: **10**
- 내부 컨텐츠, DnD 드롭 대상 기능 유지

### 8. z-index 정리

모든 관련 컴포넌트의 z-index를 아래 계층으로 통일:

| z-index | 대상 |
|---------|------|
| auto | 주방 이미지 + 히트박스 SVG |
| 5 | ◀▶↩ 네비게이션 버튼 |
| 10 | 핸드바 |
| 15 | 빌지큐 |
| 20 | 좌/우 사이드바 |
| 25 | 사이드바 토글 버튼 |
| 1000 | 모달 (기존 유지) |

### 9. 드래그 엣지 호버 확인

MainViewport 내부의 엣지 호버 감지 로직을 확인해라.
뷰포트가 전체 영역으로 확장되었으므로 getBoundingClientRect() 기반 감지 영역이 달라진다.
사이드바가 오버레이로 위를 덮고 있을 때 pointer-events가 엣지 호버를 가로채는지 확인.
필요하면 사이드바의 pointer-events 설정을 조정.

## 작업 순서

1. 모든 대상 파일을 먼저 읽어라
2. GameHeader 컴포넌트 신규 생성
3. GamePage 그리드 구조 변경 + 게임영역 wrapper 추가
4. MainViewport를 게임영역 wrapper 내부로 이동
5. LeftSidebar를 absolute 오버레이로 전환
6. RightSidebar를 게임영역 wrapper로 이동 + width 30%
7. BillQueue를 absolute 오버레이로 전환
8. Handbar를 absolute 오버레이로 전환
9. z-index 전체 정리
10. 드래그 엣지 호버 확인/조정
11. npm run build로 검증

## 완료 기준

- [ ] npm run build 오류 없음
- [ ] 헤더 아래 전체가 주방 이미지
- [ ] ◀▶↩ 섹션 이동 정상
- [ ] 좌사이드바: 토글 버튼으로 열림/닫힘, navigate 히트박스로 열림
- [ ] 우사이드바: 기존 열림/닫힘 + 그릇 드롭 정상
- [ ] 핸드바: 하단 오버레이, DnD 드롭 정상
- [ ] 빌지큐: 상단 중앙 오버레이, 주문서 표시 정상
- [ ] 사이드바 열림 시 ◀▶ 버튼이 사이드바 뒤에 가려짐 (의도된 동작)
- [ ] 모달 최상위 표시
- [ ] 윈도우 리사이즈 시 레이아웃 유지