# KitchenFlow Master Implementation Plan
작성일: 2026-04-21
상태: Authoritative Draft v3
역할: KitchenFlow의 상위 제품 구조, 공용 주방 구조, 메뉴연습 판별엔진 방향, 고스트 가이드, step 암묵지, practice admin의 최종 기준을 고정하는 마스터 계획서
대체 문서: `docs/practice/REARCHITECTURE_PLAN_2026-04-15.md`

## 1. 목적
KitchenFlow의 메인 경험은 `메뉴연습`이다.
기존 멀티주문 시뮬레이터는 유지되지만, 상위 제품 구조 안에서는 서브 경험으로 재배치된다.
이번 재구성의 핵심 목표는 `같은 주방을 공유하는 두 모드`를 만드는 것이다.

두 모드의 차이는 `주방 자체`가 아니라 아래에 있다.

- 레시피 판별엔진
- 세션 목적
- HUD/오버레이 내용
- 고스트 가이드
- step 암묵지
- 관리자 authoring 모델

## 2. 이번 문서가 바로잡는 핵심 오해
- 메뉴연습은 별도 텍스트 앱이 아니다.
- 메뉴연습은 시뮬레이터와 `같은 주방 플레이 표면`에서 진행된다.
- 메뉴연습은 시뮬레이터와 `같은 주방 장비 컴포넌트`를 공유한다.
- 메뉴연습은 시뮬레이터와 `같은 물리/틱 기반 작동엔진`을 공유한다.
- 분리되는 것은 `메뉴 판별엔진`, `practice admin`, `고스트/암묵지 레이어`, `메뉴연습 전용 세션 상태`다.
- 현재의 `/practice/session` 텍스트 중심 UI는 과도기 산출물이며 최종형이 아니다.

## 3. 최상위 원칙
- 로그인, 매장 선택, 사용자 선택 흐름이 제품의 가장 앞단이다.
- 시뮬레이터와 메뉴연습은 `같은 주방 장면`, `같은 장비`, `같은 이동`, `같은 선택`, `같은 핸드바`, `같은 붓기/배치 감각`을 공유한다.
- 시뮬레이터와 메뉴연습은 `같은 장비 컴포넌트`를 공유한다.
- 시뮬레이터와 메뉴연습은 `같은 장비 물리/틱 엔진`을 공유한다.
- 시뮬레이터와 메뉴연습은 `같은 레시피 판별엔진`을 공유하지 않는다.
- sim은 기존 멀티주문 엔진을 유지한다.
- practice는 recipe node 기반 메뉴연습 엔진을 별도로 가진다.
- sim admin과 practice admin은 분리한다.
- 현재 구현되어 있는 시뮬레이터의 의미와 결과는 회귀 없이 유지되어야 한다.
- 미래에 두 엔진을 통합할 가능성은 열어 두되, 이번 작업의 목표는 `공용 주방 + 분리된 rules adapter` 구조를 만드는 것이다.

## 4. 공용 주방의 범위
`같은 주방을 공유한다`는 말은 아래 범위를 모두 포함한다.

1. 주방 장면 렌더링
2. 장비 위치와 배치
3. 장비 컴포넌트
4. 장비별 상호작용 UI
5. 씬 클릭 해석
6. 이동과 섹션 전환
7. 핸드바와 선택 상태
8. 컨테이너 배치와 붓기
9. 장비 상태 tick
10. 혼합/가열/세척 등 시간 경과 처리

즉 메뉴연습은 시뮬레이터와 다른 장비 화면을 새로 만들지 않는다.
메뉴연습은 `같은 주방 런타임 위에 다른 판별기와 학습 레이어를 얹는 모드`다.

## 5. 현재 코드 기준 Ground Truth
현재 코드 기준으로 공용 주방 후보는 이미 존재한다.

- `src/pages/GamePage.tsx`
- `src/components/game/GameKitchenView.tsx`
- `src/components/equipment/WokComponent.tsx`
- `src/stores/equipmentStore.ts`
- `src/hooks/useGameTick.ts`

이중 특히 중요한 사실은 아래다.

- `GameKitchenView` 는 현재 주방 장면과 장비 상호작용 표면이다.
- `WokComponent` 같은 장비 컴포넌트는 현재 sim 장비 UI의 실체다.
- `useEquipmentStore` 는 장비 상태와 장비별 tick 로직을 가진다.
- `useGameTick` 은 현재 전체 주방의 1초 tick 루프다.

따라서 실행계획은 `다른 practice 주방을 만드는 것`이 아니라, `이 공용 주방 경계를 sim 전용 규칙과 분리하는 것`이어야 한다.

