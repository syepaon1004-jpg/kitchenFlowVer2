// Practice admin read-only view helpers — 순수 함수만. React/Zustand/Supabase import 금지.
// menuView.ts · sessionView.ts 경계 독립: bundle-only로 동작.

import type {
  PracticeMenuBundle,
  PracticeActionType,
  PracticeTacitType,
  PracticeTacitItem,
} from '../../types/practice';

// ——— Sensory field helpers (menuView 독립) ————————

type SensoryField =
  | 'flame_level'
  | 'color_note'
  | 'viscosity_note'
  | 'sound_note'
  | 'texture_note'
  | 'timing_note';

export const ADMIN_SENSORY_FIELDS: ReadonlyArray<{
  field: SensoryField;
  label: string;
}> = [
  { field: 'flame_level', label: '불 세기' },
  { field: 'color_note', label: '색' },
  { field: 'viscosity_note', label: '점도' },
  { field: 'sound_note', label: '소리' },
  { field: 'texture_note', label: '질감' },
  { field: 'timing_note', label: '타이밍' },
];

// ——— Tacit type labels (menuView 독립) ————————————

export const ADMIN_TACIT_TYPE_LABELS: Record<
  Exclude<PracticeTacitType, 'media'>,
  string
> = {
  observe: '관찰',
  adjust: '조절',
  warning: '주의',
  reason: '이유',
};

// ——— Exported types ————————————————————————————

/** 미디어 파일 상세 */
export interface AdminMediaDetail {
  readonly id: string;
  readonly mediaType: 'image' | 'video';
  readonly url: string;
  readonly sortOrder: number;
}

/** 감각 관찰 엔트리 */
export interface AdminSensoryEntry {
  readonly field: string;
  readonly label: string;
  readonly value: string;
}

/** 재료 노드 상세 */
export interface AdminIngredientNodeDetail {
  readonly nodeId: string;
  readonly stepNo: number;
  readonly ingredientId: string;
  readonly isDeco: boolean;
  readonly quantity: number;
  readonly locationPathLabels: readonly string[];
}

/** 액션 노드 상세 */
export interface AdminActionNodeDetail {
  readonly nodeId: string;
  readonly stepNo: number;
  readonly actionType: PracticeActionType;
  readonly locationLabel: string | null;
  readonly durationSec: number | null;
}

/** 메뉴 스코프 액션 노드 리스트 아이템 (step group 비연결 포함) */
export interface AdminActionNodeListItem {
  readonly nodeId: string;
  readonly stepNo: number;
  readonly actionType: PracticeActionType;
  readonly locationId: string;
  readonly locationLabel: string | null;
  readonly durationSec: number | null;
}

/** 메뉴 스코프 재료 노드 리스트 아이템 (step group 비연결 포함) */
export interface AdminIngredientNodeListItem {
  readonly nodeId: string;
  readonly stepNo: number;
  readonly ingredientId: string;
  readonly isDeco: boolean;
  readonly quantity: number;
  readonly locationPathLabels: readonly string[];
}

/** step group에 아직 연결되지 않은 노드 선택 옵션 */
export interface AdminUnlinkedNodeOption {
  readonly nodeId: string;
  readonly nodeType: 'ingredient' | 'action';
  readonly stepNo: number;
  readonly ingredientId: string | null;
  readonly isDeco: boolean | null;
  readonly quantity: number | null;
  readonly actionType: PracticeActionType | null;
  readonly locationId: string | null;
}

/** 텍스트 암묵지 상세 (observe/adjust/warning/reason) */
export interface AdminTacitItemDetail {
  readonly id: string;
  readonly tacitType: Exclude<PracticeTacitType, 'media'>;
  readonly title: string;
  readonly body: string | null;
  readonly sortOrder: number;
  readonly sensoryEntries: readonly AdminSensoryEntry[];
  readonly linkedMedia: readonly AdminMediaDetail[];
}

/** 순수 미디어 암묵지 상세 (tacit_type === 'media') */
export interface AdminPureMediaDetail {
  readonly id: string;
  readonly title: string;
  readonly media: readonly AdminMediaDetail[];
}

