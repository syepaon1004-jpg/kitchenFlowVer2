# KitchenFlow — AI 피드백 + 점수 시스템 + 액션 로그 계획서

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드, DB 스키마, 타입 정의를 직접 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 사용자/Claude Code 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — npm run build 오류 없음 + 기능 동작 검증
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일을 수정하는 것
- 파일 경로, 변수명, 함수명을 추정으로 하드코딩 지시하는 것
- 버그 발생 시 표면적 증상만 패치하는 것. 반드시 근본 원인을 분석하여 해결

**지휘관의 한계 인식:**
- 지휘관(Claude AI)은 최신 코드를 직접 볼 수 없다
- 모든 구현 결정 전에 Claude Code에게 관련 파일을 읽고 보고하도록 지시해야 한다

---

## 1. 기능 전체 개요

이번 패치는 5개의 하위 시스템으로 구성된다.

```
┌─────────────────────────────────────────────────────────┐
│                    게임 플레이 중                          │
│                                                         │
│  [A] 액션 로그 ──────── 모든 사용자 행동을 시간순 기록      │
│  [B] 레시피 검수 ─────── plate_order 단위로 오류 즉시 감지  │
│  [C] 점수 계산 ──────── 80점 시작, 이벤트별 가감           │
│                                                         │
│  → 전부 Zustand 메모리 축적                               │
├─────────────────────────────────────────────────────────┤
│                    게임 종료 시                            │
│                                                         │
│  [D] AI 피드백 ──────── 로그+점수 → Edge Function → 피드백 │
│  → DB 일괄 저장                                          │
├─────────────────────────────────────────────────────────┤
│                    게임 밖                                │
│                                                         │
│  [E] 내 피드 페이지 ──── 점수 그래프, 약한/숙달 메뉴, 카테고리│
│  → /feed 라우트 (AvatarSelectPage에서 진입)               │
└─────────────────────────────────────────────────────────┘
```

---

## 2. [A] 액션 로그 시스템

### 2-1. 기록 대상 액션

| 액션 타입 | 트리거 시점 | metadata에 포함할 정보 |
|-----------|-----------|----------------------|
| `navigate_open` | navigate 히트박스 클릭 시 | zone_id, zone_label |
| `drag_start` | onDragStart 시 | drag_source_type, ingredient_id 또는 container_id |
| `drop_success` | onDragEnd 드롭 성공 시 | drop_target_id, ingredient_id, quantity |
| `stir_start` | 볶기 버튼 홀드 시작 | equipment_id |
| `stir_end` | 볶기 버튼 홀드 종료 | equipment_id, duration_seconds |
| `basket_down` | 튀김채 내리기 버튼 | equipment_id |
| `basket_up` | 튀김채 올리기 버튼 | equipment_id |
| `serve` | 서빙 실행 | order_id, recipe_id |
| `dispose` | 재료 버리기 실행 | container_instance_id, reason |
| `wok_burned` | 웍 burned 상태 전이 시 | equipment_id |

### 2-2. 로그 데이터 구조 (런타임, Zustand)

```typescript
interface ActionLog {
  id: string;                    // crypto.randomUUID()
  timestamp: number;             // Date.now() — ms 단위
  action_type: ActionLogType;    // 위 표의 액션 타입 union
  metadata: Record<string, unknown>; // 액션별 추가 정보
}
```

### 2-3. 저장 위치

- **게임 중**: Zustand store에 `actionLogs: ActionLog[]` 배열로 축적
- **세션 종료 시**: DB `game_action_logs` 테이블에 일괄 INSERT

### 2-4. 연속 navigate 감지 로직

```
액션 로그 배열에서 navigate_open만 필터:
  직전 navigate_open과 같은 zone_id → consecutiveCount++
  직전 navigate_open과 다른 zone_id → consecutiveCount = 1
  직전 액션이 navigate_open이 아님 → consecutiveCount = 1

  consecutiveCount >= 3 → 감점 이벤트 발생 (1회만, 이후 연속 시 추가 감점 없음)
  consecutiveCount가 리셋되면 다시 카운트 시작
```

---

## 3. [B] 레시피 검수 시스템

### 3-1. 핵심 설계: plate_order 단위 판별

**기존 판별:**
- 전체 recipe_ingredients와 그릇 내 재료를 1:1 비교
- 전부 맞으면 is_complete = true
- 오류 내역 없음

**변경 후 판별:**
- plate_order가 올라갈 때마다 (재료가 그릇에 담길 때마다) 판별 실행
- 현재 plate_order까지 있어야 하는 재료 목록을 기준으로 검증
- 오류가 발견되면 오류 목록을 반환하고 기록

### 3-2. 판별 로직 상세

