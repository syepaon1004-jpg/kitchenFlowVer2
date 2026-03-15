import { supabase } from '../supabase';
import { ACTION_TYPES } from '../../types/db';
import type { ActionType, StoreIngredient, Container } from '../../types/db';

/* ── Edge Function 응답 타입 ── */

export interface AiRequiredAction {
  action_type: string; // Edge Function은 ActionType보다 넓은 범위 반환
  duration_min: number | null;
  duration_max: number | null;
}

export interface AiIngredient {
  matched_ingredient_id: string | null;
  raw_name: string;
  quantity: number;
  unit: 'g' | 'ml' | 'ea' | 'spoon' | 'portion' | 'pinch' | 'handful' | 'ladle' | 'spatula';
  required_actions: AiRequiredAction[];
  plate_order: number;
  is_deco?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface AiTargetContainer {
  matched_container_id: string | null;
  raw_name: string;
}

export interface AnalyzeRecipeResponse {
  ingredients: AiIngredient[];
  target_container: AiTargetContainer;
}

/* ── 요청 타입 ── */

interface AnalyzeRecipeRequest {
  natural_text: string;
  store_ingredients: StoreIngredient[];
  containers: Container[];
}

/* ── 메인 함수 ── */

export async function analyzeRecipe(
  req: AnalyzeRecipeRequest,
): Promise<AnalyzeRecipeResponse> {
  const { data, error } = await supabase.functions.invoke('analyze-recipe', {
    body: {
      natural_text: req.natural_text,
      store_ingredients: req.store_ingredients,
      containers: req.containers,
    },
  });

  if (error) {
    throw new Error(`AI 분석 실패: ${error.message}`);
  }

  if (!data || !Array.isArray(data.ingredients)) {
    throw new Error('AI 응답 형식이 올바르지 않습니다.');
  }

  return data as AnalyzeRecipeResponse;
}

/* ── ActionType 매핑 헬퍼 ── */

export function toValidActionType(
  action: string | null | undefined,
): ActionType | null {
  if (!action) return null;
  return (ACTION_TYPES as readonly string[]).includes(action) ? (action as ActionType) : null;
}
