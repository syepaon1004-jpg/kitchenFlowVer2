// Practice 도메인 TS 계약 (sim 분리).
// supabase/migrations/008_practice_schema.sql 13 테이블과 1:1.

// ——— 메뉴 / 위치 ————————————————————————————————

export interface PracticeMenu {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

export interface PracticeLocation {
  id: string;
  menu_id: string;
  label: string;
  loc_key: string;
}

// ——— 레시피 노드 ————————————————————————————————

export type PracticeNodeType = 'ingredient' | 'action';

export interface PracticeRecipeNode {
  id: string;
  menu_id: string;
  node_type: PracticeNodeType;
  step_no: number;
}

export interface PracticeIngredientNode {
  // PK = practice_recipe_nodes.id. child 테이블은 별도 id 없음.
  node_id: string;
  ingredient_id: string;
  is_deco: boolean;
  quantity: number;
}

export const PRACTICE_ACTION_TYPES = ['fry', 'stir', 'microwave', 'boil'] as const;
export type PracticeActionType = (typeof PRACTICE_ACTION_TYPES)[number];

export interface PracticeActionNode {
  node_id: string;
  action_type: PracticeActionType;
  location_id: string;
  duration_sec: number | null;
}

export interface PracticeNodeLocationPath {
  node_id: string;
  seq: number;
  location_id: string;
}

// ——— 학습 단위 / 암묵지 ————————————————————————————

export interface PracticeStepGroup {
  id: string;
  menu_id: string;
  display_step_no: number;
  title: string;
  summary: string | null;
  primary_location_id: string | null;
}

export interface PracticeStepGroupNode {
  step_group_id: string;
  node_id: string;
}

export const PRACTICE_TACIT_TYPES = ['observe', 'adjust', 'warning', 'reason', 'media'] as const;
export type PracticeTacitType = (typeof PRACTICE_TACIT_TYPES)[number];

export interface PracticeTacitItem {
  id: string;
  step_group_id: string;
  tacit_type: PracticeTacitType;
  title: string;
  body: string | null;
  sort_order: number;
  flame_level: string | null;
  color_note: string | null;
  viscosity_note: string | null;
  sound_note: string | null;
  texture_note: string | null;
  timing_note: string | null;
}

export const PRACTICE_TACIT_MEDIA_TYPES = ['image', 'video'] as const;
export type PracticeTacitMediaType = (typeof PRACTICE_TACIT_MEDIA_TYPES)[number];

export interface PracticeTacitMedia {
  id: string;
  tacit_item_id: string;
  media_type: PracticeTacitMediaType;
  url: string;
  sort_order: number;
}

// ——— 세션 런타임 ————————————————————————————————

export type PracticeSessionStatus = 'active' | 'completed' | 'abandoned';

export interface PracticeSession {
  id: string;
  menu_id: string;
  store_id: string;
  store_user_id: string; // store_users.id (D3)
  status: PracticeSessionStatus;
  started_at: string;
  completed_at: string | null;
}

export interface PracticeIngredientInstance {
  id: string;
  session_id: string;
  node_id: string; // practice_ingredient_nodes(node_id)만 참조. action node 참조 불가.
  actual_location_id: string;
  current_required_location_id: string;
  is_satisfied: boolean;
}

export interface PracticeNodeProgress {
  id: string;
  session_id: string;
  node_id: string; // ingredient + action 모두 추적하므로 recipe_nodes.id 참조
  is_satisfied: boolean;
  satisfied_at: string | null;
}

// ——— 합성 VO (queries JOIN 결과) ————————————————————

export interface PracticeIngredientNodeWithPath {
  node: PracticeRecipeNode;
  ingredient: PracticeIngredientNode;
  location_path: PracticeNodeLocationPath[]; // seq ASC
}

export interface PracticeActionNodeWithLocation {
  node: PracticeRecipeNode;
  action: PracticeActionNode;
}

export interface PracticeMenuBundle {
  menu: PracticeMenu;
  locations: PracticeLocation[];
  ingredient_nodes: PracticeIngredientNodeWithPath[];
  action_nodes: PracticeActionNodeWithLocation[];
  step_groups: PracticeStepGroup[];
  step_group_nodes: PracticeStepGroupNode[];
  tacit_items: PracticeTacitItem[];
  tacit_media: PracticeTacitMedia[];
}
