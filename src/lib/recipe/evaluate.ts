import type { GameIngredientInstance, RecipeIngredient, Recipe, ActionHistoryEntry } from '../../types/db';
import type { RecipeEvaluationResult, RecipeError } from '../../types/game';
import { resolveRecipeIngredientId } from './resolveRecipeIngredientId';

/** 재료 인스턴스 ↔ 레시피 행 매칭.
 * 인스턴스에 `recipe_ingredient_id` FK가 있으므로 단일 키 1:1 매칭.
 * null FK(주문 미할당 container 등)는 어떤 ri와도 매칭되지 않음 → unexpected 루프에서 처리. */
function matchInstanceToRi(inst: GameIngredientInstance, ri: RecipeIngredient): boolean {
  return inst.recipe_ingredient_id != null && inst.recipe_ingredient_id === ri.id;
}

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
  // 각 virtual inst에 대해 resolveRecipeIngredientId로 귀속될 ri 결정 — 실제 저장 시와 동일 로직.
  const pendingBindings = new Map<string, number>();
  const virtualInstances: GameIngredientInstance[] = attemptingItems.map((item, idx) => {
    const resolvedRiId = resolveRecipeIngredientId({
      ingredientId: item.ingredientId,
      containerTypeId,
      recipe,
      recipeIngredients: filtered,
      inContainer,
      pendingBindings,
    });
    if (resolvedRiId) {
      pendingBindings.set(resolvedRiId, (pendingBindings.get(resolvedRiId) ?? 0) + item.quantity);
    }
    return {
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
      recipe_ingredient_id: resolvedRiId,
    };
  });

  // 3. 합성 후 evaluateContainer 재사용
  const merged = [...inContainer, ...virtualInstances];
  const result = evaluateContainer(merged, filtered, recipe, containerTypeId);

  // 4. 오류 분류 (missing은 콜아웃으로 별도, 그 외 ingredient_id 키로 그룹)
  // 같은 재료가 여러 plate_order에 있는 레시피를 지원하기 위해, attempt와 무관한 plate_order의
  // 기존 step 에러는 이번 거부 팝업에 포함시키지 않는다.
  // plate_order_mismatch는 이번 투입과 직접 관련이므로 예외적으로 항상 포함.
  const attemptingIds = new Set(attemptingItems.map((it) => it.ingredientId));
  const errorsByIngredientId = new Map<string, RecipeError[]>();
  for (const err of result.errors) {
    if (!err.ingredient_id) continue;
    if (err.type === 'missing_ingredient') continue;
    if (err.type !== 'plate_order_mismatch') {
      const errPlateOrder = (err.details as { plate_order?: number | null }).plate_order;
      if (errPlateOrder != null && errPlateOrder !== attemptPlateOrder) continue;
    }
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
  // 같은 재료가 여러 plate_order에 등재될 수 있으므로 복합키로 ri 조회
  const currentMaxPlateOrder =
    inContainer.length > 0
      ? Math.max(
          0,
          ...inContainer
            .filter((i) => {
              const ri = filtered.find((r) => matchInstanceToRi(i, r));
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

  // 3. plate_order_mismatch 검사
  // inst가 레시피 소속 재료인데 recipe_ingredient_id가 null이거나 filtered에 없는 id면 잘못된 단계 투입.
  for (const inst of inContainer) {
    const inRecipe = filtered.some((r) => r.ingredient_id === inst.ingredient_id);
    if (!inRecipe) continue; // 레시피 외 재료는 unexpected 루프에서 처리
    const boundRi = inst.recipe_ingredient_id != null
      ? filtered.find((r) => r.id === inst.recipe_ingredient_id)
      : null;
    if (!boundRi) {
      const candidates = filtered.filter(
        (r) => r.ingredient_id === inst.ingredient_id && !r.is_deco,
      );
      errors.push({
        type: 'plate_order_mismatch',
        ingredient_id: inst.ingredient_id,
        details: {
          got: inst.plate_order,
          expected: candidates.map((r) => r.plate_order),
          plate_order: inst.plate_order,
        },
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
    // FK 기반 매칭: 같은 ri에 귀속된 모든 인스턴스(merge 분리 케이스 대비)
    const matched = inContainer.filter((inst) => matchInstanceToRi(inst, ri));

    // 4. missing_ingredient 검사 (confirmedPlateOrder까지만)
    if (matched.length === 0) {
      errors.push({
        type: 'missing_ingredient',
        ingredient_id: ri.ingredient_id,
        details: { plate_order: ri.plate_order },
      });
      continue;
    }

    const totalQty = matched.reduce((sum, inst) => sum + inst.quantity, 0);

    // 5. quantity 검사 (부동소수점 안전장치: Math.abs < 0.001) — 귀속된 inst qty 합산 비교
    if (Math.abs(totalQty - ri.quantity) >= 0.001) {
      errors.push({
        type: 'quantity_error',
        ingredient_id: ri.ingredient_id,
        details: { got: totalQty, expected: ri.quantity, plate_order: ri.plate_order },
      });
    }

    // 6. action 검사 (다중 액션) — 같은 ri에 귀속된 모든 inst 중 action_type별 max(seconds)로 판정
    if (ri.required_actions && ri.required_actions.length > 0) {
      for (const req of ri.required_actions) {
        const candidateSeconds = matched
          .map((inst) => inst.action_history.find((a) => a.actionType === req.action_type)?.seconds)
          .filter((s): s is number => typeof s === 'number');
        if (candidateSeconds.length === 0) {
          errors.push({
            type: 'action_insufficient',
            ingredient_id: ri.ingredient_id,
            details: { action_type: req.action_type, required: req.action_type, plate_order: ri.plate_order },
          });
          continue;
        }
        const effectiveSeconds = Math.max(...candidateSeconds);
        if (req.duration_min != null && effectiveSeconds < req.duration_min) {
          errors.push({
            type: 'action_insufficient',
            ingredient_id: ri.ingredient_id,
            details: { action_type: req.action_type, seconds: effectiveSeconds, min: req.duration_min, plate_order: ri.plate_order },
          });
        }
        if (req.duration_max != null && effectiveSeconds > req.duration_max) {
          errors.push({
            type: 'action_excessive',
            ingredient_id: ri.ingredient_id,
            details: { action_type: req.action_type, seconds: effectiveSeconds, max: req.duration_max, plate_order: ri.plate_order },
          });
        }
      }
    }
  }

  // 7. 전체 완성 판정
  // 모든 recipeIngredients(데코 포함)가 매칭되고 오류가 0개여야 isComplete
  // 같은 재료가 여러 plate_order에 있으면 각 plate_order마다 인스턴스가 존재해야 함
  const allIngredientsPresent = filtered.every((ri) =>
    inContainer.some((inst) => matchInstanceToRi(inst, ri)),
  );
  const isComplete =
    confirmedPlateOrder >= maxRecipePlateOrder &&
    errors.length === 0 &&
    allIngredientsPresent;

  return { isComplete, errors, checkedUpToPlateOrder: confirmedPlateOrder };
}
