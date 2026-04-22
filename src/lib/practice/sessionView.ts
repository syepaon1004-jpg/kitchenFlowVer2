// VM calculators only — Gate B Axis 3 reuse scope.
// formatter는 ./sessionTextFormat으로 이동 (text-first fallback, adapter 미노출).
// 순수 함수만. React/Zustand import 금지.

import type { PracticeEngineState } from './engine';
import type {
  PracticeLocation,
  PracticeStepGroup,
  PracticeTacitItem,
  PracticeTacitMedia,
  PracticeMenuBundle,
} from '../../types/practice';

// ——— Location label map (VM + page 공용 순수 helper) ————————————————

export function buildLocationLabelMap(
  locations: readonly PracticeLocation[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const loc of locations) {
    map.set(loc.id, loc.label);
  }
  return map;
}

// ——— Current step group / tacit detail ————————

export interface TacitDetailViewModel {
  stepGroup: PracticeStepGroup;
  /** primary_location_id를 locationLabels로 해석한 라벨. null이면 위치 미지정. */
  primaryLocationLabel: string | null;
  tacitItems: PracticeTacitItem[];
  tacitMediaByItemId: ReadonlyMap<string, PracticeTacitMedia[]>;
}

export function getCurrentStepGroup(
  engineState: PracticeEngineState,
): PracticeStepGroup | null {
  const { bundle, node_progress } = engineState;

  const satisfiedIds = new Set<string>();
  for (const p of node_progress) {
    if (p.is_satisfied) satisfiedIds.add(p.node_id);
  }

  const sorted = [...bundle.step_groups].sort(
    (a, b) => a.display_step_no - b.display_step_no,
  );

  for (const group of sorted) {
    const nodeIds: string[] = [];
    for (const sgn of bundle.step_group_nodes) {
      if (sgn.step_group_id === group.id) nodeIds.push(sgn.node_id);
    }
    if (nodeIds.length === 0) continue;

    const allSatisfied = nodeIds.every((nid) => satisfiedIds.has(nid));
    if (!allSatisfied) return group;
  }

  return null;
}

export function getTacitItemsForGroup(
  groupId: string,
  bundle: PracticeMenuBundle,
): PracticeTacitItem[] {
  return bundle.tacit_items
    .filter((item) => item.step_group_id === groupId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

// ——— Next step group preview ————————————————

const MEDIA_TACIT_TYPE = 'media' as const;

export function getTextTacitItemsForGroup(
  groupId: string,
  bundle: PracticeMenuBundle,
): PracticeTacitItem[] {
  return getTacitItemsForGroup(groupId, bundle)
    .filter((item) => item.tacit_type !== MEDIA_TACIT_TYPE);
}

export interface NextGroupPreviewViewModel {
  stepGroup: PracticeStepGroup;
  /** primary_location_id를 locationLabels로 해석한 라벨. null이면 위치 미지정. */
  primaryLocationLabel: string | null;
  /** text-only tacit items (media 타입 제외), sort_order 정렬 */
  tacitItems: PracticeTacitItem[];
}

export function getNextStepGroup(
  engineState: PracticeEngineState,
): PracticeStepGroup | null {
  const current = getCurrentStepGroup(engineState);
  if (!current) return null;

  const { bundle } = engineState;

  const sorted = [...bundle.step_groups].sort(
    (a, b) => a.display_step_no - b.display_step_no,
  );

  let foundCurrent = false;
  for (const group of sorted) {
    const hasNodes = bundle.step_group_nodes.some(
      (sgn) => sgn.step_group_id === group.id,
    );
    if (!hasNodes) continue;

    if (foundCurrent) return group;
    if (group.id === current.id) foundCurrent = true;
  }

  return null;
}

export function buildNextGroupPreview(
  engineState: PracticeEngineState,
): NextGroupPreviewViewModel | null {
  const nextGroup = getNextStepGroup(engineState);
  if (!nextGroup) return null;

  const locationLabels = buildLocationLabelMap(engineState.bundle.locations);
  const primaryLocationLabel = nextGroup.primary_location_id
    ? locationLabels.get(nextGroup.primary_location_id) ?? null
    : null;

  const tacitItems = getTextTacitItemsForGroup(nextGroup.id, engineState.bundle);

  return { stepGroup: nextGroup, primaryLocationLabel, tacitItems };
}

export function buildTacitMediaMap(
  itemIds: readonly string[],
  bundle: PracticeMenuBundle,
): ReadonlyMap<string, PracticeTacitMedia[]> {
  const map = new Map<string, PracticeTacitMedia[]>();
  for (const id of itemIds) map.set(id, []);
  for (const m of bundle.tacit_media) {
    const arr = map.get(m.tacit_item_id);
    if (arr) arr.push(m);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  }
  return map;
}

export function buildTacitDetailViewModel(
  engineState: PracticeEngineState,
): TacitDetailViewModel | null {
  const group = getCurrentStepGroup(engineState);
  if (!group) return null;

  const tacitItems = getTacitItemsForGroup(group.id, engineState.bundle);
  const locationLabels = buildLocationLabelMap(engineState.bundle.locations);
  const primaryLocationLabel = group.primary_location_id
    ? locationLabels.get(group.primary_location_id) ?? null
    : null;
  const tacitMediaByItemId = buildTacitMediaMap(
    tacitItems.map((i) => i.id),
    engineState.bundle,
  );

  return { stepGroup: group, primaryLocationLabel, tacitItems, tacitMediaByItemId };
}
