// KitchenModeAdapter — Phase 2 shared kitchen shell boundary, single source of truth.
// Co-located here:
//   - every type/interface for the adapter contract (primary role, per plan)
//   - the React Context object + `useKitchenModeAdapter` hook (co-located because
//     `react-refresh/only-export-components` forbids Context / non-component exports
//     from `.tsx` files; this file being `.ts` is the natural host)
// References:
//   docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md §4, §4.1
//   docs/practice/ENGINE_SPEC_APPENDIX_2026-04-21.md §3.1–§3.3
// LocationKey is defined here as the single authoritative source. No other file in the repo
// may redefine or re-export this symbol. ENGINE_SPEC_APPENDIX §3.3 specifies that the
// LocationKey -> LocationRef mapping is produced inside adapter.boot() at session start.

import { createContext, useContext } from 'react';

export type LocationKey = string;

export type LocationRef =
  | { kind: 'equipment'; equipment_state_id: string }
  | { kind: 'container'; container_instance_id: string };

export type KitchenMode = 'sim' | 'practice';

export type SessionContext = {
  store_id: string;
  user_id: string | null;
  mode: KitchenMode;
  practice_menu_id?: string;
  sim_session_id?: string;
};

export type PlaceIntent = {
  ingredient_id: string;
  location_key: LocationKey;
  location_ref: LocationRef;
};

export type ActionIntent = {
  action_type: string;
  location_key: LocationKey;
  location_ref: LocationRef | null;
};

export type PourIntent = {
  source_location_ref: LocationRef;
  source_location_key: LocationKey;
  destination_location_key: LocationKey;
  destination_location_ref: LocationRef | null;
};

export type ActionResult = {
  ok: boolean;
  rejection_code?: string;
  effects?: string[];
};

export type LegalAction =
  | { kind: 'place'; ingredient_id: string; location_key: LocationKey; step_no: number; node_id: string }
  | { kind: 'action'; action_type: string; location_key: LocationKey; step_no: number; node_id: string }
  | { kind: 'pour'; source_location_ref: LocationRef; destination_location_key: LocationKey; payload_node_ids: string[] };

export type HudModel = {
  mode: KitchenMode;
  title?: string;
  progress?: { completed: number; total: number };
};

export type RejectionModel = {
  rejection_code: string;
  at_location_key?: LocationKey;
  attempted_node_id?: string;
};

export type GhostGuideModel = {
  intensity: 'off' | 'soft' | 'full';
  highlight_location_key?: LocationKey;
  primary_action?: LegalAction;
};

export type OverlayModel = {
  rejection?: RejectionModel | null;
  guide?: GhostGuideModel | null;
};

export type StepGroupViewModel = {
  step_group_id: string;
  display_step_no: number;
  title: string;
  summary?: string;
  is_primary: boolean;
};

export interface KitchenModeAdapter {
  mode: KitchenMode;
  boot(sessionContext: SessionContext): Promise<void>;
  getHudModel(): HudModel;
  getOverlayModel(): OverlayModel;
  getOpenStep(locationKey: LocationKey): number | null;
  enumerateLegalActions(): LegalAction[];
  tryPlaceIngredient(input: PlaceIntent): ActionResult;
  tryPerformAction(input: ActionIntent): ActionResult;
  tryPour(input: PourIntent): ActionResult;
  onRuntimeTick(): void;
  getCurrentStepGroups(): StepGroupViewModel[];
  getPrimaryStepGroup(): StepGroupViewModel | null;
  getGhostGuide(): GhostGuideModel | null;
  getRejectionModel(): RejectionModel | null;
}

export const KitchenModeAdapterContext = createContext<KitchenModeAdapter | null>(null);

export function useKitchenModeAdapter(): KitchenModeAdapter | null {
  return useContext(KitchenModeAdapterContext);
}