/** Step group drilldown 전체 뷰 모델 */
export interface StepGroupDrilldown {
  readonly groupId: string;
  readonly displayStepNo: number;
  readonly title: string;
  readonly summary: string | null;
  readonly primaryLocationLabel: string | null;
  readonly ingredientNodes: readonly AdminIngredientNodeDetail[];
  readonly actionNodes: readonly AdminActionNodeDetail[];
  readonly textTacitItems: readonly AdminTacitItemDetail[];
  readonly pureMediaItems: readonly AdminPureMediaDetail[];
  readonly totalMediaCount: number;
}

/** 개별 step group의 coverage 상태 */
export interface StepGroupCoverage {
  readonly groupId: string;
  readonly displayStepNo: number;
  readonly title: string;
  readonly summary: string | null;
  readonly nodeCount: number;
  readonly textTacitCount: number;
  readonly pureMediaTacitCount: number;
  readonly linkedMediaCount: number;
}

/** 메뉴 전체 요약 + per-step-group coverage */
export interface MenuStructureSummary {
  readonly menuId: string;
  readonly menuName: string;
  readonly totalNodes: number;
  readonly ingredientNodeCount: number;
  readonly actionNodeCount: number;
  readonly stepGroupCount: number;
  readonly tacitItemCount: number;
  readonly tacitMediaCount: number;
  readonly groups: readonly StepGroupCoverage[];
}

// ——— Builder ————————————————————————————————————

export function buildMenuStructureSummary(
  bundle: PracticeMenuBundle,
): MenuStructureSummary {
  const ingredientNodeCount = bundle.ingredient_nodes.length;
  const actionNodeCount = bundle.action_nodes.length;

  const sorted = [...bundle.step_groups].sort(
    (a, b) => a.display_step_no - b.display_step_no,
  );

  const groups: StepGroupCoverage[] = sorted.map((sg) => {
    const groupTacitItems = bundle.tacit_items.filter(
      (t) => t.step_group_id === sg.id,
    );
    const groupTacitItemIds = new Set(groupTacitItems.map((t) => t.id));

    return {
      groupId: sg.id,
      displayStepNo: sg.display_step_no,
      title: sg.title,
      summary: sg.summary,
      nodeCount: bundle.step_group_nodes.filter(
        (sgn) => sgn.step_group_id === sg.id,
      ).length,
      textTacitCount: groupTacitItems.filter(
        (t) => t.tacit_type !== 'media',
      ).length,
      pureMediaTacitCount: groupTacitItems.filter(
        (t) => t.tacit_type === 'media',
      ).length,
      linkedMediaCount: bundle.tacit_media.filter((m) =>
        groupTacitItemIds.has(m.tacit_item_id),
      ).length,
    };
  });

  return {
    menuId: bundle.menu.id,
    menuName: bundle.menu.name,
    totalNodes: ingredientNodeCount + actionNodeCount,
    ingredientNodeCount,
    actionNodeCount,
    stepGroupCount: bundle.step_groups.length,
    tacitItemCount: bundle.tacit_items.length,
    tacitMediaCount: bundle.tacit_media.length,
    groups,
  };
}

// ——— Step group drilldown builder —————————————

function extractSensoryEntries(item: PracticeTacitItem): AdminSensoryEntry[] {
  const entries: AdminSensoryEntry[] = [];
  for (const { field, label } of ADMIN_SENSORY_FIELDS) {
    const value = item[field];
    if (value != null && value !== '') {
      entries.push({ field, label, value });
    }
  }
  return entries;
}

function sortByStepNoThenId(
  a: { stepNo: number; nodeId: string },
  b: { stepNo: number; nodeId: string },
): number {
  return a.stepNo - b.stepNo || a.nodeId.localeCompare(b.nodeId);
}

function sortBySortOrderThenId(
  a: { sortOrder: number; id: string },
  b: { sortOrder: number; id: string },
): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

/**
 * Bundle에서 단일 step group의 상세 drilldown 뷰 모델을 조합한다.
 * Pure function — 추가 Supabase query 없이 bundle만으로 동작.
 * groupId가 bundle에 없으면 null 반환.
 */
