# KitchenFlow — 태블릿/모바일 터치 UX 패치 설계서

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.
>
> **지휘 체계**: 지휘관 → A/B (Claude AI) → Claude Code (VS Code 확장프로그램)
>
> **범위**: 모바일/태블릿 터치 UX 개선 4건. 기능 로직 변경 최소화, CSS + 이벤트 핸들링 중심.

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드를 직접 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — npm run build 오류 없음 + 실기기 검증 (사용자)
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일을 수정하는 것
- 파일 경로, 변수명, 함수명을 추정으로 하드코딩 지시하는 것
- 버그 발생 시 표면적 증상만 패치하는 것. 근본 원인 분석 후 해결
- CSS 변수 gameVariables.css에 정의해야 할 값을 인라인 또는 개별 CSS에 하드코딩하는 것

**읽어야 할 문서 (모든 Step 공통):**
- `CLAUDE.md`
- `KitchenFlow_프로젝트지식_v3.md`
- `KitchenFlow_개발지침서_v2.md`

---

## 1. 패치 목록 및 우선순위

| # | 문제 | 카테고리 | 영향 범위 |
|---|------|----------|----------|
| P1 | 모바일 버전 스크롤 발생 — 한 화면에 안 담김 | 레이아웃 | gameVariables.css, GamePage CSS |
| P2 | 터치 버튼 크기 부족 — 네비/장비 버튼 터치 불편 + 웍 버튼 배치 변경 | 터치 UX | 장비 컴포넌트, 네비 버튼 CSS |
| P3 | 꾹 누르기 시 텍스트 선택 — 볶기/씻기 홀드 중 방해 | 터치 이벤트 | 게임 영역 전역 CSS |
| P4 | 드래그 중 호버 네비게이션 타이머 미초기화 — 연속 이중 이동 | 로직 버그 | GamePage 또는 MainViewport |

**구현 순서**: P3 → P1 → P4 → P2

P3는 CSS 한 줄 수준으로 가장 빠르고 독립적이므로 먼저. P1은 P2의 기반(크기 조정 전 스크롤부터 해결). P4는 로직 버그라 독립적. P2는 가장 범위가 크므로 마지막.

---

## 2. [P3] 꾹 누르기 시 텍스트 선택 방지

### 근본 원인

터치 디바이스에서 long-press(길게 누르기) 시 브라우저 기본 동작으로 텍스트 선택이 활성화된다. 볶기 버튼 홀드, 씽크 세척 홀드 등 게임 내 꾹 누르기 인터랙션에서 텍스트가 선택되어 플레이를 방해한다.

### 해결 방향

게임 영역 전체에 터치 텍스트 선택을 방지하는 CSS를 적용한다.

**적용 대상**: GamePage의 최상위 게임 영역 (.gameArea 또는 동등한 컨테이너)

**적용할 CSS 속성:**

| 속성 | 목적 | 비고 |
|------|------|------|
| `user-select: none` | 텍스트 선택 차단 | W3C 표준 |
| `-webkit-user-select: none` | Safari/iOS 호환 | iPad Safari 필수 |
| `-webkit-touch-callout: none` | iOS long-press 콜아웃 메뉴 차단 | 링크/이미지 컨텍스트 메뉴 |
| `touch-action: manipulation` | double-tap zoom 차단 + 스크롤 허용 | 게임 내 의도치 않은 줌 방지 |

**적용 범위 설계:**
- 게임 영역 전체에 적용 (gameArea 또는 GamePage 루트)
- `<input>`, `<textarea>` 등 사용자 입력 필드는 예외로 `user-select: auto` 복원
  - QuantityInputModal 내부 input
  - 기타 게임 내 텍스트 입력 필드가 있다면 동일하게 예외 처리
- 어드민 페이지, 로그인 페이지 등 게임 외 페이지에는 적용하지 않음

**CSS 변수 사용 여부:** 이 속성들은 on/off 성격이라 CSS 변수화 불필요. 게임 영역 CSS에 직접 선언.

### 정보 검토 시 확인할 것

- GamePage의 최상위 컨테이너 className 및 CSS Module 파일
- 게임 내 `<input>`, `<textarea>` 요소가 존재하는 컴포넌트 목록
- 기존에 `user-select` 또는 `touch-action`이 적용된 곳이 있는지

### 기존 원칙 준수