```
입력:
  currentPlateOrder: number     — 방금 담긴 재료의 plate_order
  containerIngredients: []      — 그릇 안 전체 재료 인스턴스
  recipeIngredients: []         — 레시피 정의 전체

판별 기준 (currentPlateOrder까지만 검증):

  expectedIngredients = recipeIngredients.filter(r => r.plate_order <= currentPlateOrder)

  1. 누락 재료 검사:
     expectedIngredients 중 containerIngredients에 없는 것
     → RecipeError: { type: 'missing_ingredient', ingredient_id, plate_order }

  2. 불필요한 재료 검사:
     containerIngredients 중 expectedIngredients에 ingredient_id가 없는 것
     → RecipeError: { type: 'unexpected_ingredient', ingredient_id }

  3. 수량 오차 검사:
     매칭된 재료의 quantity가 tolerance 범위 밖
     → RecipeError: { type: 'quantity_error', ingredient_id, expected, actual, tolerance }

  4. 조리 시간 검사:
     매칭된 재료의 action_history에서 required_action_type의 seconds가 duration_min 미달
     → RecipeError: { type: 'action_insufficient', ingredient_id, action_type, expected_min, actual }
     required_duration_max 초과 시:
     → RecipeError: { type: 'action_excessive', ingredient_id, action_type, expected_max, actual }

  5. plate_order 불일치 검사:
     재료의 actual plate_order가 recipe 정의의 plate_order와 다른 경우
     → RecipeError: { type: 'plate_order_mismatch', ingredient_id, expected_order, actual_order }

  6. 그릇 타입 검사 (1회만, 첫 판별 시):
     container_id !== recipe.target_container_id
     → RecipeError: { type: 'wrong_container', expected_container, actual_container }
```

### 3-3. 반환 구조

```typescript
interface RecipeEvaluationResult {
  isComplete: boolean;           // 전체 레시피 충족 여부 (기존 로직)
  errors: RecipeError[];         // 오류 목록 (빈 배열 = 정상)
  checkedUpToPlateOrder: number; // 몇 번째 plate_order까지 검증했는지
}

interface RecipeError {
  type: RecipeErrorType;
  ingredient_id?: string;
  details: Record<string, unknown>; // 오류별 상세 (expected, actual 등)
}

type RecipeErrorType =
  | 'missing_ingredient'
  | 'unexpected_ingredient'
  | 'quantity_error'
  | 'action_insufficient'
  | 'action_excessive'
  | 'plate_order_mismatch'
  | 'wrong_container';
```

### 3-4. 오류 발생 시 UI 동작

1. 오류가 감지되면 ContainerCard에 "잘못 조리됨" 표시 (빨간 배지 등)
2. 배지 클릭 → 팝업 표시:
   - 오류 목록 (어떤 재료가 어떻게 틀렸는지)
   - "버리기" 버튼
3. "버리기" 클릭 → 그릇 내 재료 전부 location_type = 'disposed'
   - 감점 이벤트 발생 (-2)
   - 그릇도 함께 제거 (container_instance 삭제, assigned_order_id 해제)
   - 액션 로그에 `dispose` 기록

### 3-5. 기존 evaluateContainer와의 관계

기존 함수를 **확장**한다. 삭제하지 않는다.

```
기존: evaluateContainer → boolean (is_complete)
확장: evaluateContainer → RecipeEvaluationResult { isComplete, errors, checkedUpToPlateOrder }

기존 is_complete 로직은 errors.length === 0 && 전체 재료 매칭 완료일 때 true.
기존 호출부에서 isComplete만 사용하던 곳은 그대로 동작.
신규 기능에서 errors를 활용.
```

**원칙 10 준수**: 판별 로직은 src/lib/recipe/ 순수 함수로만 구현. UI 로직 분리.

---

## 4. [C] 점수 계산 시스템

### 4-1. 기본 규칙

- **시작 점수: 80점**
- 게임 중 이벤트 발생 시 가감
- 최소 0점 (음수 방지)
- 최대 제한 없음

### 4-2. 점수 이벤트 테이블

| 이벤트 | 조건 | 점수 | 상수명 |
|--------|------|------|--------|
| 빠른 서빙 | 주문~서빙 5분 이내 | +1 | SCORE_FAST_SERVE |
| 느린 서빙 | 주문~서빙 7분 초과 | -1 | SCORE_SLOW_SERVE |
| 매우 느린 서빙 | 주문~서빙 10분 초과 | -2 | SCORE_VERY_SLOW_SERVE |
| 재료 버리기 | 잘못된 조리로 버리기 실행 | -2 | SCORE_DISPOSE |
| 웍 타버림 | wok_status → burned | -1 | SCORE_WOK_BURNED |
| 짧은 공백 | 액션 로그 5초+ 공백 | -1 | SCORE_SHORT_IDLE |
| 긴 공백 | 액션 로그 10초+ 공백 | -2 | SCORE_LONG_IDLE |
| 불필요한 동선 | 같은 navigate 연속 3회+ | -1 | SCORE_REDUNDANT_NAV |

