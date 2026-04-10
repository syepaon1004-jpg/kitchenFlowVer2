# CSS 3D + 패널 시스템 + 장비 규칙

> CSS 3D / 패널 / 장비 관련 작업 시 반드시 읽는다.

---

## CSS 3D 체크리스트

- transform 순서: `translateZ` → `rotateX` (순서 뒤바뀌면 시각 결과 완전히 다름)
- `transform-style: preserve-3d` 체인이 모든 조상에서 유지되는지 확인
- `overflow: hidden`은 preserve-3d를 깨뜨린다 — 사용 금지
- `display:none`은 preserve-3d를 깨뜨린다 — opacity/visibility로 대체
- hit-test: `getBoundingClientRect()` 사용. `pointer-events` CSS로 3D 공간 클릭 감지 금지
- `translateZ()`는 `%` 미지원 — 부모 비율 동기화는 ResizeObserver + px
- 3D hit-test는 face 요소에서 직접 (컨테이너가 아닌 translateZ로 이동한 요소)

---

## 패널 시스템 규칙

### 패널 구조
- 패널 수: **3장 고정**. 추가/삭제 코드 작성 금지.
- 화구: **패널 2에만** 배치 가능. 다른 패널 배치 허용 코드 금지.
- 패널 접기: CSS `perspective` + `rotateX`만. div 부모-자식 구조, 하단 기준 회전.
- 애니메이션: **0.6초** CSS transition.

### 패널 가시성
- 편집 모드: 패널 보임
- 미리보기/인게임: 패널 DOM 유지 + 시각적 투명 (`display:none` 사용 금지, `opacity`/`visibility`로 처리)
- 폴드 냉장고 내부 패널 2장: 모든 모드에서 보임 (흰색)

---

## 장비 규칙

### 공통
- 장비는 패널 위의 **2D 면**. 독립 3D 오브젝트가 아님.
- Three.js 등 3D 라이브러리 사용 금지.

### 서랍
- 3레이어 구조: 컨테이너 > 내부 판(inner) + face
- 열림은 `translateZ`만 변화
- 내부 판의 `rotateX(-90deg)`는 **애니메이션 금지** (고정값)
- face/inner에 `data-equipment-id`/`data-click-target` 부여 → 직접 hit-test

### 폴드 냉장고
- 내부: 2패널, 가운데 기준 `rotateX(90deg)`
- 재료는 bottom 기준 `rotateX(-90deg)` 역회전
- 내부 패널: 흰색 판

### 바구니
- 패널 2 수평 보정 필수 → `getBasketCorrection` 함수 참조

### 화구 (웍)
- UI상 웍 그래픽 없음. **화구 자체가 장비**.

### 홀로그램
- 편집 모드에서 생성 금지. 미리보기/인게임에서만 자동 생성.
- 흰색 반투명 사각형.

### 외형
- 서랍, 폴드 냉장고: 은색 철판 + 까만색 손잡이
- 폴드 냉장고 내부 패널: 흰색 판
- 홀로그램: 흰색 반투명 사각형

---

## 게임 인터랙션 (현재 상태)

- 장비 컴포넌트에 @dnd-kit `useDroppable`/`useDraggable`을 미리 설정하지 않는다
- 게임 인터랙션 방식은 클릭/터치 선택 방식으로 전환 예정
