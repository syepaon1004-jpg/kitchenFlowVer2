# KitchenFlow — 파트 A 실행 계획서 (Step 1 보고 반영)

> **이 문서는 통합 계획서의 파트 A를 Step 1 정보 검토 결과를 반영하여 확정한 실행 계획이다.**
> Claude Code DOCS에 넣어서 구현 시 참조하게 한다.
>
> **원본**: `KitchenFlow_인게임UI_섹션가변경계_통합계획서.md`
> **수정 이유**: Step 1 보고에서 발견된 실제 코드 구조와 통합 계획서의 가정이 다른 부분을 반영

---

## 0. Step 1 보고에서 발견된 사실과 계획서 수정사항

### 수정 1: viewportWidth 변화량 정정

**통합 계획서 원문**: "viewportWidth가 약 2.5배 커진다"
**실제**: sectionWidth = window.innerWidth / 1.8, 사이드바 = sectionWidth × 0.2 ≈ innerWidth의 11%
→ 현재 뷰포트 중앙 셀 ≈ 전체의 ~78%, 오버레이 후 ~100%
**정정**: viewportWidth 변화는 **약 1.3배**. 2.5배는 오류.

### 수정 2: sectionWidth 계산 방식

**통합 계획서 가정**: sectionWidth = img.offsetWidth / 8
**실제**: sectionWidth = window.innerWidth / 1.8
**결정**: 파트 A에서는 이 로직을 건드리지 않는다. 파트 B에서 boundaries 기반으로 전면 대체한다.
단, 원칙 7 위반(img.offsetWidth가 아닌 window.innerWidth 사용)은 파트 B에서 함께 수정.

### 수정 3: goNext/goPrev/goTurn 위치

**통합 계획서 가정**: uiStore에 존재
**실제**: uiStore에 없음. MainViewport 등 호출부에서 직접 구현
**결정**: 파트 A에서는 이동하지 않는다. 파트 B에서 uiStore로 이동 + 일반화.

### 수정 4: RightSidebar는 이미 absolute

**실제**: position: absolute, top: 0, right: 0, width: 200px, z-index: 5
토글 버튼: position: absolute, left: 0, transform: translate(-100%, -50%), z-index: 10
이미 오버레이 구조이나 GamePage grid column 3에 배치됨.
**결정**: grid 셀에서 분리하여 게임영역의 직접 자식으로 이동. width를 200px → 30%로 변경.

### 수정 5: LeftSidebar는 조건부 렌더링

**실제**: 애니메이션 없음, position 없음, grid 자식
**결정**: absolute 오버레이로 전환. RightSidebar와 동일한 슬라이드 패턴 적용.
토글 버튼을 사이드바 오른쪽 바깥에 붙인다.

### 수정 6: DragOverlay 부재

**실제**: 코드베이스에서 DragOverlay 컴포넌트 미발견
**결정**: z-index 계층에서 DragOverlay 제거.

### 수정 7: ◀▶ 버튼 위치

**실제**: ◀ left: calc(100%/7) ≈ 14%, ▶ left: calc(100%*6/7) ≈ 86%
뷰포트 전체 확장 후 사이드바(30%)가 14% 지점을 완전히 덮음.
**결정**: 사이드바가 버튼 위를 덮는다 (z-index 사이드바 > 버튼).
사이드바 열린 상태에서는 해당 방향 이동 불필요. 닫히면 버튼 다시 보임.

---

## 1. 변경 대상 파일 목록 (예상)

| 파일 | 변경 내용 |
|------|----------|
| GamePage.tsx | grid 구조 2행×1열, 헤더 추가, --sidebar-width 제거, 자식 재배치 |
| GamePage.module.css | grid-template 변경, 게임영역 position: relative |
| MainViewport.tsx | 게임영역 전체 차지 (기존 translateX 로직 유지) |
| MainViewport.module.css | grid 영역 제거, 전체 확장 |
| LeftSidebar.tsx | position absolute 오버레이 전환, 토글 버튼 추가 |
| LeftSidebar.module.css | 전면 재작성 (absolute, 슬라이드 애니메이션) |
| RightSidebar.tsx | grid 셀에서 분리 (이미 absolute) |
| RightSidebar.module.css | width: 200px → 30% |
| BillQueue.tsx/css | grid 자식 → absolute 오버레이 |
| Handbar.tsx/css | grid 자식 → absolute 오버레이 |
| 신규: GameHeader.tsx/css | 헤더 컴포넌트 (뒤로가기, placeholder 버튼) |