## 6. sim 불가침 범위
아래 항목은 practice 작업 중 의미가 바뀌면 안 된다.

1. 멀티주문 생성 규칙
2. plate_order 기반 판별 의미
3. 서빙 가능 조건
4. 점수 계산 의미
5. sim admin의 기존 authoring 흐름
6. feed 연결 흐름
7. 현재 장비 물리 동작 의미

허용되는 변경은 아래다.

1. 공용 주방 shell 추출
2. 공용 HUD/오버레이 경계 정리
3. rules adapter 경계 분리
4. practice 전용 오버레이 추가

금지되는 변경은 아래다.

1. sim의 plate_order 판별을 practice 규칙으로 대체하는 것
2. sim의 주문 생성/서빙/점수 의미를 practice 흐름에 맞춰 수정하는 것
3. sim admin에 practice authoring을 섞는 것
4. practice 구현 때문에 sim 장비 작동 방식이 변하는 것

구체 검증 목록은 별도 문서로 관리한다.

- `docs/practice/SIM_REGRESSION_CHECKLIST_2026-04-21.md`

## 7. 최종 제품 구조
- `/` 는 상위 진입점이다.
- 로그인 전에는 인증 진입점 역할을 한다.
- 로그인 후에는 매장 선택과 모드 선택으로 이어지는 상위 허브 역할을 한다.
- `/sim/*` 는 기존 시뮬레이터 전체를 유지한다.
- `/practice` 는 선택된 매장의 메뉴연습 메인이다.
- `/practice/menu/:menuId` 는 메뉴 소개, step 개요, 암묵지 미리보기, 연습 시작 진입점이다.
- `/practice/session/:sessionId` 는 `같은 주방 기반 메뉴연습 플레이 화면`이다.
- `/practice/admin/*` 는 practice 전용 관리자다.

## 8. 사용자 플로우
기본 진입 순서는 아래를 원칙으로 한다.

1. 로그인
2. 매장 선택
3. 모드 선택
4. 사용자 선택 또는 관리자 권한 확인
5. 실제 화면 진입

모드별 흐름은 아래와 같다.

### 8.1 시뮬레이터
로그인 -> 매장 선택 -> 시뮬레이터 선택 -> 사용자 선택 -> 게임 설정 -> 멀티주문 플레이

### 8.2 메뉴연습
로그인 -> 매장 선택 -> 메뉴연습 선택 -> 사용자 선택 -> 메뉴 목록 -> 메뉴 상세 -> 같은 주방에서 연습 플레이

### 8.3 연습 관리자
로그인 -> 매장 선택 -> 메뉴연습 선택 -> 관리자 권한 확인 -> practice admin 진입

금지사항은 아래와 같다.

- 로그인 전에 시뮬레이터/메뉴연습을 먼저 고르게 하지 않는다
- selectedStore 없이 practice browse를 허용하지 않는다
- selectedUser 없이 practice session을 시작하지 않는다
- populated 상태에서 메뉴 생성/수정 진입 CTA를 숨기지 않는다

## 9. 공용 주방 Shell 계약
공용 주방 shell은 아래를 포함한다.

1. 주방 장면 렌더링
2. 장비 렌더링과 장비별 상호작용
3. 섹션 이동과 미니맵
4. 선택 상태 표시
5. 핸드바
6. 수량 입력 등 공통 입력 보조
7. 컨테이너 배치와 내용물 표면화
8. 씬 클릭 해석
9. 공통 HUD 앵커
10. 모드별 오버레이 삽입 슬롯

현재 용어는 아래처럼 고정한다.

- 메인 주방 뷰포트
- 좌상단 HUD 묶음
- 우측 플로팅 HUD
- 장면 오버레이
- 모드 패널 슬롯

`좌측/우측 사이드 패널`이라는 표현은 현재 코드 구조와 맞지 않으므로 사용하지 않는다.

공용 shell과 mode adapter의 인터페이스는 별도 문서에서 정의한다.

- `docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md`

## 10. 장비 컴포넌트와 물리/틱 엔진 계약
이번 계획에서 반드시 명시해야 하는 사실은 아래다.

### 10.1 공용 장비 컴포넌트
menu practice는 sim과 동일한 장비 컴포넌트를 재사용해야 한다.

예:
- 웍 컴포넌트
- 싱크 관련 상호작용
- 버너 조작
- 바스켓/전자레인지 등 시간 기반 장비 UI

즉 practice 전용 웍 UI를 따로 만들지 않는다.
필요한 것은 장비 위에 덧씌우는 `가이드/암묵지 오버레이`이며, 장비 본체는 공용이다.