- DnD 로직 변경 없음
- 물리엔진 변경 없음
- 어드민/게임 분리 유지 (게임 영역에만 적용)

---

## 3. [P1] 모바일 버전 스크롤 문제 해결

### 배경

이전 패치(2026-03-14)에서 패드(768px) 스크롤 문제를 `.gameArea { height: 100% }` + 모바일 breakpoint 값 설정으로 해결했다. 그러나 현재 모바일 버전에서 여전히 스크롤이 발생하여 한 화면에 다 안 담기는 상황이다.

### 근본 원인 분석 접근

이전 패치가 특정 해상도에서만 해결한 것일 수 있고, 또는 이후 추가된 컴포넌트/스타일이 overflow를 유발하고 있을 수 있다. 근본 원인을 특정하려면 최신 코드의 레이아웃 구조를 확인해야 한다.

**가능한 원인 후보들 (최신 코드 확인 전 추정, 정보 검토 후 확정):**

1. **GamePage의 height 체인 끊김**: html → body → #root → GamePage → .gameArea 중 어딘가에서 height: 100vh / 100% 체인이 끊겨 있을 수 있음
2. **자식 컴포넌트의 고정 높이 합산 초과**: GameHeader(플로팅) + MainViewport + Handbar + 기타 요소의 최소 높이 합이 화면 높이를 초과
3. **모바일 breakpoint(768px) CSS 변수값 미설정 또는 부적절**: gameVariables.css의 `@media (max-width: 768px)` 블록의 값이 여전히 모바일에 맞지 않음
4. **overflow: hidden 누락**: .gameArea 또는 부모에 overflow: hidden이 빠져 있어 넘치는 콘텐츠가 스크롤 유발
5. **주소창 동적 높이 (mobile Safari/Chrome)**: 모바일 브라우저의 주소창이 100vh에 포함되어 실제 뷰포트보다 더 큰 높이가 설정됨

### 해결 방향

**5번 문제에 대한 근본 해결:**

모바일 브라우저(특히 iOS Safari)에서 `100vh`는 주소창을 포함한 "가장 큰" 뷰포트를 의미한다. 주소창이 표시된 상태에서는 실제 보이는 화면보다 크다. 이것이 모바일 스크롤의 가장 흔한 근본 원인이다.

**해결책: `dvh` (Dynamic Viewport Height) 사용**

```css
/* 근본 해결 */
height: 100dvh;

/* fallback (dvh 미지원 브라우저) */
height: 100vh;
height: 100dvh; /* 덮어쓰기 */
```

`dvh`는 주소창 표시 여부에 따라 동적으로 변하는 실제 뷰포트 높이다.
- iOS Safari 15.4+ 지원
- Chrome Android 108+ 지원
- iPad Safari 지원
→ 타겟 디바이스(iPad + 모바일) 모두 커버

**추가 점검:**
- html, body에 `overflow: hidden` 적용하여 루트 레벨 스크롤 완전 차단
- .gameArea에 `overflow: hidden` 확인
- 모바일 breakpoint 값에서 `--game-header-height`, `--handbar-height` 등이 모바일에 적합한 값인지 확인

### 정보 검토 시 확인할 것

1. **높이 체인 전체 추적**: html → body → #root → GamePage → .gameArea의 height/min-height/max-height 값 전부
2. **GamePage의 CSS Module**: grid-template-rows, overflow 설정 현재값
3. **gameVariables.css**: `@media (max-width: 768px)` 블록 전체 내용
4. **각 플로팅 컴포넌트의 position 설정**: GameHeader, BillQueue, Handbar, 사이드바가 모두 absolute/fixed인지, 아니면 일부가 flow에 참여하고 있는지
5. **body/html에 적용된 스타일**: index.css 또는 global CSS에서 height, overflow, margin 설정

### 기존 원칙 준수

- 레이아웃 CSS만 수정, 게임 로직 변경 없음
- CSS 변수 체계 활용 (크기값은 gameVariables.css에서 관리)
- 데스크톱/태블릿 기존 동작 회귀 없음 확인 필수

---

## 4. [P4] 드래그 중 호버 네비게이션 타이머 미초기화 버그

### 현재 동작 (의도)

프로젝트 지식에 기술된 설계:

```
드래그 중 화면 좌우 가장자리(10% 영역) 진입
  → 200ms 타이머 시작
  → 200ms 경과 → goNext() 또는 goPrev() 실행
  → 영역 이탈 시 타이머 취소
  → 드래그 종료 시 타이머 + ref 초기화
```

### 문제 증상

드래그 중 가장자리 호버로 섹션 이동이 발생한 후, 이동된 새 위치에서도 여전히 가장자리 영역 안에 있기 때문에 타이머가 즉시 다시 시작되어 연속으로 한 번 더 이동이 발생한다.

### 근본 원인 분석

**핵심 문제: 섹션 이동 완료 후 "이미 가장자리 영역에 있음" 상태에 대한 처리가 없다.**

현재 설계의 `isOverLeftRef`/`isOverRightRef` 중복 방지 메커니즘은 "영역 진입 → 타이머 시작 → 한 번 실행" 패턴만 고려한다. 그런데 섹션 이동이 발생하면:

1. goNext() 실행 → 화면이 이동됨
2. 마우스/터치 포인터의 화면상 좌표는 변하지 않음
3. 새 화면에서도 여전히 가장자리 10% 영역 안에 있음
4. `isOverRef`가 이미 true이므로 새 타이머는 시작되지 않아야 하지만...
5. **실제로는 이동 후 `isOverRef`를 리셋하거나, 이동 후 새 onDragMove 이벤트에서 다시 true로 설정되어 타이머가 재시작됨**

→ 정확한 원인은 최신 코드의 isOverRef 리셋 타이밍과 onDragMove 콜백 순서를 확인해야 확정 가능

### 해결 방향

**쿨다운(cooldown) 패턴 도입:**

섹션 이동이 실행된 직후 일정 시간 동안 추가 이동을 차단한다.

```
goNext()/goPrev()/goTurn() 실행
  → lastNavigationTimestamp 기록 (Date.now())
  → 이후 onDragMove에서 호버 감지 시:
    if (Date.now() - lastNavigationTimestamp < COOLDOWN_MS) → 무시
    else → 정상 타이머 시작
```

**COOLDOWN_MS 값 결정:**
- 전환 애니메이션: 0.3s (transition: transform 0.3s ease)
- 안전 마진: +200ms (애니메이션 완료 후 사용자가 새 위치를 인지할 시간)
- **COOLDOWN_MS = 500ms**

이 방식이 근본적인 이유:
- 타이머/ref 리셋 타이밍 문제를 우회하지 않고, "이동 직후에는 추가 이동을 받지 않는다"는 명확한 규칙을 세움
- 사용자 경험상으로도 0.5초 내에 연속 이동이 의도된 경우는 없음 (애니메이션 0.3초 + 인지 시간)
- 뒤돌기(goTurn) 버튼 클릭에도 동일하게 적용 가능 (드래그 중 뒤돌기 버튼 호버도 같은 문제를 가질 수 있음)

**추가로 확인할 점:**
- 뒤돌기 버튼의 드래그 호버도 동일한 타이머 구조를 사용하는지
- 만약 우사이드바 `<<` 버튼의 드래그 호버도 유사한 문제가 있다면 동일한 쿨다운 적용

### 정보 검토 시 확인할 것

1. **드래그 엣지 호버 로직의 위치**: GamePage.tsx의 onDragMove인지, MainViewport 내부인지
2. **타이머 ref 변수명과 구조**: setTimeout ref, isOverLeftRef, isOverRightRef 등
3. **goNext/goPrev/goTurn 호출 위치**: 어디서 호출되고, 호출 후 ref를 어떻게 처리하는지
4. **뒤돌기 버튼의 드래그 호버 로직**: 있는지, 있다면 동일한 타이머 구조인지
5. **우사이드바 << 버튼의 호버 로직**: 동일한 문제 가능성 확인

### 기존 원칙 준수

- goNext/goPrev/goTurn 내부 로직(섹션 유효성 검사, 벽 처리) 변경 없음
- DnD 핸들러(onDragStart, onDragEnd) 로직 변경 없음 (onDragMove에 쿨다운 조건만 추가)
- 물리엔진 무관
- COOLDOWN_MS는 상수 정의 (하드코딩 금지 원칙 준수)

---

## 5. [P2] 터치 버튼 크기 확대 + 웍 버튼 배치 변경

### 배경 (터치 타겟 업계 기준)