---

## 2. 최종 레이아웃 구조

```
CSS Grid: 2행 × 1열
grid-template-rows: auto 1fr
grid-template-columns: 1fr

┌──────────────────────────────────────────────┐
│  GameHeader (auto 높이, 최소한)                 │
├──────────────────────────────────────────────┤
│  게임영역 (1fr, position: relative)             │
│  ┌──────────────────────────────────────────┐│
│  │ MainViewport (width: 100%, height: 100%) ││
│  │                                          ││
│  │ ┌──────┐                     ┌─────────┐ ││
│  │ │좌사이드│                     │우사이드바│ ││
│  │ │바 30% │                     │  30%    │ ││
│  │ │[닫기>]│                     │[<닫기]  │ ││
│  │ └──────┘                     └─────────┘ ││
│  │                                          ││
│  │ [◀]          [↩]            [▶]          ││
│  │                                          ││
│  │ ┌──빌지큐(상단 중앙)──┐                    ││
│  │ └─────────────────┘                     ││
│  │                                          ││
│  │ ┌──핸드바(하단)──────────────────────┐    ││
│  │ └──────────────────────────────────┘    ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

---

## 3. z-index 계층 (확정)

| z-index | 대상 | 비고 |
|---------|------|------|
| auto | 주방 이미지 + 히트박스 SVG | 기본 레이어 |
| 5 | ◀▶↩ 네비게이션 버튼 | 기존 10 → 5로 조정 |
| 10 | 핸드바 | |
| 15 | 빌지큐 | |
| 20 | 좌/우 사이드바 | 사이드바가 ◀▶ 버튼을 덮음 |
| 25 | 사이드바 토글 버튼 | 사이드바 외부에 돌출 |
| 1000 | 모달 (기존 유지) | OrderSelectModal, QuantityInputModal |

---

## 4. 컴포넌트별 변경 상세

### 4-1. GamePage

**grid 변경:**
- grid-template-rows: auto 1fr (헤더 + 게임영역)
- grid-template-columns: 1fr
- --sidebar-width custom property 제거

**게임영역 (grid 2행):**
- position: relative (오버레이 자식의 기준점)
- overflow: hidden

**자식 배치 변경:**
- GameHeader → grid 1행
- 게임영역 div → grid 2행, 내부에:
  - MainViewport (전체 차지)
  - LeftSidebar (absolute 오버레이)
  - RightSidebar (absolute 오버레이)
  - BillQueue (absolute 오버레이)
  - Handbar (absolute 오버레이)

### 4-2. GameHeader (신규)

- 게임 전용 컴포넌트 (components/game/)
- 높이: 최소한 (내용에 맞춤, auto)
- 내용: 뒤로가기 버튼 (react-router navigate), 로그아웃 placeholder, 중지 placeholder
- 배경: 게임 화면과 구분되는 어두운 색
- 어드민 컴포넌트와 공유 금지

### 4-3. LeftSidebar

**현재 → 변경:**
- position 없음 → position: absolute, left: 0, top: 0, bottom: 0
- width 상속 → width: 30%
- 조건부 렌더링 → 항상 렌더링 + CSS transform 슬라이드
- 기본 상태: 닫힘 (transform: translateX(-100%))
- 열림: transform: translateX(0)
- transition: transform 0.25s ease (RightSidebar와 동일)
- 토글 버튼: 사이드바 오른쪽 바깥에 돌출 (right: 0, transform: translate(100%, -50%))
- background: 불투명 (기존 #0f3460 유지하되 가독성 확보)
- z-index: 20

**기존 동작 유지:**
- navigate 히트박스 클릭 → 사이드바 열림 + 해당 zone 이미지 로딩
- 외부 클릭 → 닫힘 (기존 구현 확인 후 유지 또는 추가)
- 내부 컨텐츠 수정 없음

### 4-4. RightSidebar

**현재 → 변경:**
- width: 200px → width: 30%
- 이미 absolute, 슬라이드 애니메이션 있음 → 구조 유지
- z-index: 5 → 20
- 토글 버튼 z-index: 10 → 25

### 4-5. BillQueue

**현재 → 변경:**
- grid 1행 전체 → position: absolute
- 위치: top: 0, left: 50%, transform: translateX(-50%)
- width: 적절한 크기 (현재 내용물 기준, max-width 설정)
- z-index: 15
- 내부 컨텐츠 수정 없음

### 4-6. Handbar

**현재 → 변경:**
- grid 3행 전체 → position: absolute, bottom: 0, left: 0, right: 0
- height: 80px (기존 grid 행 높이 유지)
- z-index: 10
- 내부 컨텐츠 수정 없음
- DnD 드롭 대상 기능 유지

### 4-7. MainViewport

**현재 → 변경:**
- grid column 2 → 게임영역 전체 (width: 100%, height: 100%)
- 기존 translateX, sectionWidth 로직 유지 (파트 B에서 변경)
- ◀▶↩ 버튼 z-index: 10 → 5
- 드래그 엣지 호버 감지: 뷰포트 크기 변경으로 영역이 달라짐 → 확인 필요

---

## 5. 변경하지 않는 것

| 항목 | 이유 |
|------|------|
| translateX 계산 로직 | 파트 B에서 boundaries 기반으로 전면 대체 |
| sectionWidth 계산 | 파트 B에서 제거/대체 |
| goNext/goPrev/goTurn 위치 | 파트 B에서 uiStore로 이동 |
| 히트박스 렌더링 | SVG viewBox, 비율 좌표 변환 유지 |
| DnD 상호작용 | onDragStart/onDragEnd 케이스 유지 |
| 물리엔진 | 웍/튀김채/MW/씽크 로직 변경 없음 |
| 사이드바 내부 컨텐츠 | ContainerCard, 재료 목록 등 유지 |
| 핸드바 내부 컨텐츠 | 기존 기능 유지 |
| 빌지큐 내부 컨텐츠 | 주문서 카드 UI 유지 |

---

## 6. 검증 체크리스트

- [ ] GamePage grid: 2행×1열 (헤더 + 게임영역)
- [ ] 헤더: 뒤로가기, 로그아웃 placeholder, 중지 placeholder
- [ ] MainViewport: 게임영역 전체 차지 (주방 이미지 보임)
- [ ] 좌사이드바: absolute 오버레이, 30%, 슬라이드 열림/닫힘
- [ ] 우사이드바: absolute 오버레이, 30% (기존 200px에서 변경)
- [ ] 핸드바: absolute, 하단 오버레이
- [ ] 빌지큐: absolute, 상단 중앙
- [ ] z-index: 사이드바(20) > 빌지큐(15) > 핸드바(10) > 버튼(5)
- [ ] 사이드바 열림 시 ◀▶ 버튼이 사이드바 뒤에 가려짐
- [ ] 사이드바 닫힘 시 ◀▶ 버튼 정상 보임
- [ ] ◀▶↩ 버튼 섹션 이동 정상
- [ ] DnD: 재료→장비, 장비→그릇, 그릇→사이드바 전부 동작
- [ ] 드래그 엣지 호버 동작
- [ ] 모달 최상위 표시
- [ ] 윈도우 리사이즈 시 레이아웃 유지
- [ ] npm run build 오류 없음

---

## 7. 기존 원칙 준수

| 원칙 | 준수 방법 |
|------|----------|
| 비율 좌표(0~1) | 히트박스 미수정. 사이드바 30%도 비율 |
| 물리엔진 클라이언트 전용 | 레이아웃만 수정 |
| any 타입 금지 | 신규 코드에도 적용 |
| 하드코딩 금지 | 높이, 너비 등 매직넘버 금지 |
| 어드민/게임 컴포넌트 공유 금지 | GameHeader는 게임 전용 |
| 파일 읽기 전 수정 금지 | 모든 대상 파일을 먼저 읽고 수정 |

---

_Step 1 보고 반영 완료_