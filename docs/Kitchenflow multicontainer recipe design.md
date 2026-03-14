# KitchenFlow — 다중 그릇 레시피 설계서

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.
>
> **범위**: 1개 레시피에 여러 그릇을 정의하고, 그릇별로 재료를 판별하는 시스템.
> DB 스키마 + 타입 + 판별 로직 + 어드민 UI + AI 분석 프롬프트.

---

## 0. 작업 프로세스

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드를 직접 확인 (수정하지 말고 보고만)
3. 요청    — 변경 내용을 제시하고 승인 요청
4. 검토    — 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — npm run build 오류 없음 + 동작 검증
```

**절대 금지:**
- 최신 코드를 확인하지 않고 추정으로 파일 수정
- 파일 경로, 변수명, 함수명을 추정으로 하드코딩 지시
- 표면적 증상 패치. 근본 원인 분석 후 해결

---

## 1. 현재 상태와 문제

### 이미 작동하는 부분

| 기능 | 구현 상태 |
|------|----------|
| 같은 주문에 여러 그릇 배정 | ✅ OrderSelectModal에서 동일 주문 재선택 가능 |
| 서빙 조건 (다중 container) | ✅ 같은 orderId의 모든 container가 is_complete여야 서빙 |
| assigned_order_id 묶음 | ✅ 원칙 5 준수 |

### 작동하지 않는 부분 (3곳)

**문제 1: 레시피 정의 — 그릇이 1개만 지정됨**

```
recipes.target_container_id — 단일 값 (string | null)
recipe_ingredients — container 관련 필드 없음
```

"탕기 + 와사비간장 소스볼" 같은 2그릇 레시피를 정의할 수 없다.
재료가 어느 그릇에 들어가야 하는지 지정할 수 없다.

**문제 2: 판별 로직 — 단일 container만 비교**

```typescript
// evaluate.ts 현재
if (containerTypeId !== recipe.target_container_id) {
  errors.push({ type: 'wrong_container', ... });
  return { isComplete: false, errors, checkedUpToPlateOrder: 0 };
}
// → 이후 recipe_ingredients 전체를 이 1개 container에서 찾으려 함
```

같은 주문에 그릇 2개가 있어도, 각 그릇 평가 시 recipe_ingredients 전체를 그 그릇 안에서 찾는다. 탕기를 평가할 때 와사비(소스볼 재료)도 탕기에서 찾으려 하여 실패.

**문제 3: target_container_id null 버그**

```typescript
containerTypeId !== recipe.target_container_id
// target_container_id가 null이면 → 항상 !== → 항상 wrong_container
```

null은 "아무 그릇 OK"여야 하는데, 현재는 반대로 "어떤 그릇도 불가"로 동작.

**문제 4: 어드민 등록 UI**

RecipeManager에서 target_container_id 드롭다운이 1개. 다중 그릇 선택 불가. 재료별 그릇 지정 UI 없음.

---

## 2. 설계 방향

### 핵심 결정: recipe_ingredients에 target_container_id 추가

재료 단위로 "이 재료가 어느 그릇에 들어가야 하는지"를 지정한다.

```
변경 전:
  recipes.target_container_id = 탕기  ← 레시피 전체에 1개
  recipe_ingredients:
    양파     (어느 그릇인지 모름)
    와사비   (어느 그릇인지 모름)

변경 후:
  recipes.target_container_id = 탕기  ← 기본 그릇 (fallback)
  recipe_ingredients:
    양파     target_container_id = null  → 기본 그릇(탕기)에 해당
    바지락   target_container_id = null  → 기본 그릇(탕기)에 해당
    와사비   target_container_id = 소스볼  → 소스볼에 해당
    간장     target_container_id = 소스볼  → 소스볼에 해당
```

**fallback 규칙:**
- recipe_ingredients.target_container_id가 **null** → recipes.target_container_id를 사용 (기본 그릇)
- recipe_ingredients.target_container_id가 **값 있음** → 해당 그릇에 담겨야 함

**하위호환:**
- 기존 단일 그릇 레시피: 모든 recipe_ingredients의 target_container_id가 null → 기본 그릇으로 전부 평가 → 기존과 100% 동일
- 마이그레이션 불필요 (신규 컬럼 default null)

### 별도 테이블(recipe_containers) 대신 이 방식을 선택한 이유

1. 기존 recipe_ingredients에 컬럼 1개 추가로 해결 — 스키마 변경 최소
2. required_actions를 recipe_ingredients에 추가한 패턴과 일관성
3. 재료별로 그릇이 지정되므로 판별 로직이 직관적 (그릇별 필터 → 비교)
4. 별도 테이블은 JOIN 증가 + 관리 복잡성만 추가

---

## 3. DB 변경

### Step 1: recipe_ingredients에 target_container_id 추가

```sql
ALTER TABLE recipe_ingredients
  ADD COLUMN target_container_id uuid DEFAULT NULL
  REFERENCES containers(id) ON DELETE SET NULL;
