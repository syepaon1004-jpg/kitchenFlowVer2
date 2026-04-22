Practice Site Re-Architecture Plan
작성일: 2026-04-15
상태: Draft v1
목적: 새 상위 사이트 추가, 메뉴 연습 모드 중심 재구성, 독립 레시피 엔진/고스트 가이드/암묵지 시스템 도입
원칙: 기존 sim 사이트의 관리자 탭과 인게임 로직은 유지하고, 새 practice 사이트는 별도 URL/별도 엔진으로 구축한다.

1. 대화 기준 확정 사항
현재 사이트의 메인은 더 이상 멀티주문 시뮬레이터가 아니고, 메뉴별 연습 모드가 메인이다.
현재 구현된 멀티주문 게임에는 step별 암묵지 기능을 넣지 않는다.
현재 구현된 관리자 탭과 인게임 코드는 유지한다. 다만 라우트와 상위 흐름은 재구성한다.
현실적으로는 기존 사이트 전체 URL을 한 단계 아래로 내리고, 그 위에 새 상위 사이트를 추가한다.
새 판별 기준은 plate_order가 아니라 recipe node다.
같은 재료가 레시피에 두 번 등장하면 반드시 서로 다른 recipe node다.
재료 노드는 번호와 위치 배열을 가진다.
액션 노드는 번호와 단일 위치를 가진다.
현재 판정 대상 액션은 볶기뿐이다. 이후 전자레인지 해동, 튀기기로 확장 가능해야 한다.
게임 시작 시 재료 노드의 현재 요구 위치는 위치 배열의 첫 값이다.
어떤 위치 L에서 시작 가능 최소 번호는 현재 요구 위치 == L인 미충족 노드들 중 가장 낮은 번호다.
액션 노드도 같은 위치 최소 번호 계산에 포함된다.
어떤 위치 L의 현재 요구 노드들이 모두 완료되면, 그 위치의 재료들은 다음 요구 위치로 전진한다.
다음 요구 위치는 항상 하나로 수렴한다.
붓기는 한 번의 이동이지만 목적지에서 연속 판정한다.
고스트 가이드는 이 엔진 상태를 읽어 다음 행동을 알려주는 기능이어야 한다.
암묵지는 각 step에 텍스트/이미지/동영상으로 붙을 수 있어야 한다.
2. 현행 Ground Truth 기준점
현재 라우트 구조는 src/router.tsx (line 13) 기준으로 /, /join, /join/avatar, /game/setup, /game, /feed, /admin이다.
현재 멀티주문 시작 흐름은 src/pages/AvatarSelectPage.tsx (line 366)와 src/pages/GameSetupPage.tsx (line 97)에 있다.
현재 주문 생성은 src/hooks/useOrderGenerator.ts (line 5) 기반 랜덤 멀티오더다.
현재 레시피 엔진은 src/lib/recipe/evaluate.ts (line 124) 기준 컨테이너 스냅샷 + plate_order 판정이다.
현재 런타임은 src/stores/gameStore.ts (line 111) 기준 current_plate_order를 증가시키는 구조다.
현재 관리자 레시피 편집은 src/components/admin/RecipeManager.tsx (line 49) 기준 recipe_ingredients + recipe_steps 중심이다.
3. 목표
새 상위 사이트를 추가하고, 메뉴 연습을 최상위 경험으로 만든다.
기존 sim 사이트는 /sim/* 아래로 재배치하고 "개발중" 맥락으로 노출한다.
practice 전용 레시피 엔진을 신설한다.
practice 세션에서 고스트 가이드를 제공한다.
practice step마다 암묵지 콘텐츠를 조회/표시한다.
practice 전용 관리자 authoring 화면을 만든다.
4. 비목표
기존 sim 게임 로직을 practice 엔진으로 개조하지 않는다.
기존 sim 관리자 탭에 암묵지/고스트 기능을 주입하지 않는다.
현재 단계에서 practice와 sim 레시피 데이터를 통합하지 않는다.
현재 단계에서 수량 판정 고도화는 핵심 우선순위가 아니다.
현재 단계에서 전자레인지/튀김기 액션 구현은 하지 않는다. 데이터 모델만 확장 가능하게 둔다.
5. 새 사이트 구조
/ : 새 상위 홈
/practice : 메뉴 연습 메인
/practice/menu/:menuId : 메뉴 상세, step 개요, 암묵지 미리보기
/practice/session/:sessionId : 실제 연습 화면
/practice/admin/* : practice 전용 관리자
/sim/* : 기존 사이트 전체 이관
기존 sim 페이지의 기능은 유지하되, 경로 문자열과 상위 진입점만 재배치한다.
sim 경로 이관 시 기존 인게임/관리자 로직 변경은 금지하고, 라우팅 rebasing과 링크 수정만 허용한다.
6. Practice 엔진 핵심 모델
PracticeMenu
PracticeRecipeNode
PracticeIngredientNode
PracticeActionNode
PracticeStepGroup
PracticeSession
PracticeIngredientInstance
PracticeNodeProgress
7. Practice 엔진 확정 규칙
재료 노드는 step_no, ingredient_id, location_path[], is_deco, quantity를 가진다.
액션 노드는 step_no, action_type, location을 가진다.
재료 인스턴스는 actual_location과 별도로 current_required_location 상태를 가진다.
같은 재료라도 서로 다른 recipe node에 바인딩될 수 있으므로 ingredient_id 기준 병합을 금지한다.
위치 L의 열린 번호는 current_required_location == L인 미충족 재료 노드와 location == L인 미충족 액션 노드의 최소 step_no로 계산한다.
재료 투입은 현재 요구 위치 일치와 열린 번호 일치를 동시에 만족해야 통과한다.
액션 수행도 위치 일치와 열린 번호 일치를 동시에 만족해야 통과한다.
같은 번호 그룹은 모두 채워질 때까지 열린 상태를 유지한다.
어떤 위치의 현재 요구 노드가 모두 완료되면, 그 위치 재료들의 current_required_location을 다음 배열 값으로 전진시킨다.
전진 후 실제 위치는 그대로일 수 있다. 이 상태가 붓기 가이드의 근거가 된다.
붓기 시에는 actual_location == S이고 current_required_location == D인 미완료 노드들을 모아 목적지 D에서 step_no 순으로 dry-run 판정 후 커밋한다.
소스 위치에 아직 current_required_location == S인 미완료 노드가 남아 있으면 붓기를 거절한다.
8. Ghost Guide 설계
고스트 가이드는 엔진이 계산한 "지금 가능한 합법 행동 집합"을 시각화하는 레이어다.
고스트 종류는 투입, 액션, 이동 3가지다.
투입 가이드는 재료 소스와 목적 위치를 동시에 강조한다.
액션 가이드는 장비 또는 액션 UI를 강조한다.
이동 가이드는 S -> D 화살표와 목적 위치 강조를 제공한다.
브랜치가 열려 있을 수 있으므로 "정답 1개만" 강제하지 않는다.
UI는 대표 추천 1개 + 지금 가능한 행동 목록 구조로 표시한다.
가이드 강도는 Full / Hint / Off 3단계로 둔다.
Full은 소스/목적지/문장/step 카드 자동 오픈을 모두 제공한다.
Hint는 핵심 문장과 목적지 강조만 제공한다.
Off는 판정 엔진은 유지하고 시각 가이드만 숨긴다.
9. 암묵지 설계
암묵지는 raw step_no에 직접 붙이지 않고 안정적인 step_group_id에 붙인다.
사용자에게는 여전히 N번 step으로 보이게 하되, 내부 키는 별도 ID로 유지한다.
StepGroup은 사용자에게 보이는 학습 단위다.
StepGroup은 동일한 visible step에 속하는 재료/액션 노드 묶음을 가진다.
StepGroup에는 title, summary, primary_location, display_step_no를 둔다.
암묵지 항목은 type, title, body, sort_order를 가진다.
암묵지 유형은 observe, adjust, warning, reason, media를 기본으로 한다.
미디어는 이미지/동영상 둘 다 지원한다.
반구조화 필드로 flame_level, color_note, viscosity_note, sound_note, texture_note, timing_note를 둔다.
practice 세션에서는 현재 열린 StepGroup의 암묵지를 우선 표시한다.
Step 완료 시 다음 StepGroup의 암묵지 미리보기를 노출한다.
10. Practice 관리자 설계
기존 sim 관리자와 분리된 /practice/admin/*를 신설한다.
편집 순서는 메뉴 생성 -> recipe node 편집 -> step group 편집 -> 암묵지 입력 -> 미디어 연결 -> 시뮬레이터 검증으로 둔다.
기존 RecipeManager는 sim용으로 남겨 두고 practice용 편집기는 신규 작성한다.
practice 편집기에서는 같은 재료 중복 노드 생성이 가능해야 한다.
practice 편집기에서는 위치 배열과 액션 노드를 직접 다룰 수 있어야 한다.
practice 편집기에는 ghost preview 또는 engine preview가 포함되어야 한다.
11. 구현 Phase
Phase 1: 라우트 재구성
완료 기준: 새 상위 홈이 생기고 기존 sim 흐름이 /sim/* 아래에서 동일하게 동작한다.
Phase 2: practice 도메인 모델/상태기계 도입
완료 기준: 재료 투입, 볶기, 붓기가 새 규칙으로 dry-run 판정 가능하다.
Phase 3: practice 세션 기본 UI
완료 기준: 메뉴 연습 화면에서 엔진 상태와 현재 step 진행을 확인할 수 있다.
Phase 4: ghost guide
완료 기준: 현재 가능한 행동 집합이 화면에 추천/목록 형태로 표시된다.
Phase 5: step 암묵지 조회/표시
완료 기준: 현재 열린 StepGroup의 텍스트/이미지/동영상 암묵지가 노출된다.
Phase 6: practice 관리자 authoring
완료 기준: 메뉴, node, step group, 암묵지를 등록/수정할 수 있다.
Phase 7: 통합 정리
완료 기준: 상위 홈, practice, sim이 혼선 없이 연결되고 "개발중" 라벨이 적용된다.
12. 구현 우선순위 메모
최우선은 URL 분리와 기존 sim 비침범이다.
그다음은 practice 엔진의 dry-run 판정 정확도다.
그다음은 ghost guide다.
암묵지 authoring은 practice 엔진과 StepGroup 모델이 안정화된 뒤 붙인다.
UI 미려함보다 엔진/플로우 정합성을 우선한다.
13. 검증 체크리스트
기존 sim의 /admin, /game/setup, /game, /feed 기능이 /sim/* 아래에서 동일하게 동작하는가
practice 엔진에서 같은 재료 중복 노드를 구분하는가
위치별 열린 최소 번호 계산이 예시 1, 예시 2를 재현하는가
액션 노드가 열린 번호 계산에 포함되는가
위치 phase 종료 후 current_required_location이 정확히 전진하는가
붓기 시 source 미완료 노드가 남아 있으면 차단되는가
붓기 시 목적지에서 연속 판정이 되는가
고스트 가이드가 합법 행동 집합만 보여주는가
StepGroup 암묵지가 현재 열린 step과 정확히 연결되는가
practice 데이터와 sim 데이터가 물리적으로 분리되어 있는가
14. 주요 리스크
기존 sim 코드가 절대 경로 navigate를 많이 사용하므로 /sim/* 이관 시 경로 rebasing 작업이 필요하다.
practice 엔진에서 ingredient_id 기준 병합을 허용하면 즉시 오판정이 발생한다.
붓기는 반드시 dry-run 후 커밋해야 하며, 즉시 이동 후 롤백 구조는 복잡도를 키운다.
StepGroup을 raw 번호에 직접 묶으면 나중에 순서 조정 시 암묵지 유지보수가 깨진다.
practice와 sim를 섞어 구현하면 현재 안정된 sim 흐름까지 훼손될 수 있다.
15. 보류 항목
수량 판정 세부 규칙
전자레인지/튀김기 액션의 실제 런타임 구현
practice 결과 리포트/피드 구조
tacit knowledge AI 보조 입력 여부
이 문서는 현재 대화에서 확정된 규칙과 기존 코드 ground truth를 함께 반영한 실행 계획서 초안이다.
다음 작업은 이 계획서를 기준으로 Phase 1 라우트 재구성부터 들어가는 것이다.
