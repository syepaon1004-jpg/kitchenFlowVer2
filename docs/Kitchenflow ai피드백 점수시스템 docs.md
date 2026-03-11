# KitchenFlow — AI 피드백 + 점수 시스템 구현 지침서 (Claude Code용)

> **이 문서는 Claude Code가 구현 시 반드시 참조해야 하는 지침서다.**
> 계획서(`KitchenFlow_AI피드백_점수시스템_계획서.md`)의 설계를 기반으로,
> 구현 단계에서 지켜야 할 규칙과 패턴을 정의한다.

---

## 1. 절대 규칙 (기존 + 이번 패치 추가분)

### 기존 절대 원칙 (변경 없음)

1. 물리엔진 클라이언트 전용 — Zustand에서만 계산, 세션 중 DB write 금지
2. 히트박스 좌표 비율값(0~1) — px 저장 금지
3. navigate FK 참조 — UUID만
4. 재료 상태는 action_history 판별 — 별도 status 컬럼 금지
5. 그릇 묶음은 assigned_order_id
6. equipment는 컴포넌트 배치
7. 슬라이드 클램프는 img.offsetWidth 기준
8. 히트박스 렌더링은 SVG
9. 레시피 판별은 src/lib/recipe/ 순수 함수로만
10. 어드민/게임 컴포넌트 공유 금지
11. any 타입 금지, 하드코딩 금지, gen_random_uuid()
12. 파일 읽기 전 수정 금지

### 이번 패치 추가 규칙

13. **로그/점수 데이터도 Zustand 축적 → 세션 종료 시 1회만 DB write** (원칙 1 확장)
14. **점수 상수는 src/lib/scoring/constants.ts에서만 정의** — 컴포넌트에 매직넘버 금지
15. **evaluateContainer 하위 호환 유지** — 기존 isComplete 로직이 깨지면 안 됨
16. **plate_order 단위 판별** — 전체 레시피 기준이 아닌 현재 plate_order까지만 검증
17. **한 공백 구간에서 감점은 최대 1회** — 5초 감점 후 10초 도달 시 10초 감점으로 대체 (중복 아님)
18. **연속 navigate 카운트는 다른 액션 타입이 끼면 리셋**

---

## 2. 점수 상수 정의

```typescript
// src/lib/scoring/constants.ts
// 이 파일의 값만 변경하면 전체 점수 체계가 바뀌어야 한다.
// 다른 파일에 점수 값을 하드코딩하지 마라.

export const SCORE_CONFIG = {
  INITIAL_SCORE: 80,

  // 서빙 시간 점수
  FAST_SERVE: +1,
  SLOW_SERVE: -1,
  VERY_SLOW_SERVE: -2,

  // 조리 실수
  DISPOSE: -2,
  WOK_BURNED: -1,

  // 효율성
  SHORT_IDLE: -1,
  LONG_IDLE: -2,
  REDUNDANT_NAV: -1,

  // 시간 기준 (ms)
  FAST_SERVE_THRESHOLD: 5 * 60 * 1000,
  SLOW_SERVE_THRESHOLD: 7 * 60 * 1000,
  VERY_SLOW_SERVE_THRESHOLD: 10 * 60 * 1000,
  SHORT_IDLE_THRESHOLD: 5 * 1000,
  LONG_IDLE_THRESHOLD: 10 * 1000,

  // 연속 navigate 횟수
  REDUNDANT_NAV_COUNT: 3,
} as const;
```

---

## 3. plate_order 단위 판별 로직 (핵심)

### 판별 타이밍

재료가 그릇에 담길 때마다 (plate_order가 할당될 때마다) 실행.
기존 evaluateContainer 호출 위치에서 동일하게 트리거.

### 판별 알고리즘

