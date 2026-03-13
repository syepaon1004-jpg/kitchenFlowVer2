import { useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { evaluateContainer } from '../lib/recipe/evaluate';
import { useGameStore } from '../stores/gameStore';
import { useScoringStore } from '../stores/scoringStore';
import type { Recipe, RecipeIngredient } from '../types/db';

interface RecipeCache {
  recipes: Map<string, Recipe>;
  recipeIngredients: Map<string, RecipeIngredient[]>;
  loaded: boolean;
}



export function useRecipeEval(storeId: string) {
  const cacheRef = useRef<RecipeCache>({
    recipes: new Map(),
    recipeIngredients: new Map(),
    loaded: false,
  });

  const loadRecipes = useCallback(async () => {
    if (cacheRef.current.loaded) return;

    const [recipesRes, riRes] = await Promise.all([
      supabase.from('recipes').select('*').eq('store_id', storeId),
      supabase.from('recipe_ingredients').select('*'),
    ]);

    if (recipesRes.data) {
      const map = new Map<string, Recipe>();
      for (const r of recipesRes.data as Recipe[]) {
        map.set(r.id, r);
      }
      cacheRef.current.recipes = map;
    }

    if (riRes.data) {
      const map = new Map<string, RecipeIngredient[]>();
      for (const ri of riRes.data as RecipeIngredient[]) {
        const arr = map.get(ri.recipe_id) ?? [];
        arr.push(ri);
        map.set(ri.recipe_id, arr);
      }
      cacheRef.current.recipeIngredients = map;
    }

    cacheRef.current.loaded = true;
  }, [storeId]);

  const evaluate = useCallback((containerInstanceId: string): boolean => {
    const { containerInstances, ingredientInstances, orders, markContainerComplete } =
      useGameStore.getState();

    const ci = containerInstances.find((c) => c.id === containerInstanceId);
    if (!ci || !ci.assigned_order_id || ci.is_complete) return ci?.is_complete ?? false;

    const order = orders.find((o) => o.id === ci.assigned_order_id);
    if (!order) return false;

    const recipe = cacheRef.current.recipes.get(order.recipe_id);
    if (!recipe) return false;

    const recipeIngredients = cacheRef.current.recipeIngredients.get(recipe.id) ?? [];
    const inContainer = ingredientInstances.filter(
      (i) => i.container_instance_id === containerInstanceId && i.location_type === 'container',
    );

    const result = evaluateContainer(inContainer, recipeIngredients, recipe, ci.container_id);

    // errors가 있으면 scoringStore에 기록 (중복 방지)
    if (result.errors.length > 0) {
      const { addRecipeError, recipeErrors } = useScoringStore.getState();
      const sessionId = useGameStore.getState().sessionId;

      for (const error of result.errors) {
        // 중복 판별: order_id + error_type + ingredient_id 조합
        const isDuplicate = recipeErrors.some(
          (existing) =>
            existing.order_id === ci.assigned_order_id &&
            existing.error_type === error.type &&
            (error.ingredient_id
              ? existing.details.ingredient_id === error.ingredient_id
              : true),
        );
        if (!isDuplicate) {
          addRecipeError({
            session_id: sessionId!,
            order_id: ci.assigned_order_id!,
            recipe_id: order.recipe_id,
            error_type: error.type,
            details: { ...error.details, ingredient_id: error.ingredient_id },
            timestamp_ms: Date.now(),
          });
        }
      }
    }

    if (result.isComplete) {
      markContainerComplete(containerInstanceId);
    }

    return result.isComplete;
  }, []);

  const evaluateAll = useCallback(() => {
    if (!cacheRef.current.loaded) return;

    const { containerInstances, ingredientInstances } = useGameStore.getState();

    const containerIdsWithIngredients = new Set(
      ingredientInstances
        .filter((i) => i.location_type === 'container' && i.container_instance_id)
        .map((i) => i.container_instance_id!),
    );

    for (const ci of containerInstances) {
      if (ci.is_complete) continue;
      if (!ci.assigned_order_id) continue;
      if (!containerIdsWithIngredients.has(ci.id)) continue;
      evaluate(ci.id);
    }
  }, [evaluate]);

  const getRecipeName = useCallback((recipeId: string): string => {
    return cacheRef.current.recipes.get(recipeId)?.name ?? '알 수 없음';
  }, []);

  const getRecipeIngredients = useCallback((recipeId: string): RecipeIngredient[] => {
    return cacheRef.current.recipeIngredients.get(recipeId) ?? [];
  }, []);

  const getRecipeNaturalText = useCallback((recipeId: string): string | null => {
    return cacheRef.current.recipes.get(recipeId)?.natural_text ?? null;
  }, []);

  return { loadRecipes, evaluate, evaluateAll, getRecipeName, getRecipeIngredients, getRecipeNaturalText };
}
