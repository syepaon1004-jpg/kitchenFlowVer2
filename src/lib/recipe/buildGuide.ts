import type { GameIngredientInstance, Recipe, RecipeIngredient } from '../../types/db';
import type {
  ContainerGuideData,
  ContainerGuideStep,
  ContainerGuideBlocker,
  RecipeError,
} from '../../types/game';
import { evaluateContainer } from './evaluate';

/**
 * 그릇 가이드 팝오버용 데이터 구성.
 * evaluateContainer 결과를 단계별 요약 + 블로커 리스트로 가공한다.
 * 순수 함수 — store 접근 없음, 부작용 없음.
 */
export function buildContainerGuide(
  inContainer: GameIngredientInstance[],
  recipeIngredients: RecipeIngredient[],
  recipe: Recipe,
  containerTypeId: string,
  recipeName: string,
  peerContainersAllComplete: boolean,
): ContainerGuideData {
  const evalResult = evaluateContainer(inContainer, recipeIngredients, recipe, containerTypeId);

  const filtered = recipeIngredients.filter((ri) => {
    if (ri.target_container_id != null) return ri.target_container_id === containerTypeId;
    return recipe.target_container_id === containerTypeId || recipe.target_container_id === null;
  });

  if (filtered.length === 0) {
    return {
      recipeName,
      isComplete: false,
      blockers: [{ kind: 'wrong_container' }],
      steps: [],
    };
  }

  const nonDeco = filtered.filter((r) => !r.is_deco);
  const decoIngredients = filtered.filter((r) => r.is_deco);
  const maxRecipePlateOrder = nonDeco.length > 0 ? Math.max(...nonDeco.map((r) => r.plate_order)) : 0;

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

  const confirmedPlateOrder = evalResult.checkedUpToPlateOrder;

  const plateOrders = Array.from(new Set(nonDeco.map((r) => r.plate_order))).sort((a, b) => a - b);
  const steps: ContainerGuideStep[] = [];

  for (const po of plateOrders) {
    const group = filtered.filter((r) => !r.is_deco && r.plate_order === po);
    let status: ContainerGuideStep['status'];
    if (po <= confirmedPlateOrder) {
      status = 'done';
    } else if (po <= currentMaxPlateOrder + 1) {
      status = 'in_progress';
    } else {
      status = 'pending';
    }

    steps.push({
      plateOrder: po,
      status,
      ingredients: group.map((ri) => buildIngredientEntry(ri, inContainer, evalResult.errors, false)),
    });
  }

  if (decoIngredients.length > 0) {
    const allDecoPresent = decoIngredients.every((ri) =>
      inContainer.some((i) => i.ingredient_id === ri.ingredient_id),
    );
    const decoStatus: ContainerGuideStep['status'] =
      confirmedPlateOrder >= maxRecipePlateOrder
        ? allDecoPresent
          ? 'done'
          : 'in_progress'
        : 'pending';
    steps.push({
      plateOrder: maxRecipePlateOrder + 1,
      status: decoStatus,
      ingredients: decoIngredients.map((ri) => buildIngredientEntry(ri, inContainer, evalResult.errors, true)),
    });
  }

  const blockers: ContainerGuideBlocker[] = [];

  if (confirmedPlateOrder < maxRecipePlateOrder) {
    const nextPo =
      currentMaxPlateOrder === 0
        ? plateOrders[0] ?? 1
        : currentMaxPlateOrder + (currentMaxPlateOrder > confirmedPlateOrder ? 0 : 1);
    blockers.push({ kind: 'steps_remaining', nextPlateOrder: nextPo });
  }

  const existingErrors = evalResult.errors.filter(
    (e) =>
      e.type === 'quantity_error' ||
      e.type === 'action_insufficient' ||
      e.type === 'action_excessive',
  );
  if (existingErrors.length > 0) {
    blockers.push({ kind: 'existing_errors', errors: existingErrors });
  }

  if (confirmedPlateOrder >= maxRecipePlateOrder && decoIngredients.length > 0) {
    const missingDeco = decoIngredients
      .filter((ri) => !inContainer.some((i) => i.ingredient_id === ri.ingredient_id))
      .map((ri) => ri.ingredient_id);
    if (missingDeco.length > 0) {
      blockers.push({ kind: 'deco_missing', ingredientIds: missingDeco });
    }
  }

  if (evalResult.isComplete && !peerContainersAllComplete) {
    blockers.push({ kind: 'peer_containers_incomplete', peerCount: 0 });
  }

  return {
    recipeName,
    isComplete: evalResult.isComplete,
    blockers,
    steps,
  };
}

