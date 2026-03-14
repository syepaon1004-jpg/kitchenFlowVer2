# KitchenFlow — 레시피 다중 액션 설계서

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.
>
> **범위**: recipe_ingredients의 액션 정의를 단일 → 다중으로 확장.
> DB 스키마 + 타입 + 판별 로직 + 어드민 UI + AI 분석 프롬프트.

---

## 0. 작업 프로세스 (모든 Step에 적용)

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드를 직접 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — npm run build 오류 없음 + 동작 검증
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일을 수정하는 것
- 파일 경로, 변수명, 함수명을 추정으로 하드코딩 지시하는 것
- 버그 발생 시 표면적 증상만 패치하는 것. 근본 원인 분석 후 해결

---

## 1. 문제 정의

### 현재 상태

recipe_ingredients 테이블:
```
required_action_type  — text, 단일 값 (stir/fry/microwave/boil/mix 중 1개 또는 null)
required_duration_min — float, 단일 값
required_duration_max — float, 단일 값
```

1개 재료에 1개 액션만 정의 가능.

### 실제 필요

"당면을 볶은 후(stir 30초) 끓이기(boil 120초)" 같은 레시피:
```
당면: [
  { actionType: 'stir', duration_min: 25, duration_max: 35 },
  { actionType: 'boil', duration_min: 100, duration_max: 140 }
]
```

1개 재료에 N개 액션이 필요하다.

### 런타임은 이미 준비됨

game_ingredient_instances.action_history는 이미 배열:
```json
[
  {"actionType": "stir", "seconds": 30},
  {"actionType": "boil", "seconds": 120}
]
```

문제는 DB 스키마(정의) + 어드민 UI(등록) + 판별 로직(검증)에만 있다.

---

## 2. 설계 방향: 두 가지 후보

### 방향 A: 별도 테이블 (정규화)

```sql
-- recipe_ingredients에서 액션 컬럼 3개 제거
-- 새 테이블 생성
CREATE TABLE recipe_ingredient_actions (
  id uuid PK,
  recipe_ingredient_id uuid FK → recipe_ingredients ON DELETE CASCADE,
  action_type text NOT NULL,
  duration_min float,
  duration_max float,
  sort_order int DEFAULT 0  -- 액션 순서 (볶기→끓이기)
);
```

장점: 정규화, 확장성
단점: JOIN 증가, 코드 변경 범위 큼, 기존 데이터 마이그레이션

### 방향 B: jsonb 컬럼 (비정규화)

```sql
-- recipe_ingredients에 jsonb 컬럼 추가
ALTER TABLE recipe_ingredients
  ADD COLUMN required_actions jsonb DEFAULT NULL;

-- 기존 3개 컬럼 유지 (하위호환, 마이그레이션 후 제거 가능)
```

required_actions 구조:
```json
[
  { "action_type": "stir", "duration_min": 25, "duration_max": 35 },
  { "action_type": "boil", "duration_min": 100, "duration_max": 140 }
]
```

장점: 스키마 변경 최소, 코드 변경 범위 작음, action_history와 구조 대칭
단점: jsonb 내부 유효성은 애플리케이션에서 보장

### 선택: 방향 B (jsonb)

이유:
1. action_history(런타임)가 이미 jsonb 배열 → required_actions(정의)도 동일 구조가 직관적
2. recipe_ingredients는 이미 recipe_id FK + ON DELETE CASCADE로 관리 → 별도 테이블은 과도
3. 기존 데이터 마이그레이션이 단순 (기존 단일 액션 → 1개짜리 배열로 변환)
4. 어드민 UI와 AI 분석 모두 JSON 배열로 처리 → 코드 일관성

---

## 3. DB 변경

### Step 1: 컬럼 추가

```sql
ALTER TABLE recipe_ingredients
  ADD COLUMN required_actions jsonb DEFAULT NULL;
```

### Step 2: 기존 데이터 마이그레이션

```sql
-- 기존 단일 액션 데이터를 required_actions 배열로 변환
UPDATE recipe_ingredients
SET required_actions = json_build_array(
  json_build_object(
    'action_type', required_action_type,
    'duration_min', required_duration_min,
    'duration_max', required_duration_max
  )
)
WHERE required_action_type IS NOT NULL;
```

### Step 3: 기존 컬럼 제거 (마이그레이션 확인 후)

```sql
ALTER TABLE recipe_ingredients
  DROP COLUMN required_action_type,
  DROP COLUMN required_duration_min,
  DROP COLUMN required_duration_max;
```

**주의: Step 3는 Step 2 마이그레이션 결과를 확인한 후에만 실행한다.**
확인 방법:
```sql
SELECT id, required_action_type, required_actions
FROM recipe_ingredients
WHERE required_action_type IS NOT NULL;
-- required_actions에 올바르게 변환되었는지 확인
```

