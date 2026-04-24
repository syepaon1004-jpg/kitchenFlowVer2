# 모바일 UI 반응형 — 핸드바 · 선택 요소 축소 미적용 수정 계획서

## 1. Context

모바일(≤768px) 해상도에서 **핸드바([Handbar.tsx](../src/components/layout/Handbar.tsx))**와 **선택 요소 표시([SelectionDisplay.tsx](../src/components/game/SelectionDisplay.tsx))**가 데스크톱·태블릿과 동일한 크기로 보이고, 모바일에 맞게 축소되지 않는다. 폰트 크기는 CSS 변수 `--font-base`에 연동되어 줄어들지만, **padding·min-height 값이 줄어들지 않아** 결과적으로 컴포넌트 외형이 거의 그대로 유지된다.

본 계획서는 그 원인을 규명하고 최소 변경으로 반응형을 확보하기 위한 수정 방향을 정리한다.

## 2. 조사 결과

### 2.1 문제 지점 — 하드코딩 값

| 파일 | 라인 | 값 | 문제 |
|---|---|---|---|
| [src/components/layout/Handbar.module.css](../src/components/layout/Handbar.module.css) | 9 | `padding: 10px 14px;` | px 고정 — 브레이크포인트 무관하게 동일 |
| [src/components/layout/Handbar.module.css](../src/components/layout/Handbar.module.css) | 12 | `border-radius: 12px;` | px 고정 (시각적 가벼운 문제) |
| [src/components/game/SelectionDisplay.module.css](../src/components/game/SelectionDisplay.module.css) | 9 | `padding: 10px 14px;` | Handbar와 동일 문제 |
| [src/components/game/SelectionDisplay.module.css](../src/components/game/SelectionDisplay.module.css) | 12 | `border-radius: 12px;` | 동일 |

두 컴포넌트 모두 `font-size`는 `var(--font-base)` 연동, `min-height`는 `var(--handbar-min-height)` 연동 — 변수 설계는 반영되어 있으나 **padding만 빠져 있다**.

### 2.2 문제 지점 — CSS 변수 cascade 누락

[src/styles/gameVariables.css](../src/styles/gameVariables.css) 는 3단 브레이크포인트(desktop · tablet ≤1500px · mobile ≤768px)로 구성돼 있는데, **mobile 섹션(라인 138-167)에서 다음 변수들이 재정의되지 않는다**:

| 변수 | desktop(`:root`) | tablet(≤1500px) | mobile(≤768px) | 상속 결과 |
|---|---|---|---|---|
| `--handbar-min-height` | 72px | 64px | **미정의** | 모바일도 64px |
| `--handbar-max-width` | 500px | 420px | **미정의** | 모바일도 420px |
| `--handbar-left` | `var(--spacing-sm)` | `var(--spacing-sm)` | **미정의** (간접 영향) | 간격만 축소 |
| `--billqueue-left` | 52px | 44px | **미정의** | 모바일도 44px |
| `--billqueue-right-reserve` | 220px | 180px | **미정의** | 모바일도 180px |
| `--nav-back-bottom` | `calc(--handbar-height + 16px)` | 자동 | 자동 | handbar-height만 50px로 줄어서 자동 반영 ✓ |

CSS 변수는 **상속되므로** 미디어쿼리에서 재정의하지 않으면 이전 단계 값이 그대로 유지된다. mobile(768px 이하)에서 handbar의 `min-height`가 여전히 64px이라 컴포넌트 세로 길이가 tablet과 같다.

### 2.3 문제 지점 — JS 상수 하드코딩