### 4-3. 공백 감지 로직

```
useGameTick (1초 루프)에서:
  현재 시간 - 마지막 액션 로그 timestamp = idleSeconds

  idleSeconds >= 10 → SCORE_LONG_IDLE 감점 (1회만, 이후 idleSeconds 리셋)
  idleSeconds >= 5 (10 미만) → SCORE_SHORT_IDLE 감점 (1회만)

  새 액션 로그가 추가되면 idle 카운터 리셋
```

**주의**: 5초 감점 후 계속 대기하여 10초 도달 시, 10초 감점만 적용 (5초 감점은 중복 적용하지 않음). 즉 한 공백 구간에서 최대 1회 감점.

### 4-4. 서빙 시간 계산

```
서빙 시간 = serve 시점(액션 로그 timestamp) - game_orders.created_at

판별 기준:
  servingTime <= 5분 → +1
  5분 < servingTime <= 7분 → 0 (감점 없음)
  7분 < servingTime <= 10분 → -1
  servingTime > 10분 → -2
```

**game_orders.created_at 타이밍**: 빌지큐에서 주문이 들어오는 시점.

### 4-5. 점수 데이터 구조 (런타임)

```typescript
interface ScoreEvent {
  id: string;
  timestamp: number;
  event_type: ScoreEventType;
  points: number;              // +1, -1, -2 등
  metadata: Record<string, unknown>; // 관련 order_id, equipment_id 등
}

// Zustand store
scoreEvents: ScoreEvent[];
currentScore: number;           // 80에서 시작, 이벤트마다 갱신
```

### 4-6. 점수 상수 관리

```typescript
// src/lib/scoring/constants.ts
export const SCORE_CONFIG = {
  INITIAL_SCORE: 80,
  FAST_SERVE: +1,           // 5분 이내
  SLOW_SERVE: -1,           // 7분 초과
  VERY_SLOW_SERVE: -2,      // 10분 초과
  DISPOSE: -2,              // 재료 버리기
  WOK_BURNED: -1,           // 웍 타버림
  SHORT_IDLE: -1,           // 5초+ 공백
  LONG_IDLE: -2,            // 10초+ 공백
  REDUNDANT_NAV: -1,        // 같은 navigate 연속 3회+

  // 시간 기준 (ms)
  FAST_SERVE_THRESHOLD: 5 * 60 * 1000,
  SLOW_SERVE_THRESHOLD: 7 * 60 * 1000,
  VERY_SLOW_SERVE_THRESHOLD: 10 * 60 * 1000,
  SHORT_IDLE_THRESHOLD: 5 * 1000,
  LONG_IDLE_THRESHOLD: 10 * 1000,
  REDUNDANT_NAV_COUNT: 3,
} as const;
```

---

## 5. [D] AI 피드백 시스템

### 5-1. 트리거

게임 종료(세션 종료) 시, DB 저장 완료 후 자동 호출.

### 5-2. Edge Function: generate-feedback

기존 analyze-recipe와 동일한 패턴.

```
URL: /functions/v1/generate-feedback
메서드: POST
인증: Authorization: Bearer {access_token}, apikey: {anon_key}

요청 body:
{
  session_id: string,
  score: number,
  score_events: ScoreEvent[],
  recipe_errors: RecipeErrorRecord[],
  action_log_summary: {
    total_actions: number,
    idle_count_5s: number,
    idle_count_10s: number,
    redundant_nav_count: number,
    avg_serve_time_ms: number,
    recipes_completed: string[],    // recipe names
    recipes_failed: string[],       // recipe names with errors
  },
  serving_times: { recipe_name: string, time_ms: number }[]
}

응답:
{
  feedback: string              // AI가 생성한 한국어 종합 피드백 텍스트
}
```

### 5-3. AI 프롬프트 설계 방향

- 잘한 점 / 개선할 점 구분
- 구체적 메뉴명과 오류 내용 언급
- 동선 효율성 코멘트
- 조리 속도 코멘트
- 격려 포함 (훈련 도구이므로)
- 한국어로 생성

### 5-4. 피드백 표시

세션 종료 후 결과 화면:
- 총점 표시
- 점수 이벤트 목록 (가감 내역)
- AI 피드백 텍스트
- "내 피드 보기" 버튼 → /feed 이동

---

## 6. [E] 내 피드 페이지

### 6-1. 라우트

```
/feed → FeedPage (requireAuth + requireStore + requireUser)
```

진입점: /join/avatar 페이지에 [내 피드] 버튼 추가.

### 6-2. 페이지 구성

