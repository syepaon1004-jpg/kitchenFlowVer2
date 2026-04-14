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
  auth_user_id: string | null;
  invited_email: string | null;
  deleted_at: string | null;
}

export interface SectionConfig {
  boundaries: number[];  // 0~1 비율, N+1개 (N섹션)
  walls: number[];       // 벽 섹션 번호 (1-indexed)
}

export interface BillQueueArea {
  x: number;  // 이미지 좌측 기준 비율 (0~1)
  y: number;  // 이미지 상단 기준 비율 (0~1)
  w: number;  // 이미지 대비 너비 비율 (0~1)
  h: number;  // 이미지 대비 높이 비율 (0~1)
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
  bill_queue_areas: BillQueueArea[] | null;
}

export interface StoreIngredient {
  id: string;
  store_id: string;
  master_id: string;
  display_name: string;
  state_label: string | null;
  unit: 'g' | 'ml' | 'ea' | 'spoon' | 'portion' | 'pinch' | 'handful' | 'ladle' | 'spatula';
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
  category: string | null;
  natural_text: string | null;
}

export const ACTION_TYPES = ['stir', 'fry', 'microwave', 'boil', 'mix'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface RequiredAction {
  action_type: ActionType;
  duration_min: number | null;
  duration_max: number | null;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  is_deco: boolean;
  plate_order: number;
  target_container_id: string | null;
  required_actions: RequiredAction[] | null;
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
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export type WokStatus = 'clean' | 'dirty' | 'burned' | 'overheating';
export type BasketStatus = 'up' | 'down';
export type MwStatus = 'idle' | 'running' | 'done';

export interface GameEquipmentState {
  id: string;
  session_id: string;
  equipment_type: EquipmentType;
  equipment_index: number;
  panel_equipment_id: string | null;
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
  /** 올려놓인 장비 panel_equipment.id (Zustand 런타임 전용) */
  placed_equipment_id: string | null;
  /** 장비 내 로컬 X (0~1) */
  placed_local_x: number | null;
  /** 장비 내 로컬 Y (0~1) */
  placed_local_y: number | null;
}

// ——— 점수/로그 계층 ———————————————————————————————

// 액션 로그 타입
export type ActionLogType =
  | 'navigate_open' | 'drag_start' | 'drop_success'
  | 'stir'
  | 'basket_down' | 'basket_up'
  | 'serve' | 'dispose' | 'wok_burned'
  | 'click_add_ingredient'
  | 'click_place_container' | 'click_move_container'
  | 'click_pour' | 'click_merge_containers'
  | 'click_dispose';

export interface GameActionLog {
  id: string;
  session_id: string;
  action_type: ActionLogType;
  timestamp_ms: number;
  metadata: Record<string, unknown>;
}

// 점수 이벤트 타입
export type ScoreEventType =
  | 'fast_serve' | 'slow_serve' | 'very_slow_serve'
  | 'dispose' | 'wok_burned'
  | 'short_idle' | 'long_idle'
  | 'redundant_nav';

export interface GameScoreEvent {
  id: string;
  session_id: string;
  event_type: ScoreEventType;
  points: number;
  timestamp_ms: number;
  metadata: Record<string, unknown>;
}

// 레시피 오류 타입
export type RecipeErrorType =
  | 'missing_ingredient' | 'unexpected_ingredient'
  | 'quantity_error' | 'action_insufficient' | 'action_excessive'
  | 'plate_order_mismatch' | 'wrong_container';

export interface GameRecipeError {
  id: string;
  session_id: string;
  order_id: string;
  recipe_id: string;
  error_type: RecipeErrorType;
  details: Record<string, unknown>;
  timestamp_ms: number;
}

// 레시피별 결과
export interface GameRecipeResult {
  id: string;
  session_id: string;
  order_id: string;
  recipe_id: string;
  is_success: boolean;
  error_count: number;
  serve_time_ms: number | null;
  created_at: string;
}

// AI 피드백
export interface GameAiFeedback {
  id: string;
  session_id: string;
  feedback_text: string;
  created_at: string;
}

// ——— 패널 시스템 계층 ————————————————————————————

export type PanelEquipmentType = 'drawer' | 'fold_fridge' | 'four_box_fridge' | 'basket' | 'burner' | 'sink' | 'worktop' | 'shelf';

export interface PanelLayout {
  id: string;
  store_id: string;
  row_index: number;
  background_image_url: string | null;
  panel_heights: number[];
  perspective_deg: number;
  preview_y_offset: number;
  created_at: string;
  updated_at: string;
}

export interface PanelEquipment {
  id: string;
  layout_id: string;
  panel_number: 1 | 2 | 3;
  equipment_type: PanelEquipmentType;
  x: number;
  y: number;
  width: number;
  height: number;
  equipment_index: number;
  config: Record<string, unknown>;
  placeable: boolean;
  sort_order: number;
  created_at: string;
}

export type PanelItemType = 'ingredient' | 'container';

export interface PanelItem {
  id: string;
  layout_id: string;
  panel_number: 1 | 2 | 3;
  item_type: PanelItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  ingredient_id: string | null;
  container_id: string | null;
  sort_order: number;
  created_at: string;
}

// ——— 섹션 그리드 시스템 ————————————————————————————

export interface SectionGrid {
  id: string;
  store_id: string;
  grid_rows: number;
  grid_cols: number;
  created_at: string;
  updated_at: string;
}

export interface SectionCell {
  id: string;
  store_id: string;
  section_number: number;
  row_index: number;
  col_index: number;
  rep_equipment_type: string | null;
  rep_equipment_index: number | null;
  created_at: string;
}
