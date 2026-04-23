import { create } from 'zustand';
import type { SectionCell, BillQueueArea, KitchenZone } from '../types/db';
import type { RejectionInfo, WokBlockedReason } from '../types/game';
import type { MovableDirections, MoveDirection } from '../types/section';
import { supabase } from '../lib/supabase';
import {
  getStartSection,
  findCellByNumber,
  getMovableDirections,
  getTargetCell,
  isSameRowMove,
} from '../lib/sections/navigation';
import { getSectionCenterX } from '../lib/sections/camera';
import type { PanelEquipment } from '../types/db';

interface UiState {
  // ——— 섹션 그리드 네비게이션 ———
  /** 전체 그리드 행 수 */
  gridRows: number;
  /** 전체 그리드 열 수 */
  gridCols: number;
  /** 비어있지 않은 셀 목록 */
  sectionCells: SectionCell[];
  /** 현재 섹션 번호 (section_number, 1-indexed) */
  currentSection: number;
  /** 현재 행 인덱스 */
  currentRow: number;
  /** 카메라 중심 X (이미지 월드 기준 0~1) — 뷰에서 이미지 폭과 결합해 translateX(px) 계산 */
  cameraCenterX: number;
  /** 4방향 이동 가능 여부 (파생값, 셀/그리드 변경 시 갱신) */
  movableDirections: MovableDirections;

  // 빌 큐
  billQueueAreas: BillQueueArea[] | null;

  // 왼쪽 사이드바
  leftSidebarZoneId: string | null;
  leftSidebarOpen: boolean;
  leftSidebarAnchor: { x: number; y: number; w: number; h: number } | null;

  // 모달
  orderSelectModalOpen: boolean;
  orderSelectContainerInstanceId: string | null;

  // 액션 거부 팝업
  rejectionPopupOpen: boolean;
  rejectionInfo: RejectionInfo | null;

  // 웍 사용 차단 팝업
  wokBlockedPopupOpen: boolean;
  wokBlockedReason: WokBlockedReason | null;

  // 수량 입력 모달
  quantityModalOpen: boolean;
  quantityModalUnit: string | null;
  quantityModalPresets: number[];
  quantityModalCallback: ((qty: number) => void) | null;
  quantityModalMode: 'preset' | 'direct';
  quantityModalDefaultQty: number | null;
  quantityModalMaxQty: number | null;

  // Zone 프리로드 ��시
  zoneCacheMap: Map<string, KitchenZone>;
  _prefetchingIds: Set<string>;

  // ——— 섹션 액션 ———
  /** 섹션 그리드 초기화 (인게임 진입 시 호출) */
  initSectionGrid: (
    gridRows: number,
    gridCols: number,
    cells: SectionCell[],
    equipmentByRow: Map<number, PanelEquipment[]>,
  ) => void;
  /** 방향 이동. 같은 행이면 true, 다른 행이면 false 반환. 이동 불가면 null. */
  moveSection: (
    direction: MoveDirection,
    equipmentByRow: Map<number, PanelEquipment[]>,
  ) => boolean | null;

  // ——— 기존 UI 액션 ———
  toggleLeftSidebar: () => void;
  setLeftSidebarZone: (zoneId: string | null, anchor?: { x: number; y: number; w: number; h: number }) => void;
  clearLeftSidebarAnchor: () => void;
  openOrderSelectModal: (containerInstanceId: string) => void;
  closeOrderSelectModal: () => void;
  setBillQueueAreas: (areas: BillQueueArea[] | null) => void;
  openQuantityModal: (
    unit: string,
    presets: number[],
    callback: (qty: number) => void,
    options?: { mode?: 'preset' | 'direct'; defaultQty?: number; maxQty?: number },
  ) => void;
  closeQuantityModal: () => void;
  openRejectionPopup: (info: RejectionInfo) => void;
  closeRejectionPopup: () => void;
  openWokBlockedPopup: (reason: WokBlockedReason) => void;
  closeWokBlockedPopup: () => void;
  prefetchZones: (zoneIds: string[]) => Promise<void>;
  resetZoneCache: () => void;
}

const NO_MOVE: MovableDirections = { up: false, down: false, left: false, right: false };

/** 현재 셀 기준 카메라 centerX (이미지 월드 0~1) 계산 헬퍼 */
function computeCameraCenterX(
  cell: SectionCell,
  equipmentByRow: Map<number, PanelEquipment[]>,
): number {
  const rowEq = equipmentByRow.get(cell.row_index) ?? [];
  return getSectionCenterX(cell, rowEq);
}

