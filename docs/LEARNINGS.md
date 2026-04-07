# KitchenFlow — 학습 기록

> Claude Code가 세션마다 누적하는 프로젝트 학습 기록.
> 세션 시작 시 읽고, 작업 중 발견/패턴을 기록하고, 50줄 초과 시 압축한다.
> 포맷: `## YYYY-MM-DD — 한 줄 요약` + 본문 1~3줄.

---

## CSS 3D

## 2026-04-07 — translateZ 후 hit-test는 face 요소에서
- `getBoundingClientRect()`는 perspective가 적용된 조상 아래에서 `translateZ` 변형 후의 투영 rect를 반환한다.
- 따라서 서랍 face/inner처럼 translateZ로 앞으로 나오는 요소를 클릭 감지하려면 컨테이너가 아닌 face/inner 자체에 `data-equipment-id`/`data-click-target`을 부여하고 직접 hit-test 해야 한다.
- 컨테이너만 검사하면 열린 서랍의 시각 위치를 클릭해도 닫히지 않는다.

## 2026-04-07 — translateZ는 length 단위만 받음 → 부모 비율 동기화는 ResizeObserver
- CSS `translateZ()`는 `%`를 지원하지 않는다(길이 단위만). 따라서 "부모 박스 높이만큼 앞으로 나오게" 하려면 픽셀 값을 JS로 측정해야 한다.
- 컨테이너 div에 `useRef` + `useLayoutEffect` + `ResizeObserver`로 `offsetHeight`를 추적하고 `translateZ(${measuredH}px)`로 적용하면 부모 리사이즈/창 리사이즈 모두 자동 반영된다.
- 서랍의 경우 inner는 `rotateX(-90deg)`로 세워지므로 forward 깊이 = 컨테이너 픽셀 높이. face의 `openZ`도 동일 값을 써야 face가 inner 끝에 정확히 안착한다.
- 함수형 렌더 함수에는 hooks를 못 쓰므로 작은 컴포넌트로 분리해야 한다.

## Zustand / 상태관리
(아직 기록 없음)

## Supabase / DB
(아직 기록 없음)

## 빌드 / 타입
(아직 기록 없음)

## 기타
(아직 기록 없음)
