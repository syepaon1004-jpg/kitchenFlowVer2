import type { GameIngredientInstance, RecipeIngredient, Recipe, ActionHistoryEntry } from '../../types/db';
import type { RecipeEvaluationResult, RecipeError } from '../../types/game';

/** 액션에서 옮겨지려는 가상 재료 (dry-run 입력) */
export interface AttemptingItem {
  ingredientId: string;
  quantity: number;
  actionHistory: ActionHistoryEntry[];
}

/** 액션 단위 dry-run 평가 결과 */
export interface ActionAttemptResult {
  /** 액션이 차단되어야 하는가 */
  blocked: boolean;
  /** 차단 사유 (있을 때) */
  blockReason: 'wrong_container' | 'unexpected_ingredient' | 'plate_order_mismatch' | null;
  /** 가상 평가 시 발견된 모든 오류 */
  allErrors: RecipeError[];
  /** ingredient_id → 오류 목록 (UI 색상 결정용) */
  errorsByIngredientId: Map<string, RecipeError[]>;
  /** 이번 액션의 plate_order에 있어야 하는데 묶음에 없는 RecipeIngredient (콜아웃) */
  missingForThisAction: RecipeIngredient[];
  /** 이 컨테이너에 해당하는 RecipeIngredient (필터링 결과) */
  filteredRecipeIngredients: RecipeIngredient[];
}

/** 액션 단위 dry-run 평가. 순수 함수 — store 접근 없음, 부작용 없음. */
export function evaluateActionAttempt(
  inContainer: GameIngredientInstance[],
  attemptingItems: AttemptingItem[],
  attemptPlateOrder: number,
  recipeIngredients: RecipeIngredient[],
  recipe: Recipe,
  containerTypeId: string,
): ActionAttemptResult {
  // 1. 컨테이너 type 필터링 (evaluateContainer와 동일 로직)
  const filtered = recipeIngredients.filter((ri) => {
    if (ri.target_container_id != null) {
      return ri.target_container_id === containerTypeId;
    }
    return (
      recipe.target_container_id === containerTypeId ||
      recipe.target_container_id === null
    );
  });
  if (filtered.length === 0) {
    return {
      blocked: true,
      blockReason: 'wrong_container',
      allErrors: [{
        type: 'wrong_container',
        details: { got: containerTypeId, expected: recipe.target_container_id },
      }],
      errorsByIngredientId: new Map(),
      missingForThisAction: [],
      filteredRecipeIngredients: [],
    };
  }

  // 2. 가상 인스턴스 생성 (검증용 임시 객체, store에 추가 안 됨)
  const virtualInstances: GameIngredientInstance[] = attemptingItems.map((item, idx) => ({
    id: `__attempt_${idx}__`,
    session_id: '',
    ingredient_id: item.ingredientId,
    quantity: item.quantity,
    location_type: 'container',
    equipment_state_id: null,
    container_instance_id: null,
    zone_id: null,
    plate_order: attemptPlateOrder,
    action_history: item.actionHistory,
  }));

  // 3. 합성 후 evaluateContainer 재사용
  const merged = [...inContainer, ...virtualInstances];
  const result = evaluateContainer(merged, filtered, recipe, containerTypeId);

  // 4. 오류 분류 (missing은 콜아웃으로 별도, 그 외 ingredient_id 키로 그룹)
  const attemptingIds = new Set(attemptingItems.map((it) => it.ingredientId));
  const errorsByIngredientId = new Map<string, RecipeError[]>();
  for (const err of result.errors) {
    if (!err.ingredient_id) continue;
    if (err.type === 'missing_ingredient') continue;
    const arr = errorsByIngredientId.get(err.ingredient_id) ?? [];
    arr.push(err);
    errorsByIngredientId.set(err.ingredient_id, arr);
  }

  // 5. 차단 사유 결정 (이번 액션 재료에 귀속되는 차단성 오류만)
  let blocked = false;
  let blockReason: ActionAttemptResult['blockReason'] = null;
  for (const err of result.errors) {
    if (!err.ingredient_id) continue;
    if (!attemptingIds.has(err.ingredient_id)) continue;
    if (err.type === 'unexpected_ingredient') {
      blocked = true;
      blockReason = 'unexpected_ingredient';
      break;
    }
    if (err.type === 'plate_order_mismatch') {
      blocked = true;
      blockReason = 'plate_order_mismatch';
      break;
    }
  }

  // 6. 콜아웃: 이번 액션의 plate_order에 있어야 하는데 묶음에 없는 RecipeIngredient
  const missingForThisAction = filtered.filter((ri) => {
    if (ri.plate_order !== attemptPlateOrder) return false;
    if (ri.is_deco) return false;
    return !attemptingIds.has(ri.ingredient_id);
  });

  return {
    blocked,
    blockReason,
    allErrors: result.errors,
    errorsByIngredientId,
    missingForThisAction,
    filteredRecipeIngredients: filtered,
  };
}