```
┌────────────────────────────────────────┐
│  ← 뒤로          내 피드         매장명  │  헤더
├────────────────────────────────────────┤
│                                        │
│  📊 점수 추이 그래프                     │  게임 단위 + 일 단위 토글
│  ┌────────────────────────────────┐    │
│  │  (꺾은선 그래프)                │    │
│  └────────────────────────────────┘    │
│                                        │
│  🔴 내가 약한 메뉴                      │  오류 빈도 기반 정렬
│  │ 1. 순두부찌개 (오류 5회)             │
│  │ 2. 비빔밥 (오류 3회)                │
│                                        │
│  🟢 숙달된 메뉴                         │  최근 N회 오류 0
│  │ 1. 계란볶음밥                       │
│  │ 2. 된장찌개                         │
│                                        │
│  📁 카테고리별 성과                      │  recipes.category 기반
│  │ 볶음류: 평균 85점                    │
│  │ 탕류: 평균 72점                     │
│  │ 튀김류: 평균 90점                    │
│                                        │
└────────────────────────────────────────┘
```

### 6-3. 데이터 소스

| 표시 항목 | 데이터 소스 |
|-----------|-----------|
| 점수 그래프 (게임 단위) | game_sessions.score + started_at |
| 점수 그래프 (일 단위) | game_sessions를 날짜별 GROUP BY → AVG(score) |
| 약한 메뉴 | game_recipe_errors를 recipe_id별 COUNT → 상위 N개 |
| 숙달된 메뉴 | 최근 게임에서 오류 0인 recipe → recipe name |
| 카테고리별 성과 | game_sessions + game_scores_by_recipe JOIN recipes.category → 카테고리별 AVG |

### 6-4. 카테고리별 성과를 위한 추가 데이터

게임 종료 시 **레시피별 점수**도 기록해야 카테고리별 분석이 가능하다.
game_scores_by_recipe 테이블 또는 game_recipe_results 테이블이 필요하다. (DB 섹션에서 정의)

---

## 7. DB 변경

### 7-1. 신규 테이블

#### game_action_logs

```sql
CREATE TABLE game_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  timestamp_ms bigint NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  CHECK (action_type IN (
    'navigate_open', 'drag_start', 'drop_success',
    'stir_start', 'stir_end',
    'basket_down', 'basket_up',
    'serve', 'dispose', 'wok_burned'
  ))
);

CREATE INDEX idx_game_action_logs_session ON game_action_logs(session_id);
```

#### game_score_events

```sql
CREATE TABLE game_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  points integer NOT NULL,
  timestamp_ms bigint NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,

  CHECK (event_type IN (
    'fast_serve', 'slow_serve', 'very_slow_serve',
    'dispose', 'wok_burned',
    'short_idle', 'long_idle',
    'redundant_nav'
  ))
);

CREATE INDEX idx_game_score_events_session ON game_score_events(session_id);
```

#### game_recipe_errors

```sql
CREATE TABLE game_recipe_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES game_orders(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id),
  error_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  timestamp_ms bigint NOT NULL,

  CHECK (error_type IN (
    'missing_ingredient', 'unexpected_ingredient',
    'quantity_error', 'action_insufficient', 'action_excessive',
    'plate_order_mismatch', 'wrong_container'
  ))
);

CREATE INDEX idx_game_recipe_errors_session ON game_recipe_errors(session_id);
CREATE INDEX idx_game_recipe_errors_recipe ON game_recipe_errors(recipe_id);
```

#### game_recipe_results

레시피별 성과 기록 (카테고리별 분석, 약한/숙달 메뉴 산출용).

```sql
CREATE TABLE game_recipe_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES game_orders(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id),
  is_success boolean NOT NULL DEFAULT false,
  error_count integer NOT NULL DEFAULT 0,
  serve_time_ms bigint,           -- 주문~서빙 소요 시간 (ms), null이면 미서빙
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_game_recipe_results_session ON game_recipe_results(session_id);
CREATE INDEX idx_game_recipe_results_recipe ON game_recipe_results(recipe_id);
```

#### game_ai_feedbacks

```sql
CREATE TABLE game_ai_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  feedback_text text NOT NULL,
  created_at timestamptz DEFAULT now(),

  UNIQUE(session_id)
);
```

### 7-2. 기존 테이블 변경

#### game_orders — completed_at 추가 + status에 'failed' 추가

```sql
ALTER TABLE game_orders
ADD COLUMN completed_at timestamptz DEFAULT NULL;
```

서빙 시간 = completed_at - created_at.

```sql
-- game_orders.status CHECK constraint 수정: 'failed' 추가
-- 현재 constraint 이름을 pg_constraint에서 먼저 확인할 것
-- 기존: 'pending' | 'in_progress' | 'completed'
-- 변경: 'pending' | 'in_progress' | 'completed' | 'failed'
```

