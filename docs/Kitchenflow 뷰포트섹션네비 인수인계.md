# KitchenFlow — 뷰포트 섹션 네비게이션 인수인계 문서

> **이 문서의 목적**: 뷰포트 섹션 기반 네비게이션 시스템을 구현할 지휘관에게 전달하는 완전한 인수인계 문서다.  
> 기존 구조와의 충돌, 수학적 설계, DB 변경 여부, 구현 순서까지 모두 포함한다.

---

## 1. 변경 범위 요약

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 이동 단위 | 자유 px (SLIDE_STEP 고정값) | 섹션 단위 (sectionWidth = img.offsetWidth / 8) |
| 상태 관리 | `viewOffset: number` (px) | `currentSection: number` (1~7, 4/8 제외) |
| 이동 범위 | 클램프 (0 ~ 이미지 너비 - 컨테이너 너비) | 섹션 유효성 검사 (1,2,3,5,6,7만 허용) |
| 뒤돌기 | 미구현 (버튼만 존재) | 8 - currentSection = 목적지 공식 |
| 사이드바 너비 | 좌 240px 고정, 우 32px 고정 | sectionWidth * 0.2 동적 계산 |
| 드래그 엣지 호버 | 기존 RightSidebar 버튼 감지 방식 | 화면 좌우 가장자리 영역 감지 방식 |

---

## 2. 섹션 구조 설계 (핵심)

```
파노라마 이미지 전체:
┌──┬──┬──┬──┬──┬──┬──┬──┐
│ 1│ 2│ 3│ 4│ 5│ 6│ 7│ 8│
└──┴──┴──┴──┴──┴──┴──┴──┘

플레이어 위치 개념:
- 앞면 (카메라 → 앞벽): 섹션 1, 2, 3
- 오른쪽 벽: 섹션 4 (코너, 이동 불가)
- 뒷면 (카메라 → 뒷벽): 섹션 5, 6, 7
- 왼쪽 벽: 섹션 8 (코너, 이동 불가)

이동 가능 섹션: 1, 2, 3, 5, 6, 7
벽 섹션 (이동 불가): 4, 8
```

### 2-1. 뒤돌기 공식

```
goTurn(): 목적지 = 8 - currentSection

1 → 7
2 → 6
3 → 5
5 → 3
6 → 2
7 → 1
```

### 2-2. 화살표 이동 규칙

```
goNext() — 오른쪽 화살표:
  3 → goTurn() (뒤돌기, 목적지 5)
  7 → goTurn() (뒤돌기, 목적지 1)
  그 외 → currentSection + 1

goPrev() — 왼쪽 화살표:
  1 → goTurn() (뒤돌기, 목적지 7)
  5 → goTurn() (뒤돌기, 목적지 3)
  그 외 → currentSection - 1
```

**주의**: 4번, 8번은 절대 currentSection 값이 되어서는 안 된다.  
goNext/goPrev 결과가 4 또는 8이 되는 경우는 위 규칙상 발생하지 않는다.  
안전망으로 유효성 검사 추가 권장.

---

## 3. 뷰포트 레이아웃 수학

### 3-1. 기본 단위

```
sectionWidth = imgRef.current.offsetWidth / 8

뷰포트에 표시되는 것:
  이전 섹션 0.2 + 현재 섹션 1.0 + 다음 섹션 0.2 = 총 1.4 섹션

뷰포트 컨테이너 너비 = sectionWidth * 1.4
```

### 3-2. translateX 계산

```
현재 섹션의 이미지 내 시작 x = (currentSection - 1) * sectionWidth

이전 섹션 0.2가 왼쪽에 보여야 하므로:
translateX = -((currentSection - 1) * sectionWidth) + (sectionWidth * 0.2)

예시 (currentSection = 2, sectionWidth = 200px):
translateX = -(1 * 200) + (200 * 0.2) = -200 + 40 = -160px
→ 이미지가 왼쪽으로 160px 이동 → 섹션2 왼쪽에 섹션1의 40px가 보임
```

### 3-3. 경계 섹션 처리 (섹션 1, 7)