### Step 2~3 CHECK constraint 처리

기존 CHECK:
```sql
CHECK (required_action_type IN ('stir', 'fry', 'microwave', 'boil', 'mix'))
```

Step 3에서 컬럼 제거 시 이 CHECK도 함께 제거됨.
required_actions의 action_type 유효성은 애플리케이션 레벨에서 보장
(TypeScript 타입 + 어드민 UI 드롭다운).

---

## 4. TypeScript 타입 변경

### 신규 타입

```typescript
export interface RequiredAction {
  action_type: ActionType;       // 'stir' | 'fry' | 'microwave' | 'boil' | 'mix'
  duration_min: number | null;
  duration_max: number | null;
}
```

### RecipeIngredient 변경

```
변경 전:
  required_action_type: ActionType | null;
  required_duration_min: number | null;
  required_duration_max: number | null;

변경 후:
  required_actions: RequiredAction[] | null;
```

### ACTION_TYPES 상수 (db.ts의 as const 패턴 확인 필요)

현재 ActionType에 포함된 값 확인 후, required_actions의 action_type에
동일한 타입을 사용하도록 한다.

---

## 5. 판별 로직 변경

### 현재 판별 (evaluate.ts)

```
매칭된 재료의 action_history에서:
  required_action_type의 seconds 합산 >= required_duration_min
  required_duration_max 있으면 seconds <= required_duration_max
```

단일 액션만 체크.

### 변경 후 판별

```
매칭된 재료의 action_history에서:
  required_actions 배열의 각 항목에 대해:
    해당 action_type의 seconds >= duration_min (있으면)
    해당 action_type의 seconds <= duration_max (있으면)
  모든 항목이 충족되어야 통과
```

예시:
```
required_actions: [
  { action_type: 'stir', duration_min: 25, duration_max: 35 },
  { action_type: 'boil', duration_min: 100, duration_max: null }
]

action_history: [
  { actionType: 'stir', seconds: 30 },  → 25 ≤ 30 ≤ 35 ✅
  { actionType: 'boil', seconds: 120 }  → 120 ≥ 100 ✅
]
→ 통과
```

### required_actions가 null이면

해당 재료는 액션 조건 없음 (기존과 동일). 재료만 맞으면 통과.

### 레시피 오류 타입 확장

현재:
- `action_insufficient` — duration_min 미달
- `action_excessive` — duration_max 초과

변경 후: 동일한 오류 타입 유지. 다만 오류 details에 어떤 action_type이 문제인지 포함:
```
{ type: 'action_insufficient', action_type: 'boil', expected_min: 100, actual: 50 }
```

---

## 6. 어드민 UI 변경 (RecipeManager)

### 현재 UI

재료 행:
```
[재료 드롭다운] [수량] [허용 오차] [plate_order] [액션 타입 1개] [최소 시간] [최대 시간]
```

### 변경 후 UI

재료 행:
```
[재료 드롭다운] [수량] [허용 오차] [plate_order]
  액션 목록:
    [액션 타입] [최소 시간] [최대 시간] [삭제]
    [액션 타입] [최소 시간] [최대 시간] [삭제]
    [+ 액션 추가]
```

- 기존 단일 행 → 재료 행 아래에 액션 서브리스트
- "액션 추가" 버튼으로 다중 액션 등록
- 각 액션은 타입(드롭다운) + 최소/최대 시간 + 삭제 버튼
- 액션 0개 = required_actions: null (조건 없음)

### UI 구현 원칙

- 기존 RecipeManager의 수동 편집 모드에서 변경
- AI 분석 모드의 결과 매핑도 변경 (아래 섹션 7 참조)
- 액션 타입 드롭다운 옵션: stir, fry, microwave, boil, mix
- 최소/최대 시간은 초 단위 입력

---

## 7. AI 분석 Edge Function 변경

### analyze-recipe 프롬프트 변경

현재 프롬프트에서 required_action_type/duration을 단일 값으로 요청.
변경 후 required_actions 배열로 요청.

**프롬프트 출력 스키마 변경:**

```
변경 전:
{
  "ingredients": [
    {
      "ingredient_id": "...",
      "quantity": 100,
      "plate_order": 1,
      "required_action_type": "stir",
      "required_duration_min": 25,
      "required_duration_max": 35
    }
  ]
}

변경 후:
{
  "ingredients": [
    {
      "ingredient_id": "...",
      "quantity": 100,
      "plate_order": 1,
      "required_actions": [
        { "action_type": "stir", "duration_min": 25, "duration_max": 35 },
        { "action_type": "boil", "duration_min": 100, "duration_max": null }
      ]
    }
  ]
}
```