**failed 상태**: 재료를 버려서 해당 주문을 완성할 수 없게 된 경우.
게임 자동 종료 조건: 모든 game_orders가 'completed' 또는 'failed' 상태.

### 7-3. RLS 정책

모든 신규 테이블에 RLS 활성화. 현재 개발 단계에서는 dev_all 정책 적용 (기존 패턴과 동일).
프로덕션 전환 시 session_id 소유자 기반으로 변경.

```sql
-- 각 테이블에 대해
ALTER TABLE game_action_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY dev_all ON game_action_logs FOR ALL USING (true) WITH CHECK (true);

-- game_score_events, game_recipe_errors, game_recipe_results, game_ai_feedbacks 동일
```

---

## 8. TypeScript 타입 변경

### 8-1. src/types/db.ts 추가

```typescript
// 액션 로그 타입
export type ActionLogType =
  | 'navigate_open' | 'drag_start' | 'drop_success'
  | 'stir_start' | 'stir_end'
  | 'basket_down' | 'basket_up'
  | 'serve' | 'dispose' | 'wok_burned';

export interface GameActionLog {
  id: string;
  session_id: string;
  action_type: ActionLogType;
  timestamp_ms: number;
  metadata: Record<string, unknown>;
}

// 점수 이벤트 타입
export type ScoreEventType =
  | 'fast_serve' | 'slow_serve' | 'very_slow_serve'
  | 'dispose' | 'wok_burned'
  | 'short_idle' | 'long_idle'
  | 'redundant_nav';

export interface GameScoreEvent {
  id: string;
  session_id: string;
  event_type: ScoreEventType;
  points: number;
  timestamp_ms: number;
  metadata: Record<string, unknown>;
}

// 레시피 오류 타입
export type RecipeErrorType =
  | 'missing_ingredient' | 'unexpected_ingredient'
  | 'quantity_error' | 'action_insufficient' | 'action_excessive'
  | 'plate_order_mismatch' | 'wrong_container';

export interface GameRecipeError {
  id: string;
  session_id: string;
  order_id: string;
  recipe_id: string;
  error_type: RecipeErrorType;
  details: Record<string, unknown>;
  timestamp_ms: number;
}

// 레시피별 결과
export interface GameRecipeResult {
  id: string;
  session_id: string;
  order_id: string;
  recipe_id: string;
  is_success: boolean;
  error_count: number;
  serve_time_ms: number | null;
  created_at: string;
}

// AI 피드백
export interface GameAiFeedback {
  id: string;
  session_id: string;
  feedback_text: string;
  created_at: string;
}

// GameOrder 변경사항:
//   status: 'pending' | 'in_progress' | 'completed' | 'failed'  (failed 추가)
//   completed_at: string | null;  (신규 필드)
```

### 8-2. src/types/game.ts 추가

```typescript
// 레시피 평가 결과 (순수 함수 반환값)
export interface RecipeEvaluationResult {
  isComplete: boolean;
  errors: RecipeError[];
  checkedUpToPlateOrder: number;
}

export interface RecipeError {
  type: RecipeErrorType;
  ingredient_id?: string;
  details: Record<string, unknown>;
}
```

---

## 9. Zustand 스토어 변경

### 9-1. 신규 스토어: scoringStore.ts

```
scoringStore:
  // 상태
  actionLogs: ActionLog[]
  scoreEvents: ScoreEvent[]
  recipeErrors: RecipeError[]       (DB 저장용 전체 오류 기록)
  recipeResults: RecipeResult[]     (레시피별 성과)
  currentScore: number              (80 시작)
  lastActionTimestamp: number       (공백 감지용)
  consecutiveNavCount: number       (연속 navigate 카운트)
  lastNavZoneId: string | null      (직전 navigate zone_id)
  idlePenaltyApplied: boolean       (현재 공백 구간에서 감점 적용 여부)

  // 액션
  addActionLog(log)                 — 로그 추가 + 연속 navigate 체크 + idle 리셋
  addScoreEvent(event)              — 점수 이벤트 추가 + currentScore 갱신
  addRecipeError(error)             — 레시피 오류 기록
  addRecipeResult(result)           — 레시피별 결과 기록
  checkIdlePenalty(now)             — 1초 tick에서 호출, 공백 감점 판별
  resetForNewSession()              — 세션 시작 시 초기화
  getSessionData()                  — 세션 종료 시 DB 저장용 데이터 반환
```

### 9-2. 기존 스토어 변경

**gameStore.ts:**
- 기존 서빙 처리 시 completed_at 기록 추가
- 기존 서빙 처리 시 서빙 시간 기반 점수 이벤트 발생

**equipmentStore.ts:**
- 웍 burned 상태 전이 시 scoringStore.addScoreEvent 호출 + 액션 로그 기록

---

## 10. 기존 코드 변경 범위