```
섹션 1: 이전 섹션 없음 → 왼쪽 0.2는 빈 공간 또는 이미지 밖 (검정/배경)
섹션 7: 다음 섹션 없음 → 오른쪽 0.2는 빈 공간 또는 이미지 밖 (검정/배경)

→ 뷰포트 컨테이너 overflow: hidden으로 자연스럽게 처리됨
→ 별도 클램프 로직 불필요 (섹션 유효성 검사로 충분)
```

### 3-4. 사이드바 너비 동적 계산

```
좌측 사이드바 너비 = sectionWidth * 0.2
우측 사이드바 너비 = sectionWidth * 0.2

CSS custom property 방식:
GamePage에서 계산 → style={{ '--sidebar-width': sectionWidth * 0.2 + 'px' }}
GamePage.module.css: grid-template-columns: var(--sidebar-width) 1fr var(--sidebar-width)

초기값 (sectionWidth 계산 전):
--sidebar-width: 0px (사이드바 숨김 상태)
또는 적절한 fallback (예: 60px)
```

---

## 4. 기존 구조와의 충돌 분석

### 4-1. uiStore.ts — viewOffset 제거 여부

**현재**: `viewOffset: number` (px값)  
**충돌**: MainViewport가 현재 viewOffset을 기반으로 translateX 계산  
**결정**:
- `currentSection: number` 신규 추가
- `viewOffset`은 **유지** (다른 컴포넌트에서 참조 여부 먼저 확인 필요)
- MainViewport 내부에서만 currentSection → translateX 변환
- 이후 viewOffset 참조가 없음이 확인되면 별도 정리

### 4-2. GamePage.module.css — 그리드 열 고정값

**현재**: `grid-template-columns: 240px 1fr 32px`  
**충돌**: 사이드바 너비가 sectionWidth * 0.2로 동적 변환  
**결정**: CSS custom property `--sidebar-width` 방식으로 변경  
JS에서 계산 후 GamePage 루트 엘리먼트에 style로 주입

### 4-3. MainViewport 내 드래그 엣지 호버

**현재**: GamePage.tsx onDragMove에서 `#right-sidebar-toggle` 버튼 위치 감지  
**충돌**: 새 방식은 화면 좌우 가장자리 영역(뷰포트 내 좌우 10% 영역)을 감지  
**결정**: 두 감지 로직은 독립적. 기존 right-sidebar-toggle 감지는 그대로 유지.  
새 엣지 호버 감지는 MainViewport 내부에서 별도 처리.

### 4-4. HitboxLayer — currentZoneId 의존성

**현재**: HitboxLayer가 `currentZoneId`를 props 또는 store에서 받아 히트박스 로딩  
**충돌**: currentSection 변경 시 currentZoneId가 함께 변경되어야 하는지 확인 필요  
**결정**: 현재 설계에서 main_kitchen 존의 히트박스는 전체 파노라마 기준이므로  
**섹션 이동이 currentZoneId를 바꾸지 않는다.**  
섹션은 단순히 어느 위치를 보는지의 카메라 위치일 뿐.

### 4-5. img.offsetWidth 기준 원칙

기존 원칙: **슬라이드 클램프는 img.offsetWidth 기준**  
→ 이번 구현에서도 동일하게 `sectionWidth = imgRef.current.offsetWidth / 8` 사용  
→ 원칙 위배 없음

---

## 5. DB 변경 여부

**DB 변경 없음.**

섹션 네비게이션은 완전히 클라이언트 상태다.  
- `currentSection`은 uiStore에만 존재 (Zustand 클라이언트 전용 원칙 준수)
- 세션 종료 시 DB write 대상 아님
- kitchen_zones 테이블 변경 없음
- area_definitions 변경 없음

---

## 6. 물리법칙 체크

이번 작업은 카메라 위치(렌더링) 변경이며, 물리엔진(웍/MW/튀김채)과 무관하다.  
물리엔진은 Zustand equipmentStore에서 독립적으로 동작하므로 충돌 없음.

---

## 7. 수정 대상 파일 목록

