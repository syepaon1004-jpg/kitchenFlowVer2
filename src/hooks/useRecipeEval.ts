import { useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { evaluateContainer } from '../lib/recipe/evaluate';
import { useGameStore } from '../stores/gameStore';
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

  return { loadRecipes, evaluate, evaluateAll, getRecipeName, getRecipeIngredients };
}