### 10.2 공용 물리/시간 경과 엔진
menu practice는 sim과 동일한 장비 작동엔진을 재사용해야 한다.

예:
- 웍 온도 변화
- burner level 변화 반영
- stir 시간 누적
- boil 누적
- fry 누적
- microwave 남은 시간 감소
- container mix tick

즉 practice 전용 물리엔진을 따로 만들지 않는다.
공용 물리엔진은 동일하게 돌고, practice는 그 위에서 `이 행동이 레시피상 허용되는가`만 별도 rules adapter로 판정한다.

### 10.3 분리되는 경계
공용인 것:
- 장비 상태 변화
- 시간 경과
- 장비별 누적 action history
- 실제 씬 상호작용 결과

분리되는 것:
- 레시피 판별 기준
- 거절 사유 생성
- 현재 열린 step 계산
- 고스트 가이드 계산
- step 암묵지 노출

한 줄로 정리하면 아래와 같다.

`장비는 같이 움직이고, 물리는 같이 돈다. 무엇이 정답 행동인지는 mode별 판별기가 다르게 본다.`

## 11. 시뮬레이터 계약
- 기존 멀티주문 엔진은 유지한다.
- 기존 plate_order 기반 판별은 sim에서만 유지한다.
- 기존 주문 생성, 서빙, 점수, 피드 연결 방식은 유지한다.
- sim 쪽 변경은 공용 주방 shell 추출, 라우트 정리, 공통 UI 경계 정리 수준으로 제한한다.
- sim의 장비 컴포넌트와 장비 물리엔진은 의미상 회귀 없이 유지한다.

## 12. 메뉴연습 계약
메뉴연습은 `하나의 메뉴를 같은 주방에서 반복 연습하는 모드`다.
멀티주문 큐는 없고, 대신 현재 step, 가능한 행동, 고스트 가이드, 암묵지, 진행 상태, 거절 사유가 전면에 나온다.

메뉴연습의 핵심은 아래 네 가지다.

1. recipe node 기반 판별엔진
2. 같은 주방에서의 연습 플레이
3. step group 기반 암묵지 노출
4. 합법 행동 집합 기반 고스트 가이드

## 13. 메뉴연습 엔진 및 런타임 계약
메뉴연습 엔진의 상세 규격은 별도 부록 문서에서 정의한다.

- `docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md`

마스터 계획서에서 고정하는 최소 원칙은 아래다.

1. 판별 단위는 `recipe node` 다
2. 재료 인스턴스는 공용 주방 runtime의 물리 인스턴스를 사용한다
3. `actual_location` 과 `current_required_location` 은 분리된다
4. 열린 번호 `open_step(L)` 는 `number | null` 을 반환한다
5. legal action은 `시도 판정` 과 별도로 `사전 열거 함수` 를 통해 계산한다
6. 재료 투입은 `현재 요구 위치 일치 + 열린 번호 일치` 를 동시에 만족해야 한다
7. 액션도 같은 방식으로 열린 번호를 소비한다
8. 위치 phase가 닫히면 재료의 `current_required_location` 이 다음 위치로 전진한다
9. 붓기는 한 번의 이동이지만 목적지에서 연속 판정한다
10. quantity는 v1 legal gating에 직접 쓰지 않으며, is_deco는 `deco-first 차단 규칙`에만 사용한다
11. 고스트 가이드는 엔진이 계산한 합법 행동 집합만 시각화한다
12. step 암묵지는 현재 열린 step group 기준으로 노출한다

## 14. 고스트 가이드 계약
고스트 가이드는 새 규칙을 만드는 기능이 아니라 `엔진이 계산한 합법 행동 집합`을 시각화하는 기능이다.

종류는 아래 세 가지다.

1. 투입 가이드
2. 액션 가이드
3. 이동 가이드

원칙은 아래와 같다.

- 대표 추천 1개를 보여준다
- 동시에 가능한 합법 행동 목록도 보여준다
- branch가 열려 있을 때 정답 1개만 강제하지 않는다
- Full / Hint / Off 강도를 지원한다
- 장비 컴포넌트 자체를 바꾸지 않고, 공용 장비 위에 시각 레이어를 얹는다

강도 매트릭스와 추천 규칙은 shared shell appendix에서 정의한다.

## 15. step 암묵지 계약
암묵지는 `recipe node` 에 직접 붙이지 않고 `step group` 에 붙인다.

이유는 아래와 같다.

- 같은 번호에 여러 node가 묶일 수 있다
- 사용자에게는 N번 step으로 보여주되
- 내부적으로는 안정적인 `step_group_id` 가 유지보수에 유리하다