```

ON DELETE SET NULL: 그릇이 삭제되면 null로 → 기본 그릇 fallback.

### 기존 데이터 영향

없음. 기존 recipe_ingredients의 target_container_id는 모두 null → 기본 그릇(recipes.target_container_id) 사용 → 기존 동작 유지.

---

## 4. TypeScript 타입 변경

### RecipeIngredient에 필드 추가

```
추가: target_container_id: string | null
```

기존 필드 변경 없음.

---

## 5. 판별 로직 변경 (evaluate.ts)

### 현재 로직의 문제

```
evaluate(containerInstance):
  recipe_ingredients 전체 vs 이 container 안 재료 1:1 비교
  → 다른 그릇에 있어야 할 재료도 이 그릇에서 찾으려 함
```

### 변경 후 로직

```
evaluate(containerInstance):
  1. container의 container_id (그릇 타입) 확인
  2. recipe_ingredients에서 이 그릇에 해당하는 재료만 필터:
     - target_container_id === container.container_id인 것
     - 또는 target_container_id가 null이고 recipe.target_container_id === container.container_id인 것
  3. 필터된 재료 vs 이 container 안 재료 1:1 비교
  4. 이 그릇에 해당하는 재료가 전부 충족 → is_complete = true
```

### container_id 검증 변경

```
변경 전:
  if (containerTypeId !== recipe.target_container_id)
    → wrong_container

변경 후:
  이 container에 해당하는 recipe_ingredients가 0개이면
    → wrong_container (이 그릇 타입에 해당하는 재료 정의 없음)
  1개 이상이면 → 해당 재료로 판별 진행
```

이렇게 하면:
- 탕기 평가 시: target_container_id가 null(=탕기 기본) 또는 탕기인 재료만 비교
- 소스볼 평가 시: target_container_id가 소스볼인 재료만 비교
- 둘 다 is_complete → canServe (기존 서빙 로직 그대로)

### null target_container_id 버그 동시 해결

새 로직에서는 `recipe.target_container_id`와 `containerTypeId`를 직접 `!==` 비교하지 않는다. 대신 "이 그릇에 해당하는 재료가 있는지"로 판단하므로, null 비교 버그가 구조적으로 해소된다.

### 레시피 완성 판정

```
개별 그릇: 해당 그릇의 recipe_ingredients 전부 충족 → is_complete
전체 서빙: 같은 주문의 모든 그릇이 is_complete → canServe (기존 로직 유지)
```

---

## 6. 어드민 UI 변경 (RecipeManager)

### 현재 UI

```
레시피명: [          ]
기본 그릇: [탕기 ▼]    ← 단일 드롭다운

재료 목록:
  [양파] [1] [0.1] [1] [조리 액션...]
  [바지락] [1] [0.1] [1] [조리 액션...]
```

### 변경 후 UI

```
레시피명: [          ]
기본 그릇: [탕기 ▼]    ← 유지 (단일 그릇 레시피의 편의성)

재료 목록:
  [양파] [1] [0.1] [1] [그릇: 기본 ▼] [조리 액션...]
  [바지락] [1] [0.1] [1] [그릇: 기본 ▼] [조리 액션...]
  [와사비] [2] [0.1] [2] [그릇: 소스볼 ▼] [조리 액션...]
  [간장] [1] [0.1] [2] [그릇: 소스볼 ▼] [조리 액션...]
```

**그릇 드롭다운 옵션:**
- "기본" (= null → recipes.target_container_id 사용)
- containers 테이블의 모든 그릇 목록

### DB 저장

```
recipe_ingredients INSERT 시:
  target_container_id: 선택한 그릇 id 또는 null("기본")
```

### 편집 모드 로드

```
recipe_ingredients 로드 시:
  target_container_id가 null → UI에서 "기본" 선택
  target_container_id가 값 → 해당 그릇 선택
```

---

## 7. AI 분석 변경

### Edge Function 프롬프트 변경

현재 스키마에서 그릇 정보가 없음. 추가:

```json
{
  "ingredients": [
    {
      "ingredient_id": "...",
      "quantity": 1,
      "plate_order": 1,
      "required_actions": [...],
      "target_container": "탕기"  // 신규: 어느 그릇에 담기는지
    }
  ]
}
```

프롬프트 STEP에 안내 추가:
"레시피가 여러 그릇을 사용하는 경우 (예: 메인 탕기 + 소스볼), 각 재료가 어느 그릇에 담기는지 target_container에 명시. 동일 그릇 재료는 같은 target_container 값 사용."

### analyzeRecipe.ts 변경

AiIngredient에 `target_container: string | null` 추가.
RecipeManager AI 매핑에서 target_container 문자열 → containers.id 매칭.

---

## 8. 구현 순서

```
Phase 1: DB + 타입 (기반)
  Step 1: DB — recipe_ingredients.target_container_id 컬럼 추가
  Step 2: db.ts — RecipeIngredient에 target_container_id 추가