```
입력:
  currentMaxPlateOrder — 그릇 내 재료 중 가장 높은 plate_order
  containerIngredients — 그릇 안 전체 재료 인스턴스
  recipeIngredients    — 해당 레시피의 recipe_ingredients 전체

처리:
  1. expectedByNow = recipeIngredients.filter(r => r.plate_order <= currentMaxPlateOrder)

  2. 불필요한 재료 검사 (즉시 감지 가능):
     containerIngredients 중 ingredient_id가 recipeIngredients 어디에도 없는 것
     → 'unexpected_ingredient' 오류

  3. plate_order 불일치 검사 (즉시 감지 가능):
     containerIngredients에서 ingredient_id는 레시피에 있지만,
     해당 재료의 recipe 상 plate_order가 currentMaxPlateOrder보다 큰 경우
     (아직 넣으면 안 되는 재료가 먼저 들어온 경우)
     → 'plate_order_mismatch' 오류

  4. 누락 재료 검사 (현재 plate_order까지만):
     expectedByNow 중 containerIngredients에 없는 것
     → 'missing_ingredient' 오류

  5. 수량 검사:
     매칭된 재료의 quantity가 tolerance 범위 밖
     → 'quantity_error' 오류

  6. 조리 시간 검사:
     매칭된 재료의 action_history에서 required_action_type의 seconds가
     duration_min 미달 → 'action_insufficient'
     duration_max 초과 → 'action_excessive'

  7. 그릇 타입 검사:
     container_id !== recipe.target_container_id
     → 'wrong_container' 오류

  8. 전체 완성 검사 (기존 로직):
     모든 recipeIngredients가 매칭되고 오류 0개
     → isComplete = true

반환:
  RecipeEvaluationResult { isComplete, errors, checkedUpToPlateOrder }
```

### 주의: 같은 plate_order 그룹

plate_order가 동일한 재료는 동시 투입으로 간주된다.
예: plate_order 2에 양파와 양배추가 있으면, 양파만 넣고 양배추를 안 넣은 상태에서
plate_order 2 기준 판별이 실행된다. 이때 양배추는 '누락'이 된다.

→ 이 경우 아직 양배추를 넣을 수 있으므로, **같은 plate_order 그룹 내에서의 누락은
해당 plate_order의 모든 재료가 들어올 기회를 준 후에만 판별해야 한다.**

구현 방법: plate_order N의 재료가 하나라도 들어오면, 같은 plate_order N의 나머지 재료는
"아직 대기 중"으로 간주. plate_order N+1 재료가 들어오는 시점에 비로소
plate_order N의 누락을 확정한다.

---

## 4. 공백(idle) 감지 로직

```
scoringStore에서 관리:
  lastActionTimestamp: number
  idlePenaltyApplied: boolean    — 현재 공백 구간에서 감점 적용 여부
  idlePenaltyLevel: 0 | 1 | 2   — 0: 없음, 1: 5초 적용, 2: 10초 적용

useGameTick에서 매초:
  now = Date.now()
  idleMs = now - lastActionTimestamp

  if idleMs >= LONG_IDLE_THRESHOLD && idlePenaltyLevel < 2:
    → LONG_IDLE 감점 적용
    → idlePenaltyLevel = 2
    → 만약 idlePenaltyLevel이 1이었다면 SHORT_IDLE 점수를 취소하고 LONG_IDLE로 대체

  else if idleMs >= SHORT_IDLE_THRESHOLD && idlePenaltyLevel < 1:
    → SHORT_IDLE 감점 적용
    → idlePenaltyLevel = 1

새 액션 로그 추가 시:
  lastActionTimestamp = Date.now()
  idlePenaltyLevel = 0
```

**5초 후 -1 적용, 이후 10초 도달 시 -1을 취소하고 -2로 교체.**
결과적으로 한 공백 구간에서 최종 감점은 하나만 남는다.

---

## 5. 연속 navigate 감지 로직

```
scoringStore에서 관리:
  consecutiveNavCount: number
  lastNavZoneId: string | null

addActionLog 호출 시:
  if action_type === 'navigate_open':
    if lastNavZoneId === metadata.zone_id:
      consecutiveNavCount++
    else:
      consecutiveNavCount = 1
      lastNavZoneId = metadata.zone_id

    if consecutiveNavCount === REDUNDANT_NAV_COUNT:
      → REDUNDANT_NAV 감점 (1회만)
      // consecutiveNavCount가 4, 5, 6...이 되어도 추가 감점 없음
      // 리셋 후 다시 3 도달 시에만 추가 감점

  else:
    // navigate가 아닌 다른 액션 → 카운트 리셋
    consecutiveNavCount = 0
    lastNavZoneId = null
```

