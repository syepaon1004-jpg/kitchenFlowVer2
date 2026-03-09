// ——— 정적 계층 ————————————————————————————————
export interface IngredientsMaster {
  id: string;
  name: string;
}

// ——— 설정 계층 ————————————————————————————————
export interface Store {
  id: string;
  name: string;
  code: string;
}

export interface StoreUser {
  id: string;
  store_id: string;
  name: string;
  avatar_key: string;
  role: 'admin' | 'staff';
}

export interface SectionConfig {
  boundaries: number[];  // 0~1 비율, N+1개 (N섹션)
  walls: number[];       // 벽 섹션 번호 (1-indexed)
}

export interface KitchenZone {
  id: string;
  store_id: string;
  zone_key: string;
  label: string;
  image_url: string | null;
  image_width: number;
  image_height: number;
  section_config: SectionConfig | null;
}

export interface StoreIngredient {
  id: string;
  store_id: string;
  master_id: string;
  display_name: string;
  state_label: string | null;
  unit: 'g' | 'ml' | 'ea' | 'spoon' | 'portion' | 'pinch';
  default_quantity: number;
  image_url: string | null;
}

export interface Container {
  id: string;
  store_id: string;
  name: string;
  container_type: 'bowl' | 'plate' | 'pot' | 'box';
  image_url: string | null;
}

export type AreaType = 'ingredient' | 'container' | 'navigate' | 'equipment' | 'basket';
export type EquipmentType = 'wok' | 'frying_basket' | 'microwave' | 'sink';
export type HitboxPoint = [number, number];

export interface AreaDefinition {
  id: string;
  store_id: string;
  zone_id: string;
  label: string;
  area_type: AreaType;
  x: number;   // 0~1 비율
  y: number;   // 0~1 비율
  w: number;   // 0~1 비율
  h: number;   // 0~1 비율
  points: HitboxPoint[] | null;
  ingredient_id: string | null;
  container_id: string | null;
  navigate_zone_id: string | null;
  equipment_type: EquipmentType | null;
  equipment_index: number | null;
  drag_image_url: string | null;
  overlay_image_url: string | null;
  parent_area_id: string | null;
  sort_order: number;
}

export interface Recipe {
  id: string;
  store_id: string;
  name: string;
  target_container_id: string | null;
}

export const ACTION_TYPES = ['stir', 'fry', 'microwave', 'boil', 'mix'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  quantity_tolerance: number; // default 0.1
  plate_order: number;
  required_action_type: ActionType | null;
  required_duration_min: number | null;
  required_duration_max: number | null;
}

/**
 * step_order 0 = 빈 접시 이미지 (재료 없는 초기 상태)
 * step_order N = 그릇 내 재료 plate_order 최댓값이 N일 때 표시할 이미지
 */
export interface RecipeStep {
  id: string;
  recipe_id: string;
  store_id: string;
  step_order: number;
  image_url: string;
}

// ——— 런타임 계층 ———————————————————————————————
export interface GameSession {
  id: string;
  store_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  score: number | null;
  status: 'active' | 'completed' | 'abandoned';
  active_recipe_ids: string[] | null;
}

export interface GameOrder {
  id: string;
  session_id: string;
  recipe_id: string;
  order_sequence: number;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
}

export type WokStatus = 'clean' | 'dirty' | 'burned' | 'overheating';
export type BasketStatus = 'up' | 'down';
export type MwStatus = 'idle' | 'running' | 'done';

export interface GameEquipmentState {
  id: string;
  session_id: string;
  equipment_type: EquipmentType;
  equipment_index: number;
  // 웍
  wok_status: WokStatus | null;
  wok_temp: number | null;
  burner_level: 0 | 1 | 2 | 3 | null;
  // 튀김채
  basket_status: BasketStatus | null;
  basket_ingredient_ids: string[] | null;
  // 전자레인지
  mw_status: MwStatus | null;
  mw_remaining_sec: number | null;
}

export type LocationType = 'zone' | 'equipment' | 'container' | 'hand' | 'disposed';

export interface ActionHistoryEntry {
  actionType: ActionType;
  seconds: number;
}

export interface GameIngredientInstance {
  id: string;
  session_id: string;
  ingredient_id: string;
  quantity: number;
  location_type: LocationType;
  zone_id: string | null;
  equipment_state_id: string | null;
  container_instance_id: string | null;
  action_history: ActionHistoryEntry[];
  plate_order: number | null;
}

export interface GameContainerInstance {
  id: string;
  session_id: string;
  container_id: string;
  assigned_order_id: string | null;
  is_complete: boolean;
  is_served: boolean;
  current_plate_order: number;
  is_dirty: boolean;
}