### 10-1. src/lib/recipe/evaluate.ts

반환 타입 확장. 기존 boolean → RecipeEvaluationResult.
기존 호출부 호환성 유지 (isComplete 필드).

### 10-2. src/hooks/useRecipeEval.ts

evaluate 결과에서 errors가 있으면 scoringStore에 기록.
ContainerCard에 오류 상태 전달.

### 10-3. src/hooks/useGameTick.ts

매 tick에서 scoringStore.checkIdlePenalty(Date.now()) 호출.

### 10-4. GamePage.tsx — onDragStart, onDragEnd

액션 로그 기록 추가 (drag_start, drop_success).

### 10-5. LeftSidebar.tsx 또는 navigate 처리부

navigate_open 액션 로그 기록 추가.

### 10-6. WokComponent.tsx

stir_start, stir_end 액션 로그 기록 추가.

### 10-7. FryingBasketComponent.tsx

basket_down, basket_up 액션 로그 기록 추가.

### 10-8. RightSidebar.tsx 또는 ContainerCard

오류 표시 UI + 버리기 팝업 추가.
서빙 시 completed_at + 점수 이벤트 추가.

### 10-9. 세션 종료 로직

기존 DB 저장에 신규 테이블 데이터 추가.
AI 피드백 Edge Function 호출.
결과 화면 표시.

### 10-10. 라우터

/feed 라우트 추가.

### 10-11. AvatarSelectPage.tsx

[내 피드] 버튼 추가.

---

## 11. 신규 파일 목록 (예상)

```
src/
├── lib/
│   └── scoring/
│       ├── constants.ts          # 점수 상수
│       └── idle.ts               # 공백 감지 순수 함수
├── stores/
│   └── scoringStore.ts           # 점수/로그/오류 스토어
├── components/
│   ├── game/
│   │   └── RecipeErrorPopup.tsx  # 오류 내역 + 버리기 팝업
│   └── feed/
│       ├── ScoreChart.tsx        # 점수 추이 그래프
│       ├── WeakMenuList.tsx      # 약한 메뉴 목록
│       ├── MasteredMenuList.tsx  # 숙달된 메뉴 목록
│       └── CategoryStats.tsx    # 카테고리별 성과
├── pages/
│   ├── FeedPage.tsx              # 내 피드 페이지
│   ├── FeedPage.module.css
│   └── SessionResultPage.tsx     # 세션 종료 결과 화면 (또는 모달)
└── supabase/
    └── functions/
        └── generate-feedback/
            ├── index.ts          # AI 피드백 Edge Function
            └── deno.json
```

---

## 12. 구현 순서

### Phase 1: 기반 구축 (DB + 타입 + 스토어)

```
Step 1: DB 변경 — 5개 신규 테이블 + game_orders.completed_at + game_orders.status에 'failed' 추가
Step 2: 타입 정의 — db.ts, game.ts 타입 추가
Step 3: 점수 상수 — src/lib/scoring/constants.ts
Step 4: scoringStore — Zustand 스토어 신규 생성
```

### Phase 2: 액션 로그 연결

```
Step 5: 정보 검토 — GamePage onDragStart/onDragEnd, LeftSidebar navigate, 
        WokComponent, FryingBasketComponent 현재 구조 파악
Step 6: 각 컴포넌트에 액션 로그 기록 코드 추가
Step 7: useGameTick에 공백 감지 연결
```

### Phase 3: 레시피 검수 확장

```
Step 8: 정보 검토 — evaluate.ts, useRecipeEval.ts 현재 코드 파악
Step 9: evaluate.ts 반환 타입 확장 (RecipeEvaluationResult)
Step 10: plate_order 단위 판별 로직 구현
Step 11: useRecipeEval에서 오류 감지 시 scoringStore 기록
```

### Phase 4: 오류 UI + 버리기

```
Step 12: 정보 검토 — ContainerCard, RightSidebar 현재 구조 파악
Step 13: RecipeErrorPopup 컴포넌트 신규 생성
Step 14: ContainerCard에 오류 배지 + 팝업 연결
Step 15: 버리기 기능 구현 (재료 disposed + 그릇 제거 + 주문 failed 처리 + 감점)
```

### Phase 5: 서빙 시간 + 점수 + 자동 종료

```
Step 16: 서빙 처리에 completed_at 기록 + 서빙 시간 점수 이벤트
Step 17: 웍 burned 감점 연결
Step 18: 연속 navigate 감점 연결
Step 19: 게임 자동 종료 로직 (모든 주문 completed/failed 시 세션 종료 플로우)
Step 20: 전체 점수 흐름 통합 테스트
```

### Phase 6: 세션 종료 + AI 피드백

