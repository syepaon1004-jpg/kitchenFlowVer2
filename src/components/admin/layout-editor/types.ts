import type { PanelLayout, PanelEquipment, PanelEquipmentType, PanelItem, PanelItemType, ImageFitMode } from '../../../types/db';
import type { PanelMode } from '../../../types/game';
import { normalizeOversizedY, clampEquipmentHeight } from '../../../lib/equipment-position';

// Re-export for convenience within layout-editor components
export type { PanelLayout, PanelEquipment, PanelEquipmentType, PanelMode, PanelItem, PanelItemType, ImageFitMode };

// 편집기 로컬 상태
export interface LayoutEditorState {
  mode: PanelMode;
  layout: PanelLayout | null;
  equipment: PanelEquipment[];
  loading: boolean;
  error: string | null;
}

// 기본값 (DB에 데이터 없을 때)
export const DEFAULT_PANEL_HEIGHTS: number[] = [0.3, 0.4, 0.3];
export const DEFAULT_PERSPECTIVE_DEG = 45;
export const DEFAULT_PREVIEW_Y_OFFSET = 0.5;
/**
 * 신규 행 레이아웃의 기본 핏 모드. 'natural' = 원본 비율 유지 + 방향키 스크롤.
 * (DB 컬럼 DEFAULT는 'cover'로 두어 기존 매장의 시각 회귀를 방지하고,
 *  신규 레코드는 애플리케이션에서 이 값을 명시적으로 전송한다.)
 */
export const DEFAULT_IMAGE_FIT_MODE: ImageFitMode = 'natural';

/** 기존 매장(마이그레이션) 폴백값 — fetch 시점에 image_fit_mode가 빠져있을 때 사용 */
export const LEGACY_IMAGE_FIT_MODE: ImageFitMode = 'cover';

// ——— 장비 편집 로컬 타입 ———

/** 편집 중 로컬 장비 (DB의 PanelEquipment와 1:1, 임시 id 지원) */
export interface LocalEquipment {
  id: string;
  panelIndex: number; // 0, 1, 2
  equipmentType: PanelEquipmentType;
  x: number;          // 패널 기준 비율 0~1
  y: number;
  width: number;
  height: number;
  equipmentIndex: number;
  config: Record<string, unknown>;
  placeable: boolean;
  sortOrder: number;
}

/** 장비 기본 크기 (패널 기준 비율) */
export const EQUIPMENT_DEFAULTS: Record<PanelEquipmentType, { width: number; height: number }> = {
  drawer: { width: 0.25, height: 0.4 },
  fold_fridge: { width: 0.25, height: 0.5 },
  four_box_fridge: { width: 0.25, height: 1.0 },
  basket: { width: 0.15, height: 0.3 },
  burner: { width: 0.15, height: 0.3 },
  sink: { width: 0.2, height: 0.35 },
  worktop: { width: 0.3, height: 0.25 },
  shelf: { width: 0.3, height: 0.15 },
  filler_panel: { width: 0.25, height: 0.3 },
};

/** 장비 한글 라벨 */
export const EQUIPMENT_LABELS: Record<PanelEquipmentType, string> = {
  drawer: '서랍',
  fold_fridge: '폴드 냉장고',
  four_box_fridge: '4호박스',
  basket: '바구니',
  burner: '화구',
  sink: '씽크대',
  worktop: '작업대',
  shelf: '선반',
  filler_panel: '필러패널',
};

/** 장비 외형 색상 (편집 모드용) */
export const EQUIPMENT_COLORS: Record<PanelEquipmentType, string> = {
  drawer: '#C0C0C0',
  fold_fridge: '#C0C0C0',
  four_box_fridge: '#C0C0C0',
  basket: 'transparent',
  burner: '#888888',
  sink: '#6699CC',
  worktop: '#A0845C',
  shelf: '#8B7355',
  filler_panel: 'var(--color-filler-panel)',
};

/** DB PanelEquipment → LocalEquipment 변환 */
export function dbToLocalEquipment(eq: PanelEquipment): LocalEquipment {
  return {
    id: eq.id,
    panelIndex: eq.panel_number - 1, // DB: 1,2,3 → 내부: 0,1,2
    equipmentType: eq.equipment_type,
    x: eq.x,
    y: normalizeOversizedY(eq.y, eq.height),
    width: eq.width,
    height: eq.height,
    equipmentIndex: eq.equipment_index,
    config: eq.config,
    placeable: eq.placeable,
    sortOrder: eq.sort_order,
  };
}

/** 0~1 범위 클램프 (DB CHECK 제약 준수) */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 0 초과 ~ 1 이하 클램프 (width/height는 > 0 필수) */
function clampSize(v: number): number {
  return Math.max(0.001, Math.min(1, v));
}

// ——— 아이템 (재료/그릇) 로컬 타입 ———

/** 편집 중 로컬 아이템 (DB의 PanelItem와 1:1, 임시 id 지원) */
export interface LocalItem {
  id: string;
  panelIndex: number; // 0, 1, 2
  itemType: PanelItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  ingredientId: string | null;
  containerId: string | null;
  sortOrder: number;
}

/** DB PanelItem → LocalItem 변환 */
export function dbToLocalItem(item: PanelItem): LocalItem {
  return {
    id: item.id,
    panelIndex: item.panel_number - 1,
    itemType: item.item_type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    ingredientId: item.ingredient_id,
    containerId: item.container_id,
    sortOrder: item.sort_order,
  };
}

/** LocalItem → DB insert payload 변환 */
export function localItemToDbPayload(
  item: LocalItem,
  layoutId: string,
): Record<string, unknown> {
  return {
    layout_id: layoutId,
    panel_number: item.panelIndex + 1,
    item_type: item.itemType,
    x: clamp01(item.x),
    y: clamp01(item.y),
    width: clampSize(item.width),
    height: clampSize(item.height),
    ingredient_id: item.ingredientId,
    container_id: item.containerId,
    sort_order: item.sortOrder,
  };
}

/** LocalEquipment → DB insert payload 변환 */
export function localToDbPayload(
  eq: LocalEquipment,
  layoutId: string,
): Record<string, unknown> {
  return {
    layout_id: layoutId,
    panel_number: eq.panelIndex + 1, // 내부: 0,1,2 → DB: 1,2,3
    equipment_type: eq.equipmentType,
    x: clamp01(eq.x),
    y: clamp01(normalizeOversizedY(eq.y, eq.height)),
    width: clampSize(eq.width),
    height: clampEquipmentHeight(eq.height),
    equipment_index: eq.equipmentIndex,
    config: eq.config,
    placeable: eq.placeable,
    sort_order: eq.sortOrder,
  };
}