| 가이드라인 | 최소 터치 타겟 크기 | 출처 |
|-----------|-------------------|------|
| Apple Human Interface Guidelines | 44 × 44 pt | iOS/iPadOS |
| Material Design 3 | 48 × 48 dp | Android |
| WCAG 2.5.8 (AAA) | 44 × 44 CSS px | W3C |
| WCAG 2.5.5 (AA) | 24 × 24 CSS px (최소) | W3C |

**KitchenFlow 타겟 기준:**
- 주 타겟: iPad (터치) → Apple HIG 44pt 기준 적용
- 보조 타겟: 모바일 (터치) → 동일 기준
- 데스크톱 (마우스) → 기존 크기 유지 가능 (마우스는 정밀 포인팅)

따라서 태블릿/모바일 breakpoint에서 버튼 최소 크기를 **44 × 44 CSS px** 이상으로 보장해야 한다.

### 대상 버튼 분류

**A. 네비게이션 버튼 (◀ ▶ 뒤돌기)**

현재 상태:
- CSS 변수 `--game-nav-size`로 관리 중 (정확한 현재값은 최신 코드 확인 필요)
- 원형(border-radius: 50%) 스타일

필요한 변경:
- 태블릿/모바일 breakpoint에서 `--game-nav-size`를 최소 48px로 설정
- 내부 텍스트(◀▶↩) 또는 아이콘 크기도 비례 확대

**B. 장비 컴포넌트 버튼**

대상 (프로젝트 지식 기반):
- 웍: 볶기 버튼(홀드), 불 단계 버튼(0~3)
- 씽크: 세척 버튼(홀드)
- 전자레인지: 시작 버튼, 시간 설정
- 튀김채: 내리기/올리기 버튼

현재 상태:
- CSS Module로 전환 완료 (반응형 패치에서)
- 크기는 CSS 변수(--font-xs 등) 참조
- 태블릿/모바일에서의 구체적 크기는 최신 코드 확인 필요

필요한 변경:
- 장비 버튼 전용 CSS 변수 신설: `--equip-btn-min-size` (태블릿/모바일 breakpoint에서 44px)
- 모든 장비 내 액션 버튼에 `min-width`/`min-height` 적용
- padding 확대로 터치 영역 확보

**C. 웍 버튼 배치 변경 — 아래 → 위**

현재 상태 (프로젝트 지식 기반):
- 장비 컴포넌트 버튼은 이미지 외부에 렌더링
- EquipmentOverlayWrapper가 droppable 담당
- 버튼이 이미지 아래쪽에 배치됨

문제:
- iPad에서 화면 하단에 위치한 웍의 버튼이 더 아래로 밀려 터치하기 어려움
- 화면 하단부는 엄지 도달 범위 밖이거나, 핸드바와 겹칠 수 있음

변경:
- **웍 컴포넌트의 버튼 영역을 이미지 위쪽에 배치**
- 이것은 CSS의 flex-direction 또는 order 변경으로 해결 가능한지, 아니면 TSX 구조 변경이 필요한지 최신 코드 확인 후 판단
- 다른 장비(씽크, MW, 튀김채)는 현재 배치 유지 (문제 보고 없음)
- 단, 최신 코드 확인 후 다른 장비도 동일한 문제가 있다면 일괄 변경 고려

**중요 제약사항:**
- EquipmentOverlayWrapper의 droppable 영역은 변경하지 않음
- 웍의 물리엔진(tickWok, burner_level, stirring) 로직 변경 없음
- 볶기 버튼의 onMouseDown/onMouseUp(또는 onPointerDown/onPointerUp) 핸들러 로직 변경 없음
- skipDroppable 패턴 유지

### 정보 검토 시 확인할 것

1. **네비게이션 버튼 현재 크기**: `--game-nav-size` 값 (데스크톱/태블릿/모바일 각각)
2. **장비 컴포넌트 버튼 현재 구조**:
   - WokComponent.tsx: 볶기 버튼과 불 단계 버튼의 HTML 구조 + CSS
   - SinkComponent.tsx: 세척 버튼의 HTML 구조 + CSS
   - MicrowaveComponent.tsx: 시작/시간 버튼의 HTML 구조 + CSS
   - FryingBasketComponent.tsx: 내리기/올리기 버튼의 HTML 구조 + CSS