---

## 6. 서빙 시간 점수 계산

```
서빙 실행 시:
  serveTimestamp = Date.now()
  orderCreatedAt = game_orders.created_at (ISO 문자열 → ms 변환)
  servingTimeMs = serveTimestamp - orderCreatedAt

  if servingTimeMs <= FAST_SERVE_THRESHOLD:
    → FAST_SERVE 가산 (+1)
  else if servingTimeMs > VERY_SLOW_SERVE_THRESHOLD:
    → VERY_SLOW_SERVE 감점 (-2)
  else if servingTimeMs > SLOW_SERVE_THRESHOLD:
    → SLOW_SERVE 감점 (-1)
  // 5분~7분 사이는 가감 없음
```

---

## 7. 세션 종료 시 DB 저장 순서

```
1. game_action_logs — 액션 로그 전체 INSERT (batch)
2. game_score_events — 점수 이벤트 전체 INSERT (batch)
3. game_recipe_errors — 레시피 오류 전체 INSERT (batch)
4. game_recipe_results — 레시피별 결과 INSERT (batch)
5. game_sessions — score 컬럼 UPDATE (currentScore)
6. game_orders — completed_at UPDATE (서빙된 주문들)
7. 기존 저장 로직 (ingredient_instances, container_instances 등)
8. generate-feedback Edge Function 호출 → game_ai_feedbacks INSERT

각 단계 실패 시 다음 단계는 계속 진행 (부분 성공 허용).
전체 실패해도 세션 자체는 종료 처리.
```

---

## 8. Edge Function: generate-feedback

### 배포

```bash
supabase functions deploy generate-feedback --no-verify-jwt
```

### 프롬프트 구조

```
시스템 프롬프트:
  당신은 주방 시뮬레이터 훈련 코치입니다.
  직원의 게임 플레이 데이터를 분석하여 한국어로 피드백을 제공합니다.
  잘한 점과 개선할 점을 구분하여 구체적으로 설명합니다.
  격려하는 톤을 유지합니다.

유저 프롬프트:
  ## 게임 결과
  총점: {score}점

  ## 점수 이벤트
  {score_events를 사람이 읽을 수 있는 형태로 정리}

  ## 레시피 오류
  {recipe_errors를 메뉴명 + 오류 내용으로 정리}

  ## 서빙 시간
  {각 메뉴별 소요 시간}

  ## 효율성
  - 5초 이상 공백: {count}회
  - 10초 이상 공백: {count}회
  - 불필요한 냉장고 열기: {count}회

  위 데이터를 기반으로 종합 피드백을 작성해 주세요.
```

### 응답 파싱

```typescript
const data = await response.json();
const feedbackText = data.content[0].text;
```

---

## 9. 내 피드 페이지 데이터 쿼리

### 점수 그래프 (게임 단위)

```sql
SELECT id, score, started_at
FROM game_sessions
WHERE user_id = $1 AND store_id = $2 AND score IS NOT NULL
ORDER BY started_at DESC
LIMIT 30
```

### 점수 그래프 (일 단위)

```sql
SELECT DATE(started_at) as date, AVG(score) as avg_score, COUNT(*) as game_count
FROM game_sessions
WHERE user_id = $1 AND store_id = $2 AND score IS NOT NULL
GROUP BY DATE(started_at)
ORDER BY date DESC
LIMIT 30
```

### 약한 메뉴

```sql
SELECT r.name, r.category, COUNT(e.id) as error_count
FROM game_recipe_errors e
JOIN recipes r ON e.recipe_id = r.id
JOIN game_sessions s ON e.session_id = s.id
WHERE s.user_id = $1 AND s.store_id = $2
GROUP BY r.id, r.name, r.category
ORDER BY error_count DESC
LIMIT 10
```

### 숙달된 메뉴

