import { create } from 'zustand';
import type { SectionConfig, BillQueueArea } from '../types/db';

export const DEFAULT_SECTION_CONFIG: SectionConfig = {
  boundaries: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0],
  walls: [4, 8],
};

/** 뒤돌기 시 최단 경로 방향 계산 (3-copy 캐러셀 애니메이션용) */
function getNearestTurnOffset(current: number, target: number, totalSections: number): -1 | 0 | 1 {
  const distC = Math.abs(target - current);
  const distL = current + (totalSections - target);
  const distR = (totalSections - current) + target;
  if (distC <= distL && distC <= distR) return 0;
  if (distL <= distR) return -1;
  return 1;
}

export interface TurnResult {
  target: number;
  direction: -1 | 0 | 1;
}

interface UiState {
  // 메인 뷰포트
  viewOffset: number;         // translateX px 값
  currentSection: number;     // 섹션 인덱스 (1-indexed)
  currentZoneId: string | null;
  sectionConfig: SectionConfig;
  billQueueAreas: BillQueueArea[] | null;

  // 왼쪽 사이드바
  leftSidebarZoneId: string | null; // null이면 zone 미선택
  leftSidebarOpen: boolean;         // CSS 슬라이드 열림/닫힘

  // 오른쪽 사이드바
  rightSidebarOpen: boolean;

  // 모달
  orderSelectModalOpen: boolean;
  orderSelectContainerInstanceId: string | null;

  // 수량 입력 모달
  quantityModalOpen: boolean;
  quantityModalUnit: string | null;
  quantityModalDefaultQty: number;
  quantityModalCallback: ((qty: number) => void) | null;

  setViewOffset: (offset: number | ((prev: number) => number)) => void;
  setCurrentSection: (section: number) => void;
  setCurrentZoneId: (zoneId: string) => void;
  setSectionConfig: (config: SectionConfig | null) => void;
  goNext: () => TurnResult | null;
  goPrev: () => TurnResult | null;
  goTurn: () => TurnResult | null;
  toggleLeftSidebar: () => void;
  setLeftSidebarZone: (zoneId: string | null) => void;
  setRightSidebarOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
  openOrderSelectModal: (containerInstanceId: string) => void;
  closeOrderSelectModal: () => void;
  setBillQueueAreas: (areas: BillQueueArea[] | null) => void;
  openQuantityModal: (unit: string, defaultQty: number, callback: (qty: number) => void) => void;
  closeQuantityModal: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  viewOffset: 0,
  currentSection: 1,
  currentZoneId: null,
  sectionConfig: DEFAULT_SECTION_CONFIG,
  billQueueAreas: null,
  leftSidebarZoneId: null,
  leftSidebarOpen: false,
  rightSidebarOpen: false,
  orderSelectModalOpen: false,
  orderSelectContainerInstanceId: null,
  quantityModalOpen: false,
  quantityModalUnit: null,
  quantityModalDefaultQty: 1,
  quantityModalCallback: null,

  setViewOffset: (offset) =>
    set((state) => ({
      viewOffset: typeof offset === 'function' ? offset(state.viewOffset) : offset,
    })),

  setCurrentSection: (section) => {
    const { sectionConfig } = get();
    const totalSections = sectionConfig.boundaries.length - 1;
    const wallSet = new Set(sectionConfig.walls);
    if (section >= 1 && section <= totalSections && !wallSet.has(section)) {
      set({ currentSection: section });
    }
  },

  setCurrentZoneId: (zoneId) => set({ currentZoneId: zoneId }),

  setSectionConfig: (config) =>
    set({ sectionConfig: config ?? DEFAULT_SECTION_CONFIG }),

  goTurn: () => {
    const { currentSection, sectionConfig } = get();
    const totalSections = sectionConfig.boundaries.length - 1;
    const wallSet = new Set(sectionConfig.walls);
    const target = totalSections - currentSection;
    if (target < 1 || target > totalSections || wallSet.has(target)) return null;
    const direction = getNearestTurnOffset(currentSection, target, totalSections);
    set({ currentSection: target });
    return { target, direction };
  },

  goNext: () => {
    const { currentSection, sectionConfig } = get();
    const totalSections = sectionConfig.boundaries.length - 1;
    const wallSet = new Set(sectionConfig.walls);
    const next = currentSection + 1;
    if (next > totalSections || wallSet.has(next)) {
      return get().goTurn();
    }
    set({ currentSection: next });
    return null;
  },

  goPrev: () => {
    const { currentSection, sectionConfig } = get();
    const wallSet = new Set(sectionConfig.walls);
    const prev = currentSection - 1;
    if (prev < 1 || wallSet.has(prev)) {
      return get().goTurn();
    }
    set({ currentSection: prev });
    return null;
  },

  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  setLeftSidebarZone: (zoneId) => set({
    leftSidebarZoneId: zoneId,
    leftSidebarOpen: zoneId !== null,
  }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setBillQueueAreas: (areas) => set({ billQueueAreas: areas }),
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  openOrderSelectModal: (containerInstanceId) =>
    set({ orderSelectModalOpen: true, orderSelectContainerInstanceId: containerInstanceId }),
  closeOrderSelectModal: () =>
    set({ orderSelectModalOpen: false, orderSelectContainerInstanceId: null }),
  openQuantityModal: (unit, defaultQty, callback) =>
    set({ quantityModalOpen: true, quantityModalUnit: unit, quantityModalDefaultQty: defaultQty, quantityModalCallback: callback }),
  closeQuantityModal: () =>
    set({ quantityModalOpen: false, quantityModalUnit: null, quantityModalDefaultQty: 1, quantityModalCallback: null }),
}));
