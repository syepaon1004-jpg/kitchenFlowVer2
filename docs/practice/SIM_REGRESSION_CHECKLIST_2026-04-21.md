# Simulator Regression Checklist
작성일: 2026-04-21
상태: Working Draft v1
역할: shared shell 추출 및 practice 통합 작업 중 sim 의미 회귀를 막기 위한 검증 문서
상위 문서: `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`

## 1. 목적
이 문서는 `sim은 바뀌면 안 된다`를 실제 검증 항목으로 바꾸기 위한 체크리스트다.

## 2. 장비/물리 회귀
- 웍 온도 상승/하강 규칙이 동일한가
- burner level 조작이 동일한가
- stir hold 동작이 동일한가
- boil 누적 조건이 동일한가
- fry 누적 조건이 동일한가
- microwave tick 동작이 동일한가
- container mix tick 동작이 동일한가

## 3. 판별/거절 회귀
- plate_order 기반 거절이 동일한가
- wrong container 거절이 동일한가
- unexpected ingredient 거절이 동일한가
- dry-run rejection popup semantics가 동일한가

## 4. 주문/서빙 회귀
- order generator가 동일하게 동작하는가
- pending/in_progress 흐름이 동일한가
- serve 가능 조건이 동일한가
- multi-bowl serve 처리 의미가 동일한가

## 5. 점수/로그 회귀
- score event 발생 조건이 동일한가
- idle penalty가 동일한가
- wok_burned 등 action log 의미가 동일한가
- recipe result 저장 의미가 동일한가

## 6. UI/HUD 회귀
- 주방 렌더링 위치감이 동일한가
- selection/handbar 흐름이 동일한가
- minimap/navigation이 동일한가
- quantity modal 동작이 동일한가
- 기존 sim rejection popup이 동일한가

## 7. 관리자/피드 회귀
- sim admin authoring 흐름이 동일한가
- feed 연결이 동일한가

## 8. 승인 기준
아래가 모두 참이어야 sim 회귀 없음으로 본다.

- 장비/물리 항목 통과
- 판별/거절 항목 통과
- 주문/서빙 항목 통과
- 점수/로그 항목 통과
- UI/HUD 항목 통과
- 관리자/피드 항목 통과

## 9. 골든 시나리오 샘플
### 9.1 기본 주문 1건 처리
입력:
- 시뮬레이터 세션 시작
- 주문 1건 생성
- 레시피 순서대로 재료 배치
- 최종 서빙

기대:
- order status 흐름이 기존과 동일
- plate_order 기반 판정이 동일
- serve 가능 시점이 동일
- score/log 반영이 동일

### 9.2 장비 시간 경과 시나리오
입력:
- 웍 가열
- stir hold 수행
- microwave 동작

기대:
- 온도/상태 tick 결과가 동일
- action history 누적이 동일
- 관련 score/log semantics가 동일