```sql
SELECT DISTINCT r.name, r.category
FROM game_recipe_results res
JOIN recipes r ON res.recipe_id = r.id
JOIN game_sessions s ON res.session_id = s.id
WHERE s.user_id = $1 AND s.store_id = $2
  AND res.is_success = true
  AND res.recipe_id NOT IN (
    SELECT e.recipe_id FROM game_recipe_errors e
    JOIN game_sessions s2 ON e.session_id = s2.id
    WHERE s2.user_id = $1 AND s2.store_id = $2
      AND s2.started_at > NOW() - INTERVAL '7 days'
  )
```

### 카테고리별 성과

```sql
SELECT r.category, AVG(res.error_count) as avg_errors,
       COUNT(CASE WHEN res.is_success THEN 1 END)::float / COUNT(*) as success_rate
FROM game_recipe_results res
JOIN recipes r ON res.recipe_id = r.id
JOIN game_sessions s ON res.session_id = s.id
WHERE s.user_id = $1 AND s.store_id = $2
GROUP BY r.category
ORDER BY success_rate ASC
```

---

## 10. 자주 틀리는 패턴 (금지 목록 추가분)

| 패턴 | 이유 | 대안 |
|------|------|------|
| 액션 로그를 매번 DB에 INSERT | 성능 파괴, 원칙 1 위반 | Zustand 축적 → 세션 종료 시 일괄 |
| 점수 상수를 컴포넌트에 하드코딩 | 변경 시 산재 | constants.ts에서 import |
| 5초 감점 후 10초 감점 중복 적용 | 한 구간에서 최대 1회 | idlePenaltyLevel로 관리 |
| plate_order N 재료 하나만 넣고 누락 판정 | 같은 group 재료가 더 들어올 수 있음 | N+1 진입 시에만 N 누락 확정 |
| evaluateContainer 기존 반환값 제거 | 기존 호출부 깨짐 | isComplete 필드 유지 |
| generate-feedback에서 --no-verify-jwt 누락 | 게이트웨이 401 | 배포 시 반드시 포함 |
| apikey 헤더 누락 | Edge Function 호출 실패 | Authorization + apikey 두 헤더 필수 |

---

## 11. 버리기(Dispose) 처리 로직

```
버리기 버튼 클릭 시:
  1. 그릇 내 모든 재료 인스턴스 → location_type = 'disposed'
  2. container_instance 삭제 (gameStore에서 제거)
  3. 해당 container_instance의 assigned_order_id가 있으면:
     → 해당 주문의 다른 그릇이 남아있는지 확인
     → 남아있지 않으면 game_orders.status = 'failed'
  4. 감점 이벤트: SCORE_DISPOSE (-2)
  5. 액션 로그: { action_type: 'dispose', metadata: { container_instance_id, order_id } }
```

**그릇은 재사용되지 않는다. 버리기 = 그릇 + 재료 전부 제거.**

---

## 12. 게임 자동 종료 로직

```
게임 시작 시:
  /game/setup에서 활성화할 메뉴를 설정 → game_sessions.active_recipe_ids

매 서빙(serve) 또는 버리기(dispose) 후:
  allOrders = gameStore.orders
  allDone = allOrders.every(o => o.status === 'completed' || o.status === 'failed')

  if allDone:
    → 세션 종료 플로우 자동 시작
    1. Zustand 데이터 → DB 일괄 저장
    2. generate-feedback Edge Function 호출
    3. 결과 화면 표시 (점수 + AI 피드백)
```

**game_orders.status 값:**
- 'pending': 주문 접수됨, 조리 미시작
- 'in_progress': 그릇 배정됨, 조리 중
- 'completed': 정상 서빙 완료
- 'failed': 재료 버리기로 완성 불가

---

## 13. 확정된 설계 결정 (변경 불가)

| 항목 | 결정 |
|------|------|
| 버리기 후 그릇 | 그릇도 함께 제거. 재사용 없음 |
| 게임 종료 | 모든 주문 completed/failed 시 자동 종료 |
| 점수 상수 | constants.ts 하드코딩 고정. 어드민 설정 UI 없음 |

---

_구현 지침서 작성 완료_