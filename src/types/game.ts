import type { RecipeErrorType, LocationType, RecipeIngredient } from './db';

// 뷰포트 시점 위치
export type ViewPosition = 'left' | 'center' | 'right';

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

/** 웍 사용 차단 사유 (sink/dirty/burned) */
export type WokBlockedReason = 'at_sink' | 'dirty' | 'burned';

/** 그릇 투입 액션 거부 시 팝업이 표시할 정보 */
export interface RejectionInfo {
  recipeName: string;
  /** 이번 액션에서 그릇으로 들어가려던 재료 묶음 (UI 표시용) */
  attemptingItems: Array<{
    ingredientId: string;
    quantity: number;
  }>;
  /** ingredient_id → 오류 목록 */
  errorsByIngredientId: Map<string, RecipeError[]>;
  /** 차단성 사유 (헤더 메시지 결정) */
  blockReason: 'wrong_container' | 'unexpected_ingredient' | 'plate_order_mismatch';
  /** 콜아웃에 표시할 누락 재료 (이번 액션 plate_order 그룹) */
  missingForThisAction: RecipeIngredient[];
  /** 비교용: 이 그릇에 들어가야 할 올바른 레시피 (필터링 결과, plate_order 오름차순) */
  correctRecipe: RecipeIngredient[];
}

// ——— 패널 시스템 ————————————————————————————————

// 패널 시스템 모드
export type PanelMode = 'edit' | 'preview';

// 장비 인터랙션 상태 (미리보기/인게임용)
export interface EquipmentInteractionState {
  drawers: Record<string, { isOpen: boolean }>;
  burners: Record<string, { fireLevel: 0 | 1 | 2 }>;
  baskets: Record<string, { isExpanded: boolean }>;
  foldFridges: Record<string, { isOpen: boolean }>;
  fourBoxFridges: Record<string, { topOpen: boolean; bottomOpen: boolean }>;
}

// ——— 장비 config 상세 타입 ————————————————————————————

export interface GridCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  ingredientId: string | null;
  bindGroup?: string | null;
}

export interface GridConfig {
  rows: number;
  cols: number;
  cells: GridCell[];
  rowRatios?: number[];
  colRatios?: number[];
}

export interface DrawerConfig {
  grid: GridConfig;
  /** 서랍판(=서랍 그리드) 높이 = 서랍 깊이 (열렸을 때 튀어나오는 거리). 1 초과 허용, 기본 0.5.
   *  eq.height(서랍 face 세로)와는 독립적이다. */
  depth?: number;
}

export interface BasketConfig {
  grid: GridConfig;
}

export interface FridgeInternalItem {
  type: 'basket' | 'ingredient';
  x: number;
  y: number;
  width: number;
  height: number;
  ingredientId?: string | null;
  basketConfig?: BasketConfig | null;
}

export interface FridgePanel {
  level: 1 | 2 | 3 | 4;
  items: FridgeInternalItem[];
}

export interface FoldFridgeConfig {
  panels: FridgePanel[];
}

// ——— config 타입 가드 ————————————————————————————

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isGridCellArray(val: unknown): val is GridCell[] {
  if (!Array.isArray(val)) return false;
  return val.every(
    (c) =>
      isRecord(c) &&
      typeof c.row === 'number' &&
      typeof c.col === 'number' &&
      typeof c.rowSpan === 'number' &&
      typeof c.colSpan === 'number' &&
      (c.ingredientId === null || typeof c.ingredientId === 'string'),
  );
}

function isFiniteNumberArray(arr: unknown): arr is number[] {
  return Array.isArray(arr) && arr.every((v) => typeof v === 'number' && Number.isFinite(v));
}