3. **웍 컴포넌트 레이아웃**: 이미지와 버튼의 현재 DOM 순서, flex-direction, CSS layout
4. **EquipmentOverlayWrapper**: 장비 컴포넌트를 감싸는 구조, overlay 이미지와 버튼의 관계
5. **gameVariables.css**: 장비 관련 변수 현재 목록 (--equip-bg, --equip-text, --equip-btn-radius 등)
6. **태블릿/모바일 breakpoint**: `@media (max-width: 1024px)`, `@media (max-width: 768px)` 블록 내 장비 관련 변수

### CSS 변수 신설 계획

gameVariables.css에 추가할 변수 (값은 정보 검토 후 확정):

```css
/* ── 데스크톱 기본 ── */
:root {
  --equip-btn-min-size: 32px;       /* 장비 버튼 최소 크기 (데스크톱: 마우스) */
  --game-nav-size: [현재값 유지];    /* 네비 버튼 (이미 존재) */
}

/* ── 태블릿 (≤1024px) ── */
@media (max-width: 1024px) {
  :root {
    --equip-btn-min-size: 44px;     /* Apple HIG 최소 터치 타겟 */
    --game-nav-size: 48px;          /* 네비 버튼 확대 */
  }
}

/* ── 모바일 (≤768px) ── */
@media (max-width: 768px) {
  :root {
    --equip-btn-min-size: 44px;     /* 동일 유지 */
    --game-nav-size: 44px;          /* 화면 작으므로 48 → 44 */
  }
}
```

### 웍 버튼 위치 변경 상세 설계

**변경 목표:**
```
[현재]                     [변경 후]
┌─────────────┐           ┌─────────────┐
│ 웍 overlay  │           │ 불1 불2 불3 │  ← 버튼 영역 (위)
│  이미지     │           │ [  볶기  ]  │
├─────────────┤           ├─────────────┤
│ 불1 불2 불3 │           │ 웍 overlay  │
│ [  볶기  ]  │           │  이미지     │
└─────────────┘           └─────────────┘
```

**구현 방향 (2가지 후보, 최신 코드 확인 후 택 1):**

방향 A: CSS `flex-direction: column-reverse` 또는 `order` 속성
- TSX 변경 없음, CSS만 변경
- 태블릿/모바일 breakpoint에서만 적용 (데스크톱은 기존 유지)

방향 B: TSX에서 버튼 영역과 이미지 영역의 DOM 순서 변경
- CSS로 해결 불가한 구조인 경우
- 조건부 렌더링 또는 공통 래퍼로 처리

**우선 방향 A 시도. 불가하면 방향 B.**

**3 breakpoint 전략 (이 패치의 모든 항목에 적용):**

| breakpoint | 웍 버튼 위치 | 이유 |
|------------|-------------|------|
| 데스크톱 (>1024px) | 아래 (기존) | 마우스 정밀 조작, 변경 불필요 |
| 태블릿 (≤1024px) | 위 | 터치 영역 확보, 핸드바 겹침 방지 |
| 모바일 (≤768px) | 위 | 동일 |

### 기존 원칙 준수

| 원칙 | 준수 방법 |
|------|----------|
| 물리엔진 클라이언트 전용 | 변경 없음 |
| CSS 변수 하드코딩 금지 | 신규 변수 gameVariables.css 정의 |
| 어드민/게임 분리 | 게임 컴포넌트만 수정 |
| DnD 로직 변경 없음 | droppable/draggable ID 체계 유지 |
| skipDroppable 패턴 유지 | EquipmentOverlayWrapper 구조 유지 |
| 파일 읽기 전 수정 금지 | 매 Step 정보 검토 선행 |

---

## 6. 구현 Step 상세

### Phase 1: P3 — 텍스트 선택 방지

```
Step 1: 정보 검토
  - GamePage의 최상위 컨테이너 className + CSS Module
  - 게임 내 <input>/<textarea> 목록
  - 기존 user-select / touch-action 적용 현황

Step 2: 구현
  - .gameArea에 user-select: none + webkit 접두사 + touch-action 적용
  - input 요소에 user-select: auto 예외 복원

Step 3: 검증
  - npm run build
  - iPad에서 볶기 버튼 길게 눌러 텍스트 선택 안 됨 확인
  - QuantityInputModal 입력 정상 확인
```

### Phase 2: P1 — 모바일 스크롤 해결