export const useUiStore = create<UiState>((set, get) => ({
  gridRows: 1,
  gridCols: 1,
  sectionCells: [],
  currentSection: 1,
  currentRow: 0,
  cameraCenterX: 0.5,
  movableDirections: NO_MOVE,

  billQueueAreas: null,
  leftSidebarZoneId: null,
  leftSidebarOpen: false,
  leftSidebarAnchor: null,
  orderSelectModalOpen: false,
  orderSelectContainerInstanceId: null,
  quantityModalOpen: false,
  quantityModalUnit: null,
  quantityModalPresets: [],
  quantityModalCallback: null,
  quantityModalMode: 'preset',
  quantityModalDefaultQty: null,
  quantityModalMaxQty: null,
  rejectionPopupOpen: false,
  rejectionInfo: null,
  wokBlockedPopupOpen: false,
  wokBlockedReason: null,
  zoneCacheMap: new Map(),
  _prefetchingIds: new Set(),

  initSectionGrid: (gridRows, gridCols, cells, equipmentByRow) => {
    const startCell = getStartSection(cells);
    if (!startCell) {
      set({
        gridRows,
        gridCols,
        sectionCells: cells,
        currentSection: 1,
        currentRow: 0,
        cameraCenterX: 0.5,
        movableDirections: NO_MOVE,
      });
      return;
    }
    const directions = getMovableDirections(startCell, cells, gridRows, gridCols);
    const centerX = computeCameraCenterX(startCell, equipmentByRow);
    set({
      gridRows,
      gridCols,
      sectionCells: cells,
      currentSection: startCell.section_number,
      currentRow: startCell.row_index,
      cameraCenterX: centerX,
      movableDirections: directions,
    });
  },

  moveSection: (direction, equipmentByRow) => {
    const { currentSection, sectionCells, gridRows, gridCols } = get();
    const currentCell = findCellByNumber(sectionCells, currentSection);
    if (!currentCell) return null;

    const target = getTargetCell(currentCell, direction, sectionCells, gridRows, gridCols);
    if (!target) return null;

    const sameRow = isSameRowMove(currentCell, target);
    const directions = getMovableDirections(target, sectionCells, gridRows, gridCols);
    const centerX = computeCameraCenterX(target, equipmentByRow);

    set({
      currentSection: target.section_number,
      currentRow: target.row_index,
      cameraCenterX: centerX,
      movableDirections: directions,
    });

    return sameRow;
  },

  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  setLeftSidebarZone: (zoneId, anchor) => {
    if (zoneId) {
      set({ leftSidebarZoneId: zoneId, leftSidebarOpen: true, leftSidebarAnchor: anchor ?? null });
    } else {
      set({ leftSidebarZoneId: null, leftSidebarOpen: false });
    }
  },
  clearLeftSidebarAnchor: () => set({ leftSidebarAnchor: null }),
  setBillQueueAreas: (areas) => set({ billQueueAreas: areas }),
  openOrderSelectModal: (containerInstanceId) =>
    set({ orderSelectModalOpen: true, orderSelectContainerInstanceId: containerInstanceId }),
  closeOrderSelectModal: () =>
    set({ orderSelectModalOpen: false, orderSelectContainerInstanceId: null }),
  openQuantityModal: (unit, presets, callback, options) =>
    set({
      quantityModalOpen: true,
      quantityModalUnit: unit,
      quantityModalPresets: presets,
      quantityModalCallback: callback,
      quantityModalMode: options?.mode ?? 'preset',
      quantityModalDefaultQty: options?.defaultQty ?? null,
      quantityModalMaxQty: options?.maxQty ?? null,
    }),
  closeQuantityModal: () =>
    set({
      quantityModalOpen: false,
      quantityModalUnit: null,
      quantityModalPresets: [],
      quantityModalCallback: null,
      quantityModalMode: 'preset',
      quantityModalDefaultQty: null,
      quantityModalMaxQty: null,
    }),
  openRejectionPopup: (info) => set({ rejectionPopupOpen: true, rejectionInfo: info }),
  closeRejectionPopup: () => set({ rejectionPopupOpen: false, rejectionInfo: null }),
  openWokBlockedPopup: (reason) => set({ wokBlockedPopupOpen: true, wokBlockedReason: reason }),
  closeWokBlockedPopup: () => set({ wokBlockedPopupOpen: false, wokBlockedReason: null }),
  prefetchZones: async (zoneIds) => {
    const { zoneCacheMap, _prefetchingIds } = get();
    const missing = zoneIds.filter(
      (id) => !zoneCacheMap.has(id) && !_prefetchingIds.has(id),
    );
    if (missing.length === 0) return;

    const nextFetching = new Set(_prefetchingIds);
    missing.forEach((id) => nextFetching.add(id));
    set({ _prefetchingIds: nextFetching });

    try {
      const { data } = await supabase
        .from('kitchen_zones')
        .select('*')
        .in('id', missing);

      if (data) {
        const next = new Map(get().zoneCacheMap);
        for (const z of data) {
          const zone = z as KitchenZone;
          next.set(zone.id, zone);
          if (zone.image_url) {
            const img = new Image();
            img.src = zone.image_url;
            img.decode().catch(() => {
              console.warn(`[prefetch] 이미지 프리로드 실패: ${zone.image_url}`);
            });
          }
        }
        set({ zoneCacheMap: next });
      }
    } finally {
      const cleaned = new Set(get()._prefetchingIds);
      missing.forEach((id) => cleaned.delete(id));
      set({ _prefetchingIds: cleaned });
    }
  },

  resetZoneCache: () =>
    set({ zoneCacheMap: new Map(), _prefetchingIds: new Set() }),
}));