export function isGridConfig(val: unknown): val is GridConfig {
  if (!isRecord(val)) return false;
  if (typeof val.rows !== 'number' || typeof val.cols !== 'number' || !isGridCellArray(val.cells)) return false;
  if (val.rowRatios !== undefined && !isFiniteNumberArray(val.rowRatios)) return false;
  if (val.colRatios !== undefined && !isFiniteNumberArray(val.colRatios)) return false;
  return true;
}

export function isDrawerConfig(val: unknown): val is DrawerConfig {
  if (!isRecord(val)) return false;
  return isGridConfig(val.grid);
}

export function isBasketConfig(val: unknown): val is BasketConfig {
  if (!isRecord(val)) return false;
  return isGridConfig(val.grid);
}

export function isFoldFridgeConfig(val: unknown): val is FoldFridgeConfig {
  if (!isRecord(val)) return false;
  if (!Array.isArray(val.panels)) return false;
  return val.panels.every(
    (p: unknown) =>
      isRecord(p) &&
      (p.level === 1 || p.level === 2 || p.level === 3 || p.level === 4) &&
      Array.isArray(p.items),
  );
}

// ——— 클릭/선택 인터랙션 시스템 ————————————————————————————

export type SelectionType = 'ingredient' | 'container' | 'wok-content' | 'placed-container';

export interface SelectionState {
  type: SelectionType;
  ingredientId?: string;
  /** 유한 소스(핸드바 등)일 때 출처 인스턴스 ID */
  instanceId?: string;
  containerId?: string;
  containerInstanceId?: string;
  equipmentStateId?: string;
  sourceEquipmentId?: string;
  sourceLabel?: string;
}

export type ClickTargetType =
  | 'ingredient-source'
  | 'container-source'
  | 'hologram'
  | 'placed-container'
  | 'handbar'
  | 'worktop'
  | 'burner'
  | 'sink'
  | 'serve-button'
  | 'equipment-toggle'
  | 'empty-area'
  | 'hud-area';

export interface ClickTarget {
  type: ClickTargetType;
  equipmentId?: string;
  equipmentType?: string;
  ingredientId?: string;
  containerInstanceId?: string;
  containerId?: string;
  equipmentStateId?: string;
  localRatio?: { x: number; y: number };
  /** serve-button 전용: 서빙할 주문 id */
  orderId?: string;
}

export type ResolvedActionType =
  | 'select'
  | 'deselect'
  | 'toggle-equipment'
  | 'add-ingredient'
  | 'pour'
  | 'place-container'
  | 'move-container'
  | 'merge-containers'
  | 'dispose'
  | 'move-wok-to-sink'
  | 'serve-order';

export interface ResolvedAction {
  type: ResolvedActionType;
  selectionType?: SelectionType;
  ingredientId?: string;
  containerId?: string;
  containerInstanceId?: string;
  equipmentId?: string;
  equipmentType?: string;
  equipmentStateId?: string;
  sourceEquipmentId?: string;
  sourceLabel?: string;
  /** 유한 소스(핸드바 등)일 때 출처 인스턴스 ID */
  instanceId?: string;
  localRatio?: { x: number; y: number };
  /** add-ingredient 전용: 투입 목적지 */
  destination?: {
    locationType: LocationType;
    equipmentId?: string;
    containerInstanceId?: string;
  };
  /** pour 전용: 이동 출발지 */
  source?: {
    locationType: LocationType;
    equipmentStateId?: string;
    containerInstanceId?: string;
  };
  /** serve-order 전용: 서빙할 주문 id */
  orderId?: string;
}

// ——— bindGroup 유틸 ————————————————————————————

/** bindGroup이 있으면 앵커(가장 큰 row) 셀 반환, 없으면 null */
export function getBindAnchor(cells: GridCell[], cell: GridCell): GridCell | null {
  if (!cell.bindGroup) return null;
  let anchor: GridCell | null = null;
  for (const c of cells) {
    if (c.bindGroup === cell.bindGroup) {
      if (!anchor || c.row > anchor.row) anchor = c;
    }
  }
  return anchor;
}
