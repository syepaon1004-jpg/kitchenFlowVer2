// Practice menu browse view helpers — 순수 함수만. React/Zustand import 금지.
// sessionView.ts와 경계 독립: session/engine 의존 없이 bundle-only로 동작.

import type {
  PracticeLocation,
  PracticeMenuBundle,
  PracticeTacitItem,
  PracticeTacitMedia,
  PracticeTacitType,
} from '../../types/practice';

// ——— Sensory field types & labels ————————————————

export type SensoryField =
  | 'flame_level'
  | 'color_note'
  | 'viscosity_note'
  | 'sound_note'
  | 'texture_note'
  | 'timing_note';

export interface SensoryEntry {
  readonly field: SensoryField;
  readonly label: string;
  readonly value: string;
}

export interface MediaPreviewItem {
  readonly id: string;
  readonly mediaType: 'image' | 'video';
  readonly url: string;
}

/** Korean labels for sensory fields, used as inline preview tags. */
export const SENSORY_FIELD_LABELS: Record<SensoryField, string> = {
  flame_level: '불 세기',
  color_note: '색',
  viscosity_note: '점도',
  sound_note: '소리',
  texture_note: '질감',
  timing_note: '타이밍',
};

const SENSORY_FIELDS: readonly SensoryField[] = [
  'flame_level',
  'color_note',
  'viscosity_note',
  'sound_note',
  'texture_note',
  'timing_note',
];

function extractSensoryEntries(
  item: PracticeTacitItem,
): readonly SensoryEntry[] {
  const entries: SensoryEntry[] = [];
  for (const field of SENSORY_FIELDS) {
    const value = item[field];
    if (value !== null) {
      entries.push({ field, label: SENSORY_FIELD_LABELS[field], value });
    }
  }
  return entries;
}

// ——— Internal helpers (unexported) ——————————————

function buildLocationLabelMap(
  locations: readonly PracticeLocation[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const loc of locations) {
    map.set(loc.id, loc.label);
  }
  return map;
}

function getTextTacitItems(
  groupId: string,
  bundle: PracticeMenuBundle,
): PracticeTacitItem[] {
  return bundle.tacit_items
    .filter((item) => item.step_group_id === groupId && item.tacit_type !== 'media')
    .sort((a, b) => a.sort_order - b.sort_order);
}

function getMediaTacitItems(
  groupId: string,
  bundle: PracticeMenuBundle,
): PracticeTacitItem[] {
  return bundle.tacit_items
    .filter((item) => item.step_group_id === groupId && item.tacit_type === 'media')
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

function buildTacitMediaMap(
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

// ——— Exported types ———————————————————————————

/** Compact tacit item preview — title + type tag + optional body text + sensory entries. */
export interface TacitPreviewItem {
  id: string;
  tacitType: Exclude<PracticeTacitType, 'media'>;
  title: string;
  body: string | null;
  sensoryEntries: readonly SensoryEntry[];
  mediaEntries: readonly MediaPreviewItem[];
}

/** Standalone media card for a pure media tacit item (tacit_type === 'media'). */
export interface PureMediaPreviewItem {
  readonly itemId: string;
  readonly title: string;
  readonly media: readonly MediaPreviewItem[];
}

/** Per-step-group browse preview for the menu detail page. */
export interface StepGroupBrowseViewModel {
  groupId: string;
  displayStepNo: number;
  title: string;
  summary: string | null;
  primaryLocationLabel: string | null;
  tacitPreviews: readonly TacitPreviewItem[];
  pureMediaPreviews: readonly PureMediaPreviewItem[];
}

// ——— Exported constants ———————————————————————

/** Korean labels for non-media tacit types, used as UI tags. */
export const TACIT_TYPE_LABELS: Record<Exclude<PracticeTacitType, 'media'>, string> = {
  observe: '관찰',
  adjust: '조절',
  warning: '주의',
  reason: '이유',
};

// ——— Type guard ————————————————————————————————

export function isTextTacitType(
  t: PracticeTacitType,
): t is Exclude<PracticeTacitType, 'media'> {
  return t !== 'media';
}

// ——— View model builders ——————————————————————

/**
 * Bundle에서 해당 그룹의 text tacit items를 compact preview로 변환.
 * sort_order 오름차순. media 타입 제외.
 */
type TextTacitItem = PracticeTacitItem & {
  tacit_type: Exclude<PracticeTacitType, 'media'>;
};

function isTextTacitItem(item: PracticeTacitItem): item is TextTacitItem {
  return item.tacit_type !== 'media';
}

export function buildTacitPreviews(
  groupId: string,
  bundle: PracticeMenuBundle,
): TacitPreviewItem[] {
  const textItems = getTextTacitItems(groupId, bundle).filter(isTextTacitItem);
  const mediaMap = buildTacitMediaMap(
    textItems.map((item) => item.id),
    bundle,
  );
  return textItems.map((item) => ({
    id: item.id,
    tacitType: item.tacit_type,
    title: item.title,
    body: item.body,
    sensoryEntries: extractSensoryEntries(item),
    mediaEntries: (mediaMap.get(item.id) ?? []).map((m) => ({
      id: m.id,
      mediaType: m.media_type,
      url: m.url,
    })),
  }));
}

/**
 * Bundle에서 해당 그룹의 media-type tacit items를 standalone 카드 VM으로 변환.
 * sort_order 오름차순 (동순위 시 id). media 파일이 0개인 item은 제외.
 */
export function buildPureMediaPreviews(
  groupId: string,
  bundle: PracticeMenuBundle,
): PureMediaPreviewItem[] {
  const mediaItems = getMediaTacitItems(groupId, bundle);
  const mediaMap = buildTacitMediaMap(
    mediaItems.map((item) => item.id),
    bundle,
  );
  return mediaItems
    .map((item) => ({
      itemId: item.id,
      title: item.title,
      media: (mediaMap.get(item.id) ?? []).map((m) => ({
        id: m.id,
        mediaType: m.media_type,
        url: m.url,
      })),
    }))
    .filter((pm) => pm.media.length > 0);
}

/**
 * 전체 step group browse VM 목록 반환.
 * display_step_no 오름차순. location label 해석 포함.
 */
export function buildStepGroupBrowseList(
  bundle: PracticeMenuBundle,
): StepGroupBrowseViewModel[] {
  const locationLabels = buildLocationLabelMap(bundle.locations);

  const sorted = [...bundle.step_groups].sort(
    (a, b) => a.display_step_no - b.display_step_no,
  );

  return sorted.map((sg) => ({
    groupId: sg.id,
    displayStepNo: sg.display_step_no,
    title: sg.title,
    summary: sg.summary,
    primaryLocationLabel: sg.primary_location_id
      ? locationLabels.get(sg.primary_location_id) ?? null
      : null,
    tacitPreviews: buildTacitPreviews(sg.id, bundle),
    pureMediaPreviews: buildPureMediaPreviews(sg.id, bundle),
  }));
}