export function buildStepGroupDrilldown(
  groupId: string,
  bundle: PracticeMenuBundle,
): StepGroupDrilldown | null {
  const sg = bundle.step_groups.find((g) => g.id === groupId);
  if (!sg) return null;

  // Location label map
  const locMap = new Map<string, string>();
  for (const loc of bundle.locations) {
    locMap.set(loc.id, loc.label);
  }

  // Node IDs in this group
  const groupNodeIds = new Set(
    bundle.step_group_nodes
      .filter((sgn) => sgn.step_group_id === groupId)
      .map((sgn) => sgn.node_id),
  );

  // Ingredient nodes
  const ingredientNodes: AdminIngredientNodeDetail[] = bundle.ingredient_nodes
    .filter((n) => groupNodeIds.has(n.node.id))
    .map((n) => ({
      nodeId: n.node.id,
      stepNo: n.node.step_no,
      ingredientId: n.ingredient.ingredient_id,
      isDeco: n.ingredient.is_deco,
      quantity: n.ingredient.quantity,
      locationPathLabels: [...n.location_path]
        .sort((a, b) => a.seq - b.seq)
        .map((lp) => locMap.get(lp.location_id) ?? lp.location_id),
    }));
  ingredientNodes.sort(sortByStepNoThenId);

  // Action nodes
  const actionNodes: AdminActionNodeDetail[] = bundle.action_nodes
    .filter((n) => groupNodeIds.has(n.node.id))
    .map((n) => ({
      nodeId: n.node.id,
      stepNo: n.node.step_no,
      actionType: n.action.action_type,
      locationLabel: locMap.get(n.action.location_id) ?? null,
      durationSec: n.action.duration_sec,
    }));
  actionNodes.sort(sortByStepNoThenId);

  // Tacit items for this group
  const groupTacitItems = bundle.tacit_items.filter(
    (t) => t.step_group_id === groupId,
  );
  const groupTacitItemIds = new Set(groupTacitItems.map((t) => t.id));

  // Media lookup for this group's tacit items
  const mediaByTacitId = new Map<string, AdminMediaDetail[]>();
  for (const id of groupTacitItemIds) mediaByTacitId.set(id, []);
  for (const m of bundle.tacit_media) {
    const arr = mediaByTacitId.get(m.tacit_item_id);
    if (arr) {
      arr.push({
        id: m.id,
        mediaType: m.media_type,
        url: m.url,
        sortOrder: m.sort_order,
      });
    }
  }
  for (const arr of mediaByTacitId.values()) {
    arr.sort(sortBySortOrderThenId);
  }

  // Text tacit items
  const textTacitItems: AdminTacitItemDetail[] = groupTacitItems
    .filter((t) => t.tacit_type !== 'media')
    .map((t) => ({
      id: t.id,
      tacitType: t.tacit_type as Exclude<PracticeTacitType, 'media'>,
      title: t.title,
      body: t.body,
      sortOrder: t.sort_order,
      sensoryEntries: extractSensoryEntries(t),
      linkedMedia: mediaByTacitId.get(t.id) ?? [],
    }));
  textTacitItems.sort(sortBySortOrderThenId);

  // Pure media tacit items (exclude if 0 media files)
  const pureMediaItems: AdminPureMediaDetail[] = groupTacitItems
    .filter((t) => t.tacit_type === 'media')
    .map((t) => ({
      id: t.id,
      title: t.title,
      sortOrder: t.sort_order,
      media: mediaByTacitId.get(t.id) ?? [],
    }))
    .filter((pm) => pm.media.length > 0)
    .sort(sortBySortOrderThenId)
    .map(({ id, title, media }) => ({ id, title, media }));

  // Total media count across all tacit items in this group
  let totalMediaCount = 0;
  for (const arr of mediaByTacitId.values()) {
    totalMediaCount += arr.length;
  }

  return {
    groupId: sg.id,
    displayStepNo: sg.display_step_no,
    title: sg.title,
    summary: sg.summary,
    primaryLocationLabel: sg.primary_location_id
      ? locMap.get(sg.primary_location_id) ?? null
      : null,
    ingredientNodes,
    actionNodes,
    textTacitItems,
    pureMediaItems,
    totalMediaCount,
  };
}

// ——— Admin 메뉴 스코프 액션 노드 리스트 ————————

/**
 * 메뉴 스코프에서 bundle.action_nodes 전체를 리스트 아이템으로 변환한다.
 * step_group_nodes 연결 여부와 무관하게 모든 액션 노드를 반환하여
 * step group 미연결 상태의 신규 노드도 어드민 UI에 즉시 노출되도록 한다.
 * 정렬: step_no ASC → nodeId ASC.
 */
