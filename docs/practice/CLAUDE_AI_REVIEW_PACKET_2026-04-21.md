# Claude AI Review Packet
작성일: 2026-04-21
용도: Claude AI에게 붙여넣어 현재 계획서 세트의 부족한 부분을 검토받기 위한 패킷
주의: 이 파일은 Claude Code용 지시서가 아니라 `Claude AI 검토용` 이다
리뷰 라운드: Round 4

## 0. 역할 경계
Claude AI의 역할은 `방향 제시자` 가 아니라 `격리된 제3자 검토자` 다.

이번 검토에서 Claude AI가 해야 할 일:
1. 문서 간 모순 찾기
2. 구현 시 혼란이 생길 표현 찾기
3. Claude Code가 실행계획서를 쓸 때 해석 분기가 생길 부분 찾기
4. 누락된 인터페이스/반환값/상태 전이 규칙 찾기

이번 검토에서 Claude AI가 하지 말아야 할 일:
1. 제품 방향을 재설정하는 것
2. 상위 제품 전략을 다시 제안하는 것
3. `같은 주방`, `같은 장비 컴포넌트`, `같은 물리/틱 엔진 공유` 방향 자체를 뒤집는 것
4. `위치별 open_step` 철학을 다른 철학으로 교체 제안하는 것

즉 Claude AI는 `방향성의 옳고 그름` 을 판정하지 말고, `고정된 방향이 문서에 충분히 명확히 쓰였는가` 만 검토해야 한다.

## 1. 검토 대상 문서
- `docs/practice/MASTER_IMPLEMENTATION_PLAN_2026-04-21.md`
- `docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md`
- `docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md`
- `docs/practice/CURRENT_CODE_INVENTORY_2026-04-21.md`
- `docs/practice/SIM_REGRESSION_CHECKLIST_2026-04-21.md`

## 2. 이번 라운드에서 반영한 수정 사항
이전 Claude AI 리뷰에서 지적된 아래 항목 중 방향성과 충돌하지 않는 부분만 반영했다.

1. `open_step(L)` 반환 타입을 `number | null` 로 고정
2. 재료/액션 노드 초기 상태 규칙 명시
3. 물리 `IngredientInstance` 모델 추가
4. `LocationKey` 와 `LocationRef` 분리
5. legal action 사전 열거 함수 추가
6. `open_step_group_ids` / `primary_open_step_group_id` 규칙 추가
7. `Rules Adapter` 인터페이스 문서화
8. shared store vs mode-specific store 분할표 추가
9. sim 회귀 체크리스트 문서 추가
10. 예시 1의 `open_step(serving.bowl.main) = 6` 을 숫자로 명시
11. 예시 1의 조리 흐름 절을 `권장 조리 흐름 예시` 로 분리
12. `LocationKey -> LocationRef` 매핑 규칙 추가
13. 재료의 `선택 상태` 와 `물리 인스턴스 상태` 를 구분해 최초 등장 시점 명시
14. `pending_transfer_payloads` 계산 규칙 추가
15. Rules Adapter 보조 타입 스케치 추가
16. `onRuntimeTick()` 계약 추가
17. sim 회귀 체크리스트에 골든 시나리오 샘플 추가
18. `is_deco` 를 v1 legal gating에서 완전 제외하지 않고, `deco-first 차단 규칙` 으로 사용하도록 반영
19. 예시 1, 2에 deco 규칙의 영향 설명 추가

## 3. Claude AI에게 전달할 배경
KitchenFlow는 현재 멀티주문 시뮬레이터가 구현되어 있는 프로젝트다.
이 프로젝트에 메뉴연습 모드를 추가하려고 한다.

