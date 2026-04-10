# 금지 사항

> 모든 작업에서 반드시 확인. 위반 시 실행/완료 보고 금지 — 먼저 수정.

---

## 코드 품질

- `// @ts-ignore` 사용 금지
- `as any` 사용 금지 → `unknown` + 타입 가드 사용
- `eslint-disable` 임의 사용 금지
- 기존 코드 스타일과 다른 패턴 도입 금지
- 사용자가 요청하지 않은 리팩토링 금지
- 확인 없이 패키지 설치/삭제 금지

## Zustand 상태관리

- Zustand 셀렉터에 인라인 `filter`/`map` 금지 (매 렌더 새 배열 → 무한 리렌더)
- 물리엔진(Zustand 스토어)에서 DB write 금지 (순수 로직만)

## CSS

- `display:none` 사용 금지 → `opacity`/`visibility`로 대체 (preserve-3d 깨짐 방지)
- CSS 변수 인라인 하드코딩 금지 → `src/styles/gameVariables.css`에 정의
- `overflow: hidden` + `transform-style: preserve-3d` 조합 금지

## CSS 3D 전용

- Three.js 등 3D 라이브러리 사용 금지
- `pointer-events` CSS로 3D 공간 클릭 감지 시도 금지 → `getBoundingClientRect` 사용
- 서랍 내부 판의 `rotateX(-90deg)` 애니메이션 금지 (고정값)

## 아키텍처

- `src/components/admin/` ↔ `src/components/game/` 간 import 금지 (상호 격리)
- 재료 인스턴스를 드래그 시작 시 생성 금지 → 드롭 성공 후에만 생성
- 장비 컴포넌트에 @dnd-kit `useDroppable`/`useDraggable` 미리 설정 금지