```
Step 4: 정보 검토
  - html → body → #root → GamePage → .gameArea 높이 체인 전체
  - gameVariables.css 모바일 블록
  - 플로팅 컴포넌트 position 현황
  - body/html 글로벌 스타일

Step 5: 구현
  - 높이 체인에서 끊긴 곳 수정 (100vh → 100dvh 포함)
  - overflow: hidden 확인/추가
  - 모바일 breakpoint 변수값 점검

Step 6: 검증
  - npm run build
  - 모바일 해상도(375×667, 390×844 등) DevTools 시뮬레이션
  - iPad 해상도(1024×768) 회귀 없음 확인
  - 데스크톱 회귀 없음 확인
```

### Phase 3: P4 — 드래그 호버 네비게이션 쿨다운

```
Step 7: 정보 검토
  - 드래그 엣지 호버 로직 위치 + 구조
  - 타이머 ref, isOverRef 변수 전체
  - goNext/goPrev/goTurn 호출 후 ref 처리
  - 뒤돌기 버튼 + 우사이드바 버튼 드래그 호버 구조

Step 8: 구현
  - COOLDOWN_MS 상수 정의 (500ms)
  - 네비게이션 실행 후 timestamp 기록
  - onDragMove에서 쿨다운 기간 내 호버 무시
  - 뒤돌기 버튼 호버에도 동일 적용 (해당 시)

Step 9: 검증
  - npm run build
  - 드래그 중 좌측 가장자리 호버 → 1번만 이동 확인
  - 드래그 중 우측 가장자리 호버 → 1번만 이동 확인
  - 쿨다운 후 같은 방향 재호버 → 정상 이동 확인
  - 드래그 종료 후 일반 클릭 네비게이션 정상 확인
```

### Phase 4: P2 — 터치 버튼 크기 + 웍 배치

```
Step 10: 정보 검토
  - 네비게이션 버튼 현재 크기 (3 breakpoint)
  - 장비 4종 버튼 HTML/CSS 구조
  - 웍 레이아웃 (이미지-버튼 DOM 순서, flex 방향)
  - EquipmentOverlayWrapper 구조
  - gameVariables.css 장비 관련 변수

Step 11: CSS 변수 신설 + 네비 버튼 확대
  - --equip-btn-min-size 변수 추가
  - --game-nav-size 태블릿/모바일 값 조정

Step 12: 장비 버튼 크기 확대
  - 4종 장비 CSS Module에 min-width/min-height: var(--equip-btn-min-size)
  - padding 조정으로 터치 영역 확보
  - 데스크톱 회귀 없음 확인

Step 13: 웍 버튼 위치 변경 (위쪽 배치)
  - 태블릿/모바일 breakpoint에서 버튼 영역을 이미지 위로
  - CSS flex-direction 또는 order 우선 시도
  - 불가 시 TSX 구조 변경 (방향 B)

Step 14: 전체 검증
  - npm run build
  - iPad 실기기: 네비 버튼 터치 편의성
  - iPad 실기기: 웍 볶기 버튼 터치 편의성
  - iPad 실기기: 씽크 세척 버튼 터치 편의성
  - 데스크톱: 기존 레이아웃 회귀 없음
  - DnD 전체 플로우 정상
```

---

## 7. 변경하지 않는 것 (명시)

| 항목 | 이유 |
|------|------|
| DnD 핸들러 로직 (onDragStart, onDragEnd) | 터치 UX 변경과 무관 |
| 물리엔진 (tickWok, tickFryingBasket 등) | 순수 게임 로직 |
| 레시피 판별 로직 | 무관 |
| Zustand 스토어 상태 구조 | CSS/이벤트 레이어 작업 |
| 히트박스 좌표/렌더링 | 비율 기반, 크기 무관 |
| 어드민 페이지 | 게임 전용 패치 |
| droppable/draggable ID 체계 | 무관 |
| ContainerCard 이미지 로직 | 무관 |
| 사이드바 열림/닫힘 로직 | 무관 |

---

## 8. DB 변경: 없음

---

## 9. 위험 요소와 대응

### 위험 1: dvh 미지원 브라우저

dvh는 비교적 최신 CSS 단위. 타겟 디바이스(iPad Safari 15.4+, Chrome Android 108+)에서는 지원하지만 구형 브라우저에서는 미지원.