[src/lib/interaction/constants.ts:16](../src/lib/interaction/constants.ts#L16)

```ts
export const PLACED_CONTAINER_SIZE_VH = 8;
```

이 값은 `width: 8vh; height: 8vh;` 인라인 스타일로 사용된다 ([GameKitchenView.tsx:797,811-812](../src/components/game/GameKitchenView.tsx#L797)). vh 단위는 뷰포트에 비례하지만 **브레이크포인트별 축소 비율은 조정되지 않는다** — 모바일(예: 667 viewport height)에서 53px, 데스크톱(1080)에서 86px로 동일한 8% 점유. 이번 이슈의 "선택 요소/핸드바"에는 직접 해당하지 않으나, 사용자 피드백 대상이 될 수 있어 참고로 기록.

### 2.4 정상 동작하는 부분 (수정 불필요)

- `index.html` viewport meta 태그 (`width=device-width, initial-scale=1.0`) — 정상.
- `font-size`, `spacing-*`, `game-nav-size` 등 주요 변수는 mobile 미디어쿼리에서 재정의됨.
- 게임 월드(panel, equipment, hologram, 서랍/냉장고 내부 셀)는 **% 기반 상대 배치**라 자동 스케일.
- `--handbar-height`는 mobile에서 50px로 재정의됨 → handbar wrapper 영역(`GamePage.module.css`의 layout slot)은 정상 축소. 문제는 Handbar **컴포넌트 내부 box** 크기.

## 3. 근본 원인 정리

**핸드바/선택 요소가 모바일에서 축소되지 않는 이유는 두 가지가 복합적**:

1. **컴포넌트 CSS의 `padding: 10px 14px` 하드코딩** — 어느 브레이크포인트에서도 동일.
2. **mobile 미디어쿼리에 `--handbar-min-height` 재정의 누락** — tablet 값 64px이 상속되어 세로 길이가 줄지 않음.

폰트와 칩(`.ingredientChip`, `.chip`)의 padding은 이미 변수 연동되어 축소되지만, **컨테이너 자체의 padding·min-height**가 축소되지 않으면 전체 실루엣은 tablet과 동일하게 보인다.

## 4. 수정 방향 (최소 변경)

### 4.1 Pri-1 — mobile 미디어쿼리 변수 누락 보강

**파일**: [src/styles/gameVariables.css](../src/styles/gameVariables.css) — 라인 139-167 `@media (max-width: 768px)` 블록에 아래 추가.

```css
--handbar-min-height: 48px;       /* tablet 64 → mobile 48 */
--handbar-max-width: 340px;       /* tablet 420 → mobile 340 */
--billqueue-left: 36px;
--billqueue-right-reserve: 140px;
/* --handbar-left는 --spacing-sm 연동이라 spacing-sm 축소로 자동 반영됨 → 생략 */
```

값은 제안치이며 실측 테스트에서 조정.

### 4.2 Pri-1 — Handbar / SelectionDisplay padding 변수화

두 파일에서 동일 수정.

**[src/components/layout/Handbar.module.css:9](../src/components/layout/Handbar.module.css#L9)**
```diff
- padding: 10px 14px;
+ padding: var(--spacing-sm) var(--spacing-md);
```

**[src/components/game/SelectionDisplay.module.css:9](../src/components/game/SelectionDisplay.module.css#L9)**
```diff
- padding: 10px 14px;
+ padding: var(--spacing-sm) var(--spacing-md);
```

기존 값 `10px 14px`는 desktop의 `spacing-sm(8px) · spacing-md(12px)`와 근접. mobile에서는 `6px · 9px`로 자연스럽게 축소.

### 4.3 Pri-2 — border-radius 변수화 (선택 사항)

시각 일관성을 위한 보조 수정. 기능상 필수 아님.

```diff
- border-radius: 12px;
+ border-radius: var(--spacing-md);
```

두 파일 모두 라인 12. mobile에서 `9px`로 약간 날카로워짐.

### 4.4 Pri-3 — PLACED_CONTAINER_SIZE_VH 반응형화 (본 이슈와 별도, 참고)

이번 버그 범위는 아니지만 같은 계열 문제로 분류. 별도 이슈로 처리 권장. 수정한다면:

- 옵션 A: `gameVariables.css`에 `--placed-container-size: 8vh;` 추가하고 mobile에서 `6vh`로 재정의. [GameKitchenView.tsx:811-812](../src/components/game/GameKitchenView.tsx#L811-L812)에서 인라인 style을 `width: 'var(--placed-container-size)'` 로 교체, [constants.ts:16](../src/lib/interaction/constants.ts#L16) 제거.
- 옵션 B: constants.ts를 `window.matchMedia('(max-width: 768px)').matches ? 6 : 8` 형태로 런타임 분기 (리사이즈 대응 시 별도 리스너 필요).

옵션 A(CSS 변수)가 유지보수 측면에서 우수.

## 5. 수정 파일 목록 (Pri-1만)

| 파일 | 변경 |
|---|---|
| `src/styles/gameVariables.css` | `@media (max-width: 768px)` 블록에 `--handbar-min-height`, `--handbar-max-width`, `--billqueue-left`, `--billqueue-right-reserve` 추가 |
| `src/components/layout/Handbar.module.css` | `padding: 10px 14px;` → `var(--spacing-sm) var(--spacing-md)` |
| `src/components/game/SelectionDisplay.module.css` | 동일 |

## 6. 검증

1. 개발 서버 실행, 브라우저 개발자 도구 "Device Toolbar" 또는 리사이즈로 아래 폭을 순회:
   - ≥1501px (desktop): 기존 크기 유지 확인
   - 900~1500px (tablet): 중간 크기 축소 확인
   - 375~768px (mobile): 핸드바/선택 요소의 높이·좌우 padding 모두 축소 확인
2. `--handbar-min-height`가 mobile에서 적용되는지 DevTools "Computed" 탭에서 확인 (48px).
3. 회귀: 핸드바에 재료 칩이 여러 개 들어갔을 때 mobile에서 wrap 동작 정상 여부 (`flex-wrap: wrap` 유지 확인).
4. SelectionDisplay가 선택 해제 상태(`.empty`)일 때도 mobile에서 축소되는지.
5. BillQueue 드롭다운 위치가 `--billqueue-*` 변수 축소 후에도 화면을 벗어나지 않는지 확인.

## 7. 본 계획서 외 관찰 사항

- CSS 변수 설계 자체는 체계적 — mobile 블록에 몇 개 변수만 추가하면 대부분 자동 반영.
- `Handbar`와 `SelectionDisplay`의 스타일이 거의 동일(padding, font, min-height, border-radius 공유) → 향후 공통 스타일 추출 여지 있으나 이번 범위 밖.
- 프로젝트 내 `@media` 쿼리는 `gameVariables.css`에만 있고 컴포넌트 CSS에는 없음 — "단일 지점 반응형" 패턴. 본 수정도 이 패턴을 존중.