| 파일 | 변경 내용 | 우선순위 |
|------|----------|---------|
| `src/stores/uiStore.ts` | currentSection 상태 + 이동 액션 추가 | 1 |
| `src/components/layout/MainViewport.tsx` | 섹션 기반 translateX, 이동 함수, 뒤돌기 | 1 |
| `src/components/layout/MainViewport.module.css` | 뷰포트 컨테이너 너비 동적 처리 | 1 |
| `src/pages/GamePage.tsx` | --sidebar-width custom property 주입 | 2 |
| `src/pages/GamePage.module.css` | 그리드 열 고정px → var(--sidebar-width) | 2 |

---

## 8. 구현 세부 지침

### 8-1. sectionWidth 계산 타이밍

```
imgRef로 img 엘리먼트 참조.
sectionWidth 계산은 두 시점에 수행:
1. 이미지 onLoad 이벤트
2. window resize 이벤트 (ResizeObserver 권장)

sectionWidth는 useState로 관리.
초기값: 0 (계산 전 이동 불가 처리)
```

### 8-2. 드래그 중 엣지 호버

```
onDragMove (GamePage) 또는 MainViewport 내 별도 핸들러:

뷰포트 컨테이너의 getBoundingClientRect() 기준
좌측 10% 영역 진입 → 200ms 타이머 → goPrev()
우측 10% 영역 진입 → 200ms 타이머 → goNext()

타이머 ref로 관리. 이탈 시 취소.
isOverLeftRef, isOverRightRef로 중복 방지.
드래그 종료 시 타이머 + ref 초기화.
```

### 8-3. 전환 애니메이션

```
뒤돌기 포함 모든 전환: transition: transform 0.3s ease
뒤돌기 특별 효과 없음 (일반 슬라이드와 동일).
```

### 8-4. 섹션 유효성 검사 함수

```typescript
const VALID_SECTIONS = [1, 2, 3, 5, 6, 7];
const isValidSection = (s: number) => VALID_SECTIONS.includes(s);

const getTurnTarget = (current: number) => 8 - current;

const goNext = () => {
  if (current === 3 || current === 7) return goTurn();
  const next = current + 1;
  if (isValidSection(next)) setCurrentSection(next);
};

const goPrev = () => {
  if (current === 1 || current === 5) return goTurn();
  const prev = current - 1;
  if (isValidSection(prev)) setCurrentSection(prev);
};

const goTurn = () => {
  const target = getTurnTarget(current);
  if (isValidSection(target)) setCurrentSection(target);
};
```

---

## 9. 절대 원칙 (이번 작업 전용)

1. **파일 읽기 전 수정 금지.** 관련 파일 전부 읽고 현재 구조 파악 후 수정.
2. **sectionWidth는 반드시 img.offsetWidth / 8.** 하드코딩 금지.
3. **currentSection 값으로 4, 8이 절대 설정되어서는 안 됨.** 유효성 검사 필수.
4. **viewOffset 제거 여부는 파일 읽은 후 참조 여부 확인 후 결정.** 섣불리 제거 금지.
5. **사이드바 너비 CSS는 custom property 방식.** 인라인 스타일로 직접 px 주입 금지.
6. **any 타입 사용 금지.**
7. **작업 완료 후 npm run build 오류 없음 확인.**

---

## 10. 완료 기준 체크리스트

- [ ] 페이지 로드 시 섹션 1 표시
- [ ] 왼쪽/오른쪽 화살표로 섹션 이동 확인
- [ ] 섹션 1에서 왼쪽 → 섹션 7로 이동 (뒤돌기)
- [ ] 섹션 3에서 오른쪽 → 섹션 5로 이동 (뒤돌기)
- [ ] 섹션 5에서 왼쪽 → 섹션 3으로 이동 (뒤돌기)
- [ ] 섹션 7에서 오른쪽 → 섹션 1로 이동 (뒤돌기)
- [ ] 뒤돌기 버튼 클릭 → 8 - currentSection 이동
- [ ] 현재 섹션 양옆 0.2씩 보임
- [ ] 사이드바 너비 = sectionWidth * 0.2 일치
- [ ] 드래그 중 화면 가장자리 호버 200ms → 섹션 이동
- [ ] 윈도우 리사이즈 시 sectionWidth 재계산 + 레이아웃 유지
- [ ] npm run build 오류 없음

---

_작성일: Phase 2 완료 후 Phase 3 (뷰포트 섹션 네비게이션) 시작 전_