**대응:** fallback 패턴 적용. `height: 100vh; height: 100dvh;` 순서로 선언하면 미지원 브라우저는 vh를, 지원 브라우저는 dvh를 사용.

### 위험 2: 웍 버튼 위치 변경 시 EquipmentOverlayWrapper 충돌

웍 버튼을 위로 올리면 overlay 이미지와의 relative 위치가 달라져 droppable 영역에 영향이 있을 수 있다.

**대응:** EquipmentOverlayWrapper의 droppable 영역은 overlay 이미지 기준이므로, 버튼 위치 변경은 droppable에 영향 없음이 보장되어야 한다. 정보 검토 단계에서 droppable ref가 어디에 걸려있는지 반드시 확인.

### 위험 3: touch-action: manipulation과 @dnd-kit 충돌

@dnd-kit은 내부적으로 touch-action을 제어할 수 있다. 게임 영역 전체에 touch-action: manipulation을 걸면 DnD 터치 동작에 영향이 있을 수 있다.

**대응:** 정보 검토에서 @dnd-kit의 sensors 설정과 touch-action 관련 설정을 확인. 충돌 시 touch-action 적용 범위를 좁힌다 (DnD 영역 제외, 버튼/홀드 영역에만 적용).

### 위험 4: 네비게이션 쿨다운과 빠른 연속 조작

500ms 쿨다운이 의도적으로 빠르게 섹션을 넘기고 싶은 사용자를 차단할 수 있다.

**대응:** 쿨다운은 **드래그 중 호버 네비게이션에만** 적용. 일반 클릭(◀▶ 버튼 직접 클릭)에는 적용하지 않는다. 드래그 중에 빠른 연속 이동이 필요한 유스케이스는 없다 (재료를 든 채 2칸 이상 이동은 한 번 이동 후 다시 호버하면 됨).

---

## 10. 완료 기준

### P3 (텍스트 선택 방지)
- [ ] iPad에서 볶기 버튼 long-press 시 텍스트 선택 안 됨
- [ ] iPad에서 세척 버튼 long-press 시 텍스트 선택 안 됨
- [ ] QuantityInputModal 숫자 입력 정상
- [ ] 게임 외 페이지(로그인, 어드민) 텍스트 선택 정상

### P1 (모바일 스크롤)
- [ ] 모바일 해상도(375×667)에서 스크롤 없음
- [ ] 모바일 해상도(390×844)에서 스크롤 없음
- [ ] iPad 해상도(1024×768)에서 스크롤 없음 (기존 유지)
- [ ] 데스크톱 해상도에서 회귀 없음

### P4 (호버 네비게이션)
- [ ] 드래그 중 좌측 호버 → 정확히 1번만 이동
- [ ] 드래그 중 우측 호버 → 정확히 1번만 이동
- [ ] 쿨다운 후 재호버 → 정상 이동
- [ ] 일반 클릭 네비게이션 → 쿨다운 영향 없음

### P2 (터치 버튼)
- [ ] 네비게이션 버튼: iPad에서 44px 이상 터치 타겟
- [ ] 웍 버튼: iPad에서 44px 이상 터치 타겟
- [ ] 씽크 세척 버튼: iPad에서 44px 이상 터치 타겟
- [ ] 웍 버튼 위치: iPad에서 이미지 위에 배치
- [ ] 데스크톱: 웍 버튼 위치 기존(아래) 유지
- [ ] 데스크톱: 모든 버튼 크기 기존 유지
- [ ] DnD 전체 플로우 정상

### 빌드
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음

---

## 11. A/B 클로드 AI 지시 템플릿

각 Step마다 A 또는 B에게 전달할 지시의 기본 형식:

```
## 임무: [Step 번호] [Step 제목]

### 읽어야 할 문서
- CLAUDE.md
- KitchenFlow_프로젝트지식_v3.md
- KitchenFlow_개발지침서_v2.md
- KitchenFlow_터치UX_패치_설계서.md (이 문서)

### 읽어야 할 코드 (수정하지 말고 읽기만)
- [파일 목록]

### 보고할 내용
- [확인사항 목록]

### 작업 프로세스
1. 위 문서와 코드를 읽고 현재 상태를 파악한다
2. 변경 계획을 수립하여 보고한다
3. 보고 후 지시가 있을 때까지 대기한다 (구현하지 않는다)
```

---

_설계서 작성 완료_