```
Step 21: 세션 종료 시 DB 일괄 저장 (기존 + 신규 5개 테이블)
Step 22: generate-feedback Edge Function 작성 + 배포
Step 23: 세션 결과 화면 (점수 + 이벤트 목록 + AI 피드백)
```

### Phase 7: 내 피드 페이지

```
Step 24: FeedPage + 라우트 + AvatarSelectPage 진입점
Step 25: 점수 그래프 (게임 단위 / 일 단위)
Step 26: 약한 메뉴 / 숙달된 메뉴 목록
Step 27: 카테고리별 성과
```

### Phase 8: 통합 테스트 + 정리

```
Step 28: 전체 플로우 테스트 (게임 시작 → 조리 → 오류 발생 → 버리기 → 서빙 → 자동 종료 → 피드백 → 피드)
Step 29: 디버그 코드 정리 + tsc --noEmit + npm run build
```

---

## 13. 변경하지 않는 것 (명시)

| 항목 | 이유 |
|------|------|
| 히트박스 렌더링 | 비율 좌표, SVG 유지 |
| DnD 상호작용 기본 로직 | 기존 케이스 유지, 로그 추가만 |
| 물리엔진 (웍/튀김채/MW/씽크) | 기존 로직 유지, burned 이벤트 hook만 추가 |
| 사이드바/뷰포트/핸드바 레이아웃 | 변경 없음 |
| 어드민 페이지 | 변경 없음 |
| 섹션 네비게이션 | 변경 없음 |
| CSS 변수 시스템 | 변경 없음 |
| 인증/매장/아바타 플로우 | AvatarSelectPage에 버튼 1개 추가만 |

---

## 14. 기존 원칙 준수 체크

| 원칙 | 이번 작업에서의 준수 방법 |
|------|------------------------|
| 원칙 1 — 물리엔진 클라이언트 전용 | 로그/점수도 Zustand 축적, 세션 종료 시 1회만 DB write |
| 원칙 2 — 비율 좌표 | 변경 없음 |
| 원칙 4 — action_history 판별 | 레시피 검수에서 action_history 활용, 별도 status 추가 안 함 |
| 원칙 10 — 레시피 판별은 순수 함수 | evaluate.ts 확장, UI 로직과 분리 유지 |
| any 타입 금지 | metadata는 Record<string, unknown> 사용 |
| 하드코딩 금지 | 점수 상수는 constants.ts에서 관리 |
| 어드민/게임 컴포넌트 공유 금지 | 내 피드는 별도 /feed 페이지, 게임 컴포넌트 미사용 |
| gen_random_uuid() | 신규 테이블 모두 적용 |
| 파일 읽기 전 수정 금지 | 매 Step 정보 검토 단계 필수 |

---

## 15. 충돌 위험 분석

### 15-1. evaluateContainer 반환 타입 변경

기존 호출부가 boolean 결과에 의존하고 있다면 깨질 수 있다.
→ RecipeEvaluationResult의 isComplete 필드로 하위 호환 유지.
→ 정보 검토 시 기존 호출부 전수 확인 필수.

### 15-2. onDragEnd에 로그 추가

기존 onDragEnd 핸들러가 이미 복잡하다 (Case 1~N).
로그 추가가 기존 로직을 방해하지 않도록 주의.
→ 로그는 기존 로직 실행 후 마지막에 추가.

### 15-3. useGameTick에 idle 체크 추가

기존 tick 루프에 부하 추가.
→ checkIdlePenalty는 단순 timestamp 비교이므로 성능 영향 미미.

### 15-4. 세션 종료 DB 저장 확장

기존 저장 로직에 5개 테이블 추가.
→ 트랜잭션 처리 필요 (한 테이블 실패 시 전체 롤백 또는 부분 성공 허용 여부 결정 필요).
→ 부분 성공 허용 권장 (로그 저장 실패해도 세션 자체는 종료).

---

## 16. 확정된 설계 결정

| 항목 | 결정 |
|------|------|
| 버리기 후 그릇 | **그릇도 함께 제거.** container_instance 삭제 + assigned_order_id 해제. 빈 그릇 재사용 없음. |
| 게임 종료 조건 | **주문 전부 처리 시 자동 종료.** 게임 시작 시(/game/setup) 활성화할 메뉴와 주문 수를 설정. 모든 game_orders가 completed 또는 disposed(버려진 주문) 상태가 되면 자동으로 세션 종료 플로우 진입. |
| 점수 수치 조정 | **하드코딩 상수 고정.** src/lib/scoring/constants.ts에서만 관리. 어드민 설정 UI 없음. |

### 게임 자동 종료 로직

```
매 서빙/버리기 후:
  allOrders = gameStore.orders
  allCompleted = allOrders.every(o => o.status === 'completed')

  if allCompleted:
    → 세션 종료 플로우 시작
    → DB 일괄 저장
    → AI 피드백 생성
    → 결과 화면 표시
```

