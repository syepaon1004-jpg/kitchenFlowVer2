import type { RecipeErrorType } from './db';

// 뷰포트 시점 위치
export type ViewPosition = 'left' | 'center' | 'right';

// 드래그 중인 아이템 메타
export interface DragMeta {
  type: 'ingredient' | 'container' | 'equipment';
  sourceAreaId?: string;
  ingredientId?: string;
  ingredientInstanceId?: string;
  containerId?: string;
  containerInstanceId?: string;
  equipmentType?: string;
  equipmentStateId?: string;
  dragImageUrl?: string | null;
}

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