Phase 2: 판별 로직
  Step 3: evaluate.ts — 그릇별 필터 판별로 변경
          (null 버그도 동시 해결)

Phase 3: 어드민 UI
  Step 4: RecipeManager — 재료별 그릇 드롭다운 추가
          DB 저장/로드 로직 변경

Phase 4: AI 분석
  Step 5: Edge Function 프롬프트에 target_container 추가
  Step 6: analyzeRecipe.ts 타입 + RecipeManager AI 매핑

Phase 5: 검증
  Step 7: 기존 단일 그릇 레시피 정상 판별 (하위호환)
  Step 8: 다중 그릇 레시피 등록 → 게임에서 그릇별 판별 → 서빙
  Step 9: npm run build + tsc --noEmit
```

---

## 9. 변경 파일 (예상)

| 파일 | 변경 |
|------|------|
| src/types/db.ts | RecipeIngredient에 target_container_id 추가 |
| src/lib/recipe/evaluate.ts | 그릇별 필터 판별, null 버그 수정 |
| src/components/admin/RecipeManager.tsx | 재료별 그릇 드롭다운 UI + 저장/로드 |
| src/lib/recipe/analyzeRecipe.ts | AiIngredient에 target_container 추가 |
| supabase/functions/analyze-recipe/index.ts | 프롬프트 + 스키마 변경 |

### 변경하지 않는 것

| 항목 | 이유 |
|------|------|
| GamePage onDragEnd (그릇 드롭) | 기존 주문 배정 구조 그대로 |
| OrderSelectModal | 이미 동일 주문 재선택 가능 |
| RightSidebar canServe | 이미 다중 container 인식 |
| ContainerCard | 개별 그릇의 is_complete 표시만, 변경 불필요 |
| useRecipeEval | evaluate 호출 방식 변경 불필요 (container별 호출 유지) |
| 물리엔진 | 무관 |
| 점수/로그 시스템 | 무관 |

---

## 10. 기존 원칙 준수

| 원칙 | 준수 방법 |
|------|----------|
| assigned_order_id 묶음 (원칙 5) | 다중 그릇은 기존 assigned_order_id로 묶음. 신규 FK 추가 없음 |
| action_history로 판별 (원칙 4) | 변경 없음 |
| 물리엔진 클라이언트 전용 | 변경 없음 |
| any 타입 금지 | target_container_id: string \| null 명시 |
| 하드코딩 금지 | containers 목록은 DB 조회 |
| 파일 읽기 전 수정 금지 | 매 Step 정보 검토 선행 |

---

## 11. 하위호환성

| 시나리오 | 동작 |
|---------|------|
| 기존 단일 그릇 레시피 | recipe_ingredients 전부 target_container_id = null → 기본 그릇으로 평가 → 기존과 동일 |
| recipes.target_container_id = null인 레시피 | 모든 재료의 target_container_id도 null → 그릇 타입 체크 스킵 (아무 그릇 OK) |
| 신규 다중 그릇 레시피 | 재료별 target_container_id 지정 → 그릇별 필터 판별 |

---

## 12. 게임 플레이 시나리오 (다중 그릇)

```
레시피: 오이도 바지락 칼국수
  기본 그릇: 탕기
  재료:
    양파(target: null=탕기), 바지락(target: null=탕기), ...
    와사비(target: 소스볼), 간장(target: 소스볼)

1. 빌지큐에 주문 생성
2. 탕기를 사이드바에 드롭 → 주문 선택 → 배정
3. 소스볼을 사이드바에 드롭 → 같은 주문 선택 → 배정
4. 웍에서 조리 → 탕기로 이동 (양파, 바지락 등)
5. 와사비, 간장을 소스볼에 직접 드롭
6. 탕기 평가: target_container_id=null인 재료만 비교 → 통과 → is_complete
7. 소스볼 평가: target_container_id=소스볼인 재료만 비교 → 통과 → is_complete
8. canServe: 탕기 + 소스볼 모두 is_complete → 서빙 가능
```

---

## 13. 완료 기준

- [ ] DB: recipe_ingredients.target_container_id 컬럼 존재
- [ ] 기존 레시피 데이터 영향 없음 (전부 null)
- [ ] 판별: 그릇별 필터 후 해당 재료만 비교
- [ ] 판별: target_container_id null → 기본 그릇 fallback
- [ ] 판별: recipe.target_container_id null → 그릇 타입 체크 스킵
- [ ] 어드민: 재료별 그릇 드롭다운 선택 가능
- [ ] 어드민: "기본" 선택 시 null 저장
- [ ] 기존 단일 그릇 레시피 정상 동작 (회귀 없음)
- [ ] 다중 그릇 레시피: 그릇별 판별 → 전체 서빙 정상
- [ ] AI 분석: 다중 그릇 레시피 생성 시 target_container 정상 매핑
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음

---

_설계서 작성 완료_