권장 타입은 아래와 같다.

- observe
- adjust
- warning
- reason
- media

세션 노출 원칙은 아래와 같다.

- 현재 열린 step group의 암묵지를 우선 노출한다
- 다음 step group의 암묵지는 미리보기로 제한한다
- 암묵지는 별도 문서 페이지가 아니라 같은 주방 플레이 화면 위의 학습 패널로 노출한다

## 16. Practice Admin 계약
practice admin은 sim admin과 완전히 분리한다.
이유는 practice가 편집해야 하는 모델이 다르기 때문이다.

기본 작업 순서는 아래와 같다.

1. 메뉴 생성/수정
2. 위치 정의
3. 재료 노드/액션 노드 편집
4. location path 편집
5. step group 편집
6. step group과 node 연결
7. 암묵지 입력
8. 이미지/영상 연결
9. 엔진 검증
10. 같은 주방 기반 연습 검증

practice admin의 엔진 검증은 아래를 포함해야 한다.

- orphan node 검사
- unreachable step 검사
- location path 일관성 검사
- 동일 step_no tie-breaker 일관성 검사
- legal action dry-run 검사

## 17. 주석 및 경계 표시 정책
추후 sim/practice 엔진 통합 가능성을 고려해 아래 정책을 따른다.

허용되는 주석:
- 공용 주방 shell 경계 설명
- sim 전용 rules adapter 경계 설명
- practice 전용 rules adapter 경계 설명
- 고스트 가이드가 legal actions만 읽는다는 계약 설명
- 암묵지가 step_group 기준이라는 계약 설명

허용되지 않는 주석:
- 막연한 `나중에 통합`
- 구조를 대신하는 장문의 TODO
- 실제 규칙이 코드에는 없고 주석에만 존재하는 상태
- 임시 회피를 감추는 설명

원칙은 아래와 같다.

- 먼저 구조를 나눈다
- 다음으로 경계 주석을 붙인다
- 주석은 미래 희망이 아니라 현재 계약을 설명해야 한다

## 18. 보조 문서 세트
실행계획서는 아래 문서들이 채워진 뒤 작성한다.

1. `docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md`
2. `docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md`
3. `docs/practice/CURRENT_CODE_INVENTORY_2026-04-21.md`
4. `docs/practice/SIM_REGRESSION_CHECKLIST_2026-04-21.md`
5. `docs/practice/CLAUDE_AI_REVIEW_PACKET_2026-04-21.md`

## 19. 비목표
- sim의 멀티주문 엔진을 practice 엔진으로 교체하지 않는다
- sim admin에 practice authoring을 섞지 않는다
- 메뉴연습을 별도 텍스트 학습 앱으로 축소 해석하지 않는다
- 현재의 `/practice/session` 텍스트형 화면을 최종 UX로 고정하지 않는다
- 공용 주방 shell을 포기하고 practice 전용 주방 UI를 새로 만들지 않는다
- practice 때문에 장비 컴포넌트나 장비 물리엔진을 복제하지 않는다

## 20. 승인 체크리스트
- 메뉴연습과 시뮬레이터가 같은 주방 shell을 공유하는가
- 메뉴연습과 시뮬레이터가 같은 장비 컴포넌트를 공유하는가
- 메뉴연습과 시뮬레이터가 같은 장비 물리/틱 엔진을 공유하는가
- practice는 별도 판별엔진을 사용하는가
- practice admin이 별도로 존재하는가
- Rules Adapter 인터페이스가 명시되었는가
- shared store와 mode-specific store의 분할이 정리되었는가
- login -> store -> user 흐름이 앞단에 고정되는가
- practice session이 selectedStore와 selectedUser를 전제로 시작되는가
- populated 상태에서도 메뉴 추가/수정 동선이 살아있는가
- 고스트 가이드가 합법 행동 집합만 반영하는가
- step별 암묵지가 같은 플레이 화면에서 노출되는가
- sim 멀티주문 동작이 회귀 없이 유지되는가
- sim 회귀 체크리스트가 별도 문서로 존재하는가
- 현재의 텍스트형 practice session UI가 최종형으로 남지 않는가

## 21. 최종 한 줄 정의
KitchenFlow의 메뉴연습은 `시뮬레이터와 같은 주방, 같은 장비 컴포넌트, 같은 물리/틱 엔진을 공유하는 학습 모드`이며, 분리되는 것은 `판별엔진`, `practice admin`, 그리고 그 위에 올라가는 `고스트 가이드/step 암묵지 레이어`다.