export function buildAdminActionNodeList(
  bundle: PracticeMenuBundle,
): readonly AdminActionNodeListItem[] {
  const locMap = new Map<string, string>();
  for (const loc of bundle.locations) locMap.set(loc.id, loc.label);

  const items: AdminActionNodeListItem[] = bundle.action_nodes.map((n) => ({
    nodeId: n.node.id,
    stepNo: n.node.step_no,
    actionType: n.action.action_type,
    locationId: n.action.location_id,
    locationLabel: locMap.get(n.action.location_id) ?? null,
    durationSec: n.action.duration_sec,
  }));
  items.sort(
    (a, b) => a.stepNo - b.stepNo || a.nodeId.localeCompare(b.nodeId),
  );
  return items;
}

// ——— Admin 메뉴 스코프 링크 후보 노드 옵션 ————————

/**
 * step_group_nodes에 아직 연결되지 않은 ingredient/action 노드만 반환한다.
 * `practice_step_group_nodes.UNIQUE(node_id)` 제약으로 이미 linked 된
 * 노드는 다시 link 할 수 없으므로 선제적으로 제외한다.
 * 정렬: stepNo ASC → nodeType('action' before 'ingredient') → nodeId ASC.
 * 라벨 문자열 조립은 페이지가 담당 (bundle에 없는 ingredient 표시명 등).
 */
export function buildAdminUnlinkedNodeOptions(
  bundle: PracticeMenuBundle,
): readonly AdminUnlinkedNodeOption[] {
  const linked = new Set(bundle.step_group_nodes.map((n) => n.node_id));

  const items: AdminUnlinkedNodeOption[] = [];

  for (const n of bundle.action_nodes) {
    if (linked.has(n.node.id)) continue;
    items.push({
      nodeId: n.node.id,
      nodeType: 'action',
      stepNo: n.node.step_no,
      ingredientId: null,
      isDeco: null,
      quantity: null,
      actionType: n.action.action_type,
      locationId: n.action.location_id,
    });
  }

  for (const n of bundle.ingredient_nodes) {
    if (linked.has(n.node.id)) continue;
    items.push({
      nodeId: n.node.id,
      nodeType: 'ingredient',
      stepNo: n.node.step_no,
      ingredientId: n.ingredient.ingredient_id,
      isDeco: n.ingredient.is_deco,
      quantity: n.ingredient.quantity,
      actionType: null,
      locationId: null,
    });
  }

  items.sort((a, b) => {
    if (a.stepNo !== b.stepNo) return a.stepNo - b.stepNo;
    if (a.nodeType !== b.nodeType) return a.nodeType === 'action' ? -1 : 1;
    return a.nodeId.localeCompare(b.nodeId);
  });

  return items;
}

// ——— Admin 메뉴 스코프 재료 노드 리스트 ————————

/**
 * 메뉴 스코프에서 bundle.ingredient_nodes 전체를 리스트 아이템으로 변환한다.
 * step_group_nodes 연결 여부와 무관하게 모든 재료 노드를 반환하여
 * step group 미연결 상태의 신규 노드도 어드민 UI에 즉시 노출되도록 한다.
 * 정렬: step_no ASC → nodeId ASC. location_path는 seq ASC로 정렬된 label 배열.
 */
export function buildAdminIngredientNodeList(
  bundle: PracticeMenuBundle,
): readonly AdminIngredientNodeListItem[] {
  const locMap = new Map<string, string>();
  for (const loc of bundle.locations) locMap.set(loc.id, loc.label);

  const items: AdminIngredientNodeListItem[] = bundle.ingredient_nodes.map(
    (n) => ({
      nodeId: n.node.id,
      stepNo: n.node.step_no,
      ingredientId: n.ingredient.ingredient_id,
      isDeco: n.ingredient.is_deco,
      quantity: n.ingredient.quantity,
      locationPathLabels: [...n.location_path]
        .sort((a, b) => a.seq - b.seq)
        .map((lp) => locMap.get(lp.location_id) ?? lp.location_id),
    }),
  );
  items.sort(
    (a, b) => a.stepNo - b.stepNo || a.nodeId.localeCompare(b.nodeId),
  );
  return items;
}