**주의:** 주문이 버려진 경우(재료 버리기로 인해 해당 주문을 더 이상 완성할 수 없는 경우)의 처리도 필요하다. 버려진 주문은 'completed'가 아닌 별도 상태가 필요할 수 있다. 현재 game_orders.status는 'pending' | 'in_progress' | 'completed'인데, 'failed' 또는 'abandoned' 상태 추가를 검토해야 한다.

→ **game_orders.status에 'failed' 추가 필요.** 재료를 버려서 해당 주문을 완성할 수 없게 된 경우 status = 'failed'로 전환. 자동 종료 조건: 모든 주문이 'completed' 또는 'failed'.

---

## 17. 완료 기준

### Phase 1~2 완료
- [ ] DB 5개 테이블 생성 + game_orders.completed_at + game_orders.status 'failed' 추가
- [ ] 타입 정의 완료 + tsc --noEmit 오류 없음
- [ ] scoringStore 생성 + 초기화/리셋 동작
- [ ] 게임 플레이 중 액션 로그가 Zustand에 쌓이는 것 확인

### Phase 3~4 완료
- [ ] 재료 투입 시 plate_order 단위 판별 실행
- [ ] 오류 감지 시 ContainerCard에 "잘못 조리됨" 표시
- [ ] 오류 팝업에서 오류 내역 확인 가능
- [ ] "버리기" 클릭 시 재료 disposed + 감점

### Phase 5 완료
- [ ] 서빙 시 서빙 시간 기반 점수 이벤트 발생
- [ ] 웍 burned 시 감점
- [ ] 연속 navigate 감점
- [ ] 공백 감점 (5초/10초)
- [ ] currentScore가 실시간 갱신

### Phase 6 완료
- [ ] 세션 종료 시 전체 데이터 DB 저장
- [ ] generate-feedback Edge Function 동작
- [ ] 결과 화면에 점수 + AI 피드백 표시

### Phase 7 완료
- [ ] /feed 페이지 접근 가능
- [ ] 점수 그래프 (게임/일 단위)
- [ ] 약한 메뉴 / 숙달된 메뉴 표시
- [ ] 카테고리별 성과 표시

### 전체 완료
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음
- [ ] 전체 플로우 통합 테스트 통과

---

## 18. 새 대화 시작 시 첫 메시지 예시

```
너는 KitchenFlow 프로젝트의 지휘관이다. Claude Code와 Supabase를 다루는 지휘관이다.

무조건 당장의 문제를 임시방편으로 해결하지 말고 근본 문제를 찾아서 해결해라.
사용자가 원하는 대답을 하지 말고 객관적인 사실에 근거하여 대답해라.
기존에 물리법칙, 원칙에 위배되는 수정이 필요하면 확인을 받고 진행해라.

## 임무

프로젝트 지식에 있는 `KitchenFlow_AI피드백_점수시스템_계획서.md`와 
`KitchenFlow_지휘관_인수인계.md`를 읽고,
나머지 프로젝트 지식도 확인한 후 
**AI 피드백 + 점수 시스템 + 액션 로그** 대규모 기능 추가를 지휘해라.

## 작업 프로세스 (매 Step 필수)

1. 계획 → 2. 정보 검토 → 3. 요청 → 4. 검토 → 5. 실행 → 6. 확인

## Claude Code 계획 승인 프로세스

1. Claude Code가 계획을 제출하면 사용자에게 공유
2. 지휘관이 계획을 세부적으로 검토
3. 문제 발견 시 수정된 계획을 다시 요청 (구현 지시 금지)
4. 문제 없음이 확실히 확인된 후에만 "계획 승인. 구현 진행해라." 지시
5. 계획을 승인하면서 동시에 수정사항을 추가하지 마라

## 핵심 인지사항

1. 레시피 검수는 plate_order 단위로 판별 (최종 검증이 아닌 단계별 검증)
2. 모든 로그/점수는 Zustand 축적 → 세션 종료 시 일괄 DB 저장
3. 기존 evaluateContainer는 반환 타입 확장 (하위 호환 유지)
4. 점수는 80점 시작, +1/-1/-2 가감, 상수 하드코딩 고정 (어드민 설정 없음)
5. AI 피드백은 세션 종료 후 Edge Function으로 생성
6. 버리기 시 그릇도 함께 제거 + 해당 주문 status = 'failed'
7. 게임 종료는 자동 (모든 주문이 completed 또는 failed 시)
8. DOCS 파일(KitchenFlow_AI피드백_점수시스템_DOCS.md)을 Claude Code에 반드시 참조시켜라

먼저 계획서의 내용을 이해했는지 정리하고 확인을 받아라.
확인 후 Phase 1 Step 1(DB 변경)부터 시작해라.
```

---

_작성 완료_