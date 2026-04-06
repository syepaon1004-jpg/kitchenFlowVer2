import { create } from 'zustand';
import type { SelectionState } from '../types/game';

interface SelectionStoreState {
  selection: SelectionState | null;

  select: (state: SelectionState) => void;
  deselect: () => void;
  reset: () => void;
}

export const useSelectionStore = create<SelectionStoreState>((set) => ({
  selection: null,

  select: (state) => set({ selection: state }),
  deselect: () => set({ selection: null }),
  reset: () => set({ selection: null }),
}));