export function evaluateContainer(
  inContainer: GameIngredientInstance[],
  recipeIngredients: RecipeIngredient[],
  recipe: Recipe,
  containerTypeId: string,
): RecipeEvaluationResult {
  const errors: RecipeError[] = [];

  // 1. 이 container에 해당하는 recipe_ingredients만 필터
  const filtered = recipeIngredients.filter((ri) => {
    if (ri.target_container_id != null) {
      return ri.target_container_id === containerTypeId;
    }
    // ri.target_container_id === null → fallback
    return (
      recipe.target_container_id === containerTypeId ||
      recipe.target_container_id === null
    );
  });

  if (filtered.length === 0) {
    errors.push({
      type: 'wrong_container',
      details: { got: containerTypeId, expected: recipe.target_container_id },
    });
    return { isComplete: false, errors, checkedUpToPlateOrder: 0 };
  }

  // 비데코 재료만 분리
  const nonDeco = filtered.filter((r) => !r.is_deco);

  // currentMaxPlateOrder: 그릇 안 비데코 재료 중 가장 높은 plate_order
  const currentMaxPlateOrder =
    inContainer.length > 0
      ? Math.max(
          0,
          ...inContainer
            .filter((i) => {
              const ri = filtered.find((r) => r.ingredient_id === i.ingredient_id);
              return !ri?.is_deco;
            })
            .map((i) => i.plate_order ?? 0),
        )
      : 0;

  // 레시피의 최대 plate_order (비데코만)
  const maxRecipePlateOrder =
    nonDeco.length > 0
      ? Math.max(...nonDeco.map((r) => r.plate_order))
      : 0;

  // 2. unexpected_ingredient 검사 (즉시 — 레시피에 없는 재료)
  for (const inst of inContainer) {
    const inRecipe = filtered.some((r) => r.ingredient_id === inst.ingredient_id);
    if (!inRecipe) {
      errors.push({
        type: 'unexpected_ingredient',
        ingredient_id: inst.ingredient_id,
        details: {},
      });
    }
  }

  // 3. plate_order_mismatch 검사 (즉시 — 데코 재료는 면제)
  for (const inst of inContainer) {
    const ri = filtered.find((r) => r.ingredient_id === inst.ingredient_id);
    if (ri && !ri.is_deco && inst.plate_order !== ri.plate_order) {
      errors.push({
        type: 'plate_order_mismatch',
        ingredient_id: inst.ingredient_id,
        details: { got: inst.plate_order, expected: ri.plate_order },
      });
    }
  }

  // checkedUpToPlateOrder 결정 (비데코 기준):
  // plate_order N+1 재료가 있으면 N까지 확정 검증
  // 같은 plate_order 그룹 내 누락은 아직 확정하지 않음 (N+1 진입 시 N 확정)
  // 단, 레시피 최대 plate_order에 도달했으면 해당 단계까지 확정
  const confirmedPlateOrder =
    currentMaxPlateOrder >= maxRecipePlateOrder
      ? maxRecipePlateOrder
      : currentMaxPlateOrder - 1;

  // confirmedPlateOrder까지의 레시피 재료만 검증
  // 비데코: plate_order <= confirmedPlateOrder
  // 데코: 비데코가 전부 확정된 후(confirmedPlateOrder >= maxRecipePlateOrder)에만 포함
  const expectedByNow = filtered.filter((r) => {
    if (r.is_deco) return confirmedPlateOrder >= maxRecipePlateOrder;
    return r.plate_order <= confirmedPlateOrder;
  });

  for (const ri of expectedByNow) {
    const found = inContainer.find((inst) => inst.ingredient_id === ri.ingredient_id);

    // 4. missing_ingredient 검사 (confirmedPlateOrder까지만)
    if (!found) {
      errors.push({
        type: 'missing_ingredient',
        ingredient_id: ri.ingredient_id,
        details: { plate_order: ri.plate_order },
      });
      continue;
    }

    // 5. quantity 검사 (부동소수점 안전장치: Math.abs < 0.001)
    if (Math.abs(found.quantity - ri.quantity) >= 0.001) {
      errors.push({
        type: 'quantity_error',
        ingredient_id: ri.ingredient_id,
        details: { got: found.quantity, expected: ri.quantity },
      });
    }

    // 6. action 검사 (다중 액션)
    if (ri.required_actions && ri.required_actions.length > 0) {
      for (const req of ri.required_actions) {
        const action = found.action_history.find(
          (a) => a.actionType === req.action_type,
        );
        if (!action) {
          errors.push({
            type: 'action_insufficient',
            ingredient_id: ri.ingredient_id,
            details: { action_type: req.action_type, required: req.action_type },
          });
        } else {
          if (req.duration_min != null && action.seconds < req.duration_min) {
            errors.push({
              type: 'action_insufficient',
              ingredient_id: ri.ingredient_id,
              details: { action_type: req.action_type, seconds: action.seconds, min: req.duration_min },
            });
          }
          if (req.duration_max != null && action.seconds > req.duration_max) {
            errors.push({
              type: 'action_excessive',
              ingredient_id: ri.ingredient_id,
              details: { action_type: req.action_type, seconds: action.seconds, max: req.duration_max },
            });
          }
        }
      }
    }
  }

  // 7. 전체 완성 판정
  // 모든 recipeIngredients(데코 포함)가 매칭되고 오류가 0개여야 isComplete
  const allIngredientsPresent = filtered.every((ri) =>
    inContainer.some((inst) => inst.ingredient_id === ri.ingredient_id),
  );
  const isComplete =
    confirmedPlateOrder >= maxRecipePlateOrder &&
    errors.length === 0 &&
    allIngredientsPresent;

  return { isComplete, errors, checkedUpToPlateOrder: confirmedPlateOrder };
}