### Edge Function 코드 변경

- supabase/functions/analyze-recipe/index.ts
- 프롬프트의 출력 JSON 스키마 변경
- 응답 파싱 로직 변경 (단일 → 배열)

### 프론트엔드 매핑 변경

- src/lib/recipe/analyzeRecipe.ts
- AiIngredient 타입의 required_action_type → required_actions 변경
- RecipeManager에서 AI 결과를 recipe_ingredients에 매핑하는 로직 변경

---

## 8. 구현 순서

```
Phase 1: DB + 타입 (기반)
  Step 1: DB — required_actions 컬럼 추가 (사용자 SQL 실행)
  Step 2: DB — 기존 데이터 마이그레이션 (사용자 SQL 실행)
  Step 3: DB — 기존 3개 컬럼 제거 (마이그레이션 확인 후, 사용자 SQL 실행)
  Step 4: TypeScript — RequiredAction 타입 추가, RecipeIngredient 변경

Phase 2: 판별 로직
  Step 5: evaluate.ts — 다중 액션 판별로 변경
  Step 6: useRecipeEval.ts — 오류 details에 action_type 포함 (필요시)

Phase 3: 어드민 UI
  Step 7: RecipeManager — 액션 서브리스트 UI

Phase 4: AI 분석
  Step 8: Edge Function 프롬프트 + 파싱 변경
  Step 9: analyzeRecipe.ts — AiIngredient 타입 변경
  Step 10: RecipeManager — AI 결과 매핑 변경

Phase 5: 검증
  Step 11: 기존 단일 액션 레시피 정상 판별 확인 (하위호환)
  Step 12: 다중 액션 레시피 등록 → 게임 판별 확인
  Step 13: AI 분석으로 다중 액션 레시피 생성 확인
  Step 14: npm run build + tsc --noEmit
```

---

## 9. 변경 영향 범위

### 변경 파일 (예상)

| 파일 | 변경 |
|------|------|
| src/types/db.ts | RequiredAction 타입 추가, RecipeIngredient 변경 |
| src/lib/recipe/evaluate.ts | 다중 액션 판별 |
| src/lib/recipe/analyzeRecipe.ts | AiIngredient 타입 변경 |
| src/hooks/useRecipeEval.ts | 오류 details 확장 (필요시) |
| src/components/admin/RecipeManager.tsx | 액션 서브리스트 UI |
| supabase/functions/analyze-recipe/index.ts | 프롬프트 + 파싱 |

### 변경하지 않는 것

| 항목 | 이유 |
|------|------|
| game_ingredient_instances.action_history | 이미 다중 액션 지원 |
| 물리엔진 (wok.ts, tickWok 등) | stir/fry/boil 누적 로직 무관 |
| 장비 컴포넌트 | 볶기/튀김/MW 동작 무관 |
| DnD 핸들러 | 무관 |
| 게임 UI (ContainerCard, Handbar 등) | 무관 |
| 점수 시스템 (scoringStore) | action_insufficient 오류 타입 유지 |

---

## 10. 기존 원칙 준수

| 원칙 | 준수 방법 |
|------|----------|
| action_history로 판별 (원칙 4) | required_actions 배열 vs action_history 배열 비교 |
| 물리엔진 클라이언트 전용 | 판별 로직만 변경, 물리엔진 무관 |
| any 타입 금지 | RequiredAction 타입 명시 |
| 하드코딩 금지 | 액션 타입은 ActionType union 참조 |
| 파일 읽기 전 수정 금지 | 매 Step 정보 검토 선행 |

---

## 11. 하위 호환성

- required_actions가 null → 액션 조건 없음 (기존 null과 동일)
- required_actions가 빈 배열 [] → null과 동일 취급
- required_actions가 1개짜리 배열 → 기존 단일 액션과 동일 동작
- 마이그레이션으로 기존 데이터를 배열로 변환하므로 데이터 손실 없음

---

## 12. 완료 기준

- [ ] DB: required_actions jsonb 컬럼 존재, 기존 3개 컬럼 제거
- [ ] 기존 레시피 데이터가 required_actions 배열로 정상 변환
- [ ] TypeScript: RequiredAction 타입, RecipeIngredient에 required_actions
- [ ] 판별: 다중 액션 모두 충족 시 통과, 하나라도 미충족 시 오류
- [ ] 판별: required_actions null → 액션 체크 스킵 (하위호환)
- [ ] 어드민: 재료별 다중 액션 등록/삭제/편집 가능
- [ ] AI 분석: 다중 액션 레시피 정상 생성
- [ ] 기존 단일 액션 레시피 정상 동작 (회귀 없음)
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음

---

_설계서 작성 완료_