function buildIngredientEntry(
  ri: RecipeIngredient,
  inContainer: GameIngredientInstance[],
  errors: RecipeError[],
  isDeco: boolean,
) {
  const inst = inContainer.find((i) => i.ingredient_id === ri.ingredient_id);
  return {
    ingredientId: ri.ingredient_id,
    requiredQuantity: ri.quantity,
    currentQuantity: inst ? inst.quantity : null,
    isDeco,
    errors: errors.filter((e) => e.ingredient_id === ri.ingredient_id && isInstanceError(e)),
  };
}

function isInstanceError(e: RecipeError): boolean {
  return (
    e.type === 'quantity_error' ||
    e.type === 'action_insufficient' ||
    e.type === 'action_excessive' ||
    e.type === 'plate_order_mismatch' ||
    e.type === 'unexpected_ingredient'
  );
}

/**
 * 레시피 자체만 기반으로 그릇별 가이드 데이터를 구성한다 (실투입 상태 미반영).
 * - target_container_id(재료별 지정 > 레시피 기본값) 기준으로 그릇 그룹화
 * - 모든 단계 status는 'pending', currentQuantity는 null, errors는 빈 배열
 * - blockers/isComplete는 비움 — 주문 칩 클릭 드롭다운(레시피 개요용).
 */
export function buildRecipeGuidePerContainer(
  recipe: Recipe,
  recipeIngredients: RecipeIngredient[],
): Array<{ containerTypeId: string; data: ContainerGuideData }> {
  const groups = new Map<string, RecipeIngredient[]>();
  const order: string[] = [];

  for (const ri of recipeIngredients) {
    const cid = ri.target_container_id ?? recipe.target_container_id;
    if (!cid) continue;
    if (!groups.has(cid)) {
      groups.set(cid, []);
      order.push(cid);
    }
    groups.get(cid)!.push(ri);
  }

  if (recipe.target_container_id) {
    const primary = recipe.target_container_id;
    const idx = order.indexOf(primary);
    if (idx > 0) {
      order.splice(idx, 1);
      order.unshift(primary);
    }
  }

  const result: Array<{ containerTypeId: string; data: ContainerGuideData }> = [];

  for (const cid of order) {
    const items = groups.get(cid)!;
    const nonDeco = items.filter((r) => !r.is_deco);
    const decoItems = items.filter((r) => r.is_deco);
    const maxPlateOrder = nonDeco.length > 0 ? Math.max(...nonDeco.map((r) => r.plate_order)) : 0;
    const plateOrders = Array.from(new Set(nonDeco.map((r) => r.plate_order))).sort((a, b) => a - b);

    const steps: ContainerGuideStep[] = [];
    for (const po of plateOrders) {
      const group = nonDeco.filter((r) => r.plate_order === po);
      steps.push({
        plateOrder: po,
        status: 'pending',
        ingredients: group.map((ri) => ({
          ingredientId: ri.ingredient_id,
          requiredQuantity: ri.quantity,
          currentQuantity: null,
          isDeco: false,
          errors: [],
        })),
      });
    }

    if (decoItems.length > 0) {
      steps.push({
        plateOrder: maxPlateOrder + 1,
        status: 'pending',
        ingredients: decoItems.map((ri) => ({
          ingredientId: ri.ingredient_id,
          requiredQuantity: ri.quantity,
          currentQuantity: null,
          isDeco: true,
          errors: [],
        })),
      });
    }

    result.push({
      containerTypeId: cid,
      data: {
        recipeName: recipe.name,
        isComplete: false,
        blockers: [],
        steps,
      },
    });
  }

  return result;
}