중요한 조건은 아래와 같다.
1. 메뉴연습과 시뮬레이터는 `같은 주방` 을 공유한다
2. 같은 주방을 공유한다는 말은 `주방 화면` 만이 아니라 `장비 컴포넌트` 와 `물리/틱 기반 작동엔진` 까지 공유한다는 뜻이다
3. 다른 것은 `메뉴 판별엔진`, `practice admin`, `고스트 가이드`, `step 암묵지 레이어` 다
4. 메뉴연습은 같은 주방에서 플레이되며, 고스트 가이드와 step별 암묵지가 붙는다
5. 기존 sim의 멀티주문 의미와 동작은 회귀되면 안 된다
6. practice 엔진은 recipe node 기반이며, plate_order 기반이 아니다
7. v1 formal spec은 `위치별 current_required_location 기반 open_step` 규칙을 고정 방향으로 채택한다
8. 이번 검토는 이 방향을 바꿀지 말지 논의하는 자리가 아니다

## 4. Claude AI 검토 프롬프트
아래 문서 세트를 하나의 설계 패키지로 보고 검토해줘.

목표는 단순 요약이 아니다.
이 문서 세트가 실제 구현 에이전트가 `실행계획서` 를 만들 수 있을 정도로 충분히 명확한지 평가해줘.

특히 아래를 중점적으로 봐줘.
1. 메뉴연습 판별엔진 설명이 구현 가능한 수준으로 충분히 기계적인가
2. `같은 주방`, `같은 장비 컴포넌트`, `같은 물리/틱 엔진 공유`가 구현 관점에서 충분히 명확한가
3. 고스트 가이드와 step 암묵지가 엔진 상태에 충분히 단단하게 연결되어 있는가
4. sim 불가침 범위와 sim 회귀 검증 목록이 충분히 명확한가
5. practice admin이 sim admin과 혼동되지 않도록 충분히 분리되어 있는가
6. 이 문서 세트만으로 Claude Code 같은 구현 에이전트가 오해 없이 실행계획서를 만들 수 있을 정도인가

중요:
- 제품 방향 자체를 다시 제안하지 말아줘
- 이미 고정된 방향이 `문서에 구현 가능하게 써졌는지` 만 검토해줘
- 대안 철학 제안보다 `모순, 누락, 해석 분기` 를 우선 지적해줘

출력은 아래 형식으로 해줘.
1. 이번 라운드에서 좋아진 점
2. 아직 남은 애매함
3. 실행계획서 전에 반드시 더 고정해야 할 것
4. 지금 이 수준이면 Claude Code가 실행계획서를 써도 되는지에 대한 판정

## 5. 이번 라운드에서 특히 다시 검토받고 싶은 질문
1. `deco-first 차단 규칙` 이 예시 1의 garnish 문제를 해결하면서 예시 2와 충돌하지 않는가
2. `LocationKey` / `LocationRef` 이중 모델이 같은 주방 shared shell과 잘 맞는가
3. `open_step(L) = number | null` 규격과 후속 처리 방식이 충분히 닫혔는가
4. 물리 `IngredientInstance` 와 recipe node 바인딩 규칙이 충분히 안전한가
5. legal action 사전 열거 함수와 ghost guide 연결이 충분히 명확한가
6. shared shell appendix의 Rules Adapter 인터페이스와 보조 타입 스케치가 실행계획서 수준으로 충분한가
7. sim regression checklist의 골든 시나리오 샘플이 최소 기준으로 충분한가

## 6. 이번 라운드의 검토 초점
이번 라운드의 초점은 아래 넷이다.
1. deco-first 차단 규칙이 현재 엔진 철학과 모순 없이 붙었는가
2. 예시 1의 garnish 해석이 이제 원래 의도와 더 가깝게 닫혔는가
3. engine <-> shared shell 접점 타입이 실행계획서 단계로 갈 만큼 닫혔는가
4. sim 회귀 체크리스트가 최소한의 실행 기준을 갖추었는가

## 7. 기대 결과
Claude AI가 아래 중 하나를 판정해주면 된다.
1. 지금 문서 세트로 실행계획서 작성에 들어가도 된다
2. 실행계획서 전에 엔진 규격을 한 번 더 닫아야 한다
3. 실행계획서 전에 공용 주방 shell 경계를 한 번 더 닫아야 한다
4. 실행계획서 전에 deco-first 규칙 관련 일부 문장을 더 정리해야 한다
5. 아직 부족하다
