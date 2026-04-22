import { describe, it, expect } from 'vitest';
import {
  buildLocationLabelMap,
  getCurrentStepGroup,
  getTacitItemsForGroup,
  getTextTacitItemsForGroup,
  buildTacitMediaMap,
  buildTacitDetailViewModel,
  getNextStepGroup,
  buildNextGroupPreview,
} from '../sessionView';
import type { PracticeEngineState, PracticeEngineProgress } from '../engine';
import type {
  PracticeLocation,
  PracticeStepGroup,
  PracticeStepGroupNode,
  PracticeTacitItem,
  PracticeTacitMedia,
  PracticeTacitType,
} from '../../../types/practice';

describe('buildLocationLabelMap', () => {
  it('builds id→label map from locations', () => {
    const locations: PracticeLocation[] = [
      { id: 'loc-1', menu_id: 'm1', label: '웍', loc_key: 'wok' },
      { id: 'loc-2', menu_id: 'm1', label: '접시', loc_key: 'plate' },
    ];
    const map = buildLocationLabelMap(locations);
    expect(map.get('loc-1')).toBe('웍');
    expect(map.get('loc-2')).toBe('접시');
    expect(map.size).toBe(2);
  });

  it('returns empty map for empty input', () => {
    const map = buildLocationLabelMap([]);
    expect(map.size).toBe(0);
  });
});

// ——— Fixture helper ————————————————————————————

function makeGroup(id: string, displayStepNo: number, primaryLocationId: string | null = null): PracticeStepGroup {
  return { id, menu_id: 'm1', display_step_no: displayStepNo, title: `Step ${displayStepNo}`, summary: null, primary_location_id: primaryLocationId };
}

function makeEngineState(overrides: {
  step_groups: PracticeStepGroup[];
  step_group_nodes: PracticeStepGroupNode[];
  node_progress: PracticeEngineProgress[];
  tacit_items?: PracticeTacitItem[];
  tacit_media?: PracticeTacitMedia[];
  locations?: PracticeLocation[];
}): PracticeEngineState {
  return {
    bundle: {
      menu: { id: 'm1', store_id: 's1', name: 'Test', description: null, image_url: null, created_at: '' },
      locations: overrides.locations ?? [],
      ingredient_nodes: [],
      action_nodes: [],
      step_groups: overrides.step_groups,
      step_group_nodes: overrides.step_group_nodes,
      tacit_items: overrides.tacit_items ?? [],
      tacit_media: overrides.tacit_media ?? [],
    },
    ingredient_instances: [],
    node_progress: overrides.node_progress,
  };
}

function makeTacitItem(id: string, groupId: string, sortOrder: number, title: string): PracticeTacitItem {
  return {
    id, step_group_id: groupId, tacit_type: 'observe', title, body: null, sort_order: sortOrder,
    flame_level: null, color_note: null, viscosity_note: null, sound_note: null, texture_note: null, timing_note: null,
  };
}

function makeMedia(id: string, tacitItemId: string, sortOrder: number, mediaType: 'image' | 'video' = 'image'): PracticeTacitMedia {
  return { id, tacit_item_id: tacitItemId, media_type: mediaType, url: `https://example.com/${id}.jpg`, sort_order: sortOrder };
}

// ——— getCurrentStepGroup ————————————————————————

describe('getCurrentStepGroup', () => {
  it('returns first incomplete group when multiple groups exist', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2), makeGroup('g3', 3)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
        { step_group_id: 'g2', node_id: 'n3' },
        { step_group_id: 'g3', node_id: 'n4' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' },
        { node_id: 'n2', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' },
        { node_id: 'n3', is_satisfied: false, satisfied_at: null },
        { node_id: 'n4', is_satisfied: false, satisfied_at: null },
      ],
    });
    expect(getCurrentStepGroup(state)?.id).toBe('g2');
  });

  it('returns null when all groups are complete', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' },
        { node_id: 'n2', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' },
      ],
    });
    expect(getCurrentStepGroup(state)).toBeNull();
  });

  it('skips groups with zero mapped nodes', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g-empty', 1), makeGroup('g2', 2)],
      step_group_nodes: [
        { step_group_id: 'g2', node_id: 'n1' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: false, satisfied_at: null },
      ],
    });
    expect(getCurrentStepGroup(state)?.id).toBe('g2');
  });

  it('returns the single incomplete group', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1)],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: false, satisfied_at: null }],
    });
    expect(getCurrentStepGroup(state)?.id).toBe('g1');
  });

  it('sorts by display_step_no regardless of array order', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g3', 3), makeGroup('g1', 1), makeGroup('g2', 2)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
        { step_group_id: 'g3', node_id: 'n3' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: false, satisfied_at: null },
        { node_id: 'n2', is_satisfied: false, satisfied_at: null },
        { node_id: 'n3', is_satisfied: false, satisfied_at: null },
      ],
    });
    expect(getCurrentStepGroup(state)?.id).toBe('g1');
  });
});

// ——— getTacitItemsForGroup ————————————————————

describe('getTacitItemsForGroup', () => {
  const bundle = makeEngineState({
    step_groups: [],
    step_group_nodes: [],
    node_progress: [],
    tacit_items: [
      makeTacitItem('t1', 'g1', 2, 'Second'),
      makeTacitItem('t2', 'g1', 1, 'First'),
      makeTacitItem('t3', 'g2', 1, 'Other group'),
    ],
  }).bundle;

  it('filters by group ID', () => {
    const items = getTacitItemsForGroup('g1', bundle);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.step_group_id === 'g1')).toBe(true);
  });

  it('sorts by sort_order ascending', () => {
    const items = getTacitItemsForGroup('g1', bundle);
    expect(items[0].title).toBe('First');
    expect(items[1].title).toBe('Second');
  });

  it('returns empty array when no items match', () => {
    expect(getTacitItemsForGroup('g-nonexistent', bundle)).toEqual([]);
  });
});

// ——— buildTacitMediaMap ————————————————————————

describe('buildTacitMediaMap', () => {
  it('groups media by tacit item ID and sorts by sort_order', () => {
    const bundle = makeEngineState({
      step_groups: [],
      step_group_nodes: [],
      node_progress: [],
      tacit_media: [
        makeMedia('m2', 't1', 2),
        makeMedia('m1', 't1', 1),
        makeMedia('m3', 't2', 1, 'video'),
      ],
    }).bundle;

    const map = buildTacitMediaMap(['t1', 't2'], bundle);
    expect(map.get('t1')).toHaveLength(2);
    expect(map.get('t1')![0].id).toBe('m1');
    expect(map.get('t1')![1].id).toBe('m2');
    expect(map.get('t2')).toHaveLength(1);
    expect(map.get('t2')![0].media_type).toBe('video');
  });

  it('excludes media not matching provided item IDs', () => {
    const bundle = makeEngineState({
      step_groups: [],
      step_group_nodes: [],
      node_progress: [],
      tacit_media: [makeMedia('m1', 't-other', 1)],
    }).bundle;

    const map = buildTacitMediaMap(['t1'], bundle);
    expect(map.get('t1')).toEqual([]);
    expect(map.has('t-other')).toBe(false);
  });

  it('returns empty arrays for items with no media', () => {
    const bundle = makeEngineState({
      step_groups: [],
      step_group_nodes: [],
      node_progress: [],
      tacit_media: [],
    }).bundle;

    const map = buildTacitMediaMap(['t1', 't2'], bundle);
    expect(map.get('t1')).toEqual([]);
    expect(map.get('t2')).toEqual([]);
  });

  it('uses id as tie-breaker when sort_order is equal', () => {
    const bundle = makeEngineState({
      step_groups: [],
      step_group_nodes: [],
      node_progress: [],
      tacit_media: [
        makeMedia('m-beta', 't1', 1),
        makeMedia('m-alpha', 't1', 1),
      ],
    }).bundle;

    const map = buildTacitMediaMap(['t1'], bundle);
    const items = map.get('t1')!;
    expect(items[0].id).toBe('m-alpha');
    expect(items[1].id).toBe('m-beta');
  });
});

// ——— buildTacitDetailViewModel ————————————————

describe('buildTacitDetailViewModel', () => {
  it('returns view model with group, location label, tacit items, and media map', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1, 'loc-wok')],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: false, satisfied_at: null }],
      tacit_items: [makeTacitItem('t1', 'g1', 1, 'Observe color')],
      tacit_media: [makeMedia('m1', 't1', 1)],
      locations: [{ id: 'loc-wok', menu_id: 'm1', label: '웍', loc_key: 'wok' }],
    });
    const vm = buildTacitDetailViewModel(state);
    expect(vm).not.toBeNull();
    expect(vm!.stepGroup.id).toBe('g1');
    expect(vm!.primaryLocationLabel).toBe('웍');
    expect(vm!.tacitItems).toHaveLength(1);
    expect(vm!.tacitItems[0].title).toBe('Observe color');
    expect(vm!.tacitMediaByItemId.get('t1')).toHaveLength(1);
    expect(vm!.tacitMediaByItemId.get('t1')![0].id).toBe('m1');
  });

  it('returns view model with empty tacitItems and empty media map when group has no tacit items', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1)],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: false, satisfied_at: null }],
      tacit_items: [],
    });
    const vm = buildTacitDetailViewModel(state);
    expect(vm).not.toBeNull();
    expect(vm!.stepGroup.id).toBe('g1');
    expect(vm!.primaryLocationLabel).toBeNull();
    expect(vm!.tacitItems).toEqual([]);
    expect(vm!.tacitMediaByItemId.size).toBe(0);
  });

  it('returns null when all groups are complete', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1)],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' }],
    });
    expect(buildTacitDetailViewModel(state)).toBeNull();
  });

  it('excludes media from other step groups', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: false, satisfied_at: null },
        { node_id: 'n2', is_satisfied: false, satisfied_at: null },
      ],
      tacit_items: [
        makeTacitItem('t1', 'g1', 1, 'Group 1 item'),
        makeTacitItem('t2', 'g2', 1, 'Group 2 item'),
      ],
      tacit_media: [
        makeMedia('m1', 't1', 1),
        makeMedia('m2', 't2', 1),
      ],
    });
    const vm = buildTacitDetailViewModel(state);
    expect(vm).not.toBeNull();
    expect(vm!.tacitMediaByItemId.get('t1')).toHaveLength(1);
    expect(vm!.tacitMediaByItemId.has('t2')).toBe(false);
  });
});

// ——— getNextStepGroup ————————————————————————

describe('getNextStepGroup', () => {
  it('returns the next non-empty group after current', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2), makeGroup('g3', 3)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
        { step_group_id: 'g3', node_id: 'n3' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' },
        { node_id: 'n2', is_satisfied: false, satisfied_at: null },
        { node_id: 'n3', is_satisfied: false, satisfied_at: null },
      ],
    });
    expect(getNextStepGroup(state)?.id).toBe('g3');
  });

  it('returns null when current is the last non-empty group', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' },
        { node_id: 'n2', is_satisfied: false, satisfied_at: null },
      ],
    });
    expect(getNextStepGroup(state)).toBeNull();
  });

  it('returns null when all groups are complete', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1)],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' }],
    });
    expect(getNextStepGroup(state)).toBeNull();
  });

  it('skips empty groups between current and next', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g-empty', 2), makeGroup('g3', 3)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g3', node_id: 'n3' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: false, satisfied_at: null },
        { node_id: 'n3', is_satisfied: false, satisfied_at: null },
      ],
    });
    expect(getNextStepGroup(state)?.id).toBe('g3');
  });

  it('returns null when current is the only non-empty group', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g-empty', 2)],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: false, satisfied_at: null }],
    });
    expect(getNextStepGroup(state)).toBeNull();
  });
});

// ——— getTextTacitItemsForGroup ————————————————

function makeTacitItemWithType(
  id: string, groupId: string, sortOrder: number, title: string, tacitType: PracticeTacitType,
): PracticeTacitItem {
  return {
    id, step_group_id: groupId, tacit_type: tacitType, title, body: null, sort_order: sortOrder,
    flame_level: null, color_note: null, viscosity_note: null, sound_note: null, texture_note: null, timing_note: null,
  };
}

describe('getTextTacitItemsForGroup', () => {
  it('excludes media-type tacit items and keeps text types', () => {
    const bundle = makeEngineState({
      step_groups: [],
      step_group_nodes: [],
      node_progress: [],
      tacit_items: [
        makeTacitItemWithType('t1', 'g1', 1, 'Observe color', 'observe'),
        makeTacitItemWithType('t2', 'g1', 2, 'Media ref', 'media'),
        makeTacitItemWithType('t3', 'g1', 3, 'Warning note', 'warning'),
      ],
    }).bundle;

    const items = getTextTacitItemsForGroup('g1', bundle);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Observe color');
    expect(items[1].title).toBe('Warning note');
    expect(items.every((i) => i.tacit_type !== 'media')).toBe(true);
  });

  it('returns empty array when group has only media-type items', () => {
    const bundle = makeEngineState({
      step_groups: [],
      step_group_nodes: [],
      node_progress: [],
      tacit_items: [
        makeTacitItemWithType('t1', 'g1', 1, 'Media only', 'media'),
        makeTacitItemWithType('t2', 'g1', 2, 'Another media', 'media'),
      ],
    }).bundle;

    expect(getTextTacitItemsForGroup('g1', bundle)).toEqual([]);
  });
});

// ——— buildNextGroupPreview ————————————————————

describe('buildNextGroupPreview', () => {
  it('builds view model with location label and text-only tacit items sorted by sort_order', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2, 'loc-wok')],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: false, satisfied_at: null },
        { node_id: 'n2', is_satisfied: false, satisfied_at: null },
      ],
      tacit_items: [
        makeTacitItemWithType('t1', 'g2', 2, 'Item B', 'observe'),
        makeTacitItemWithType('t2', 'g2', 1, 'Item A', 'warning'),
        makeTacitItemWithType('t3', 'g2', 3, 'Media ref', 'media'),
      ],
      locations: [{ id: 'loc-wok', menu_id: 'm1', label: '웍', loc_key: 'wok' }],
    });
    const vm = buildNextGroupPreview(state);
    expect(vm).not.toBeNull();
    expect(vm!.stepGroup.id).toBe('g2');
    expect(vm!.primaryLocationLabel).toBe('웍');
    expect(vm!.tacitItems).toHaveLength(2);
    expect(vm!.tacitItems[0].title).toBe('Item A');
    expect(vm!.tacitItems[1].title).toBe('Item B');
  });

  it('returns empty tacitItems when next group has only media-type items', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: false, satisfied_at: null },
        { node_id: 'n2', is_satisfied: false, satisfied_at: null },
      ],
      tacit_items: [
        makeTacitItemWithType('t1', 'g2', 1, 'Media only', 'media'),
      ],
    });
    const vm = buildNextGroupPreview(state);
    expect(vm).not.toBeNull();
    expect(vm!.tacitItems).toEqual([]);
  });

  it('returns null when no next group exists', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1)],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: false, satisfied_at: null }],
    });
    expect(buildNextGroupPreview(state)).toBeNull();
  });

  it('returns null when all groups are complete', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1)],
      step_group_nodes: [{ step_group_id: 'g1', node_id: 'n1' }],
      node_progress: [{ node_id: 'n1', is_satisfied: true, satisfied_at: '2026-01-01T00:00:00Z' }],
    });
    expect(buildNextGroupPreview(state)).toBeNull();
  });

  it('returns null primaryLocationLabel when next group has no location', () => {
    const state = makeEngineState({
      step_groups: [makeGroup('g1', 1), makeGroup('g2', 2)],
      step_group_nodes: [
        { step_group_id: 'g1', node_id: 'n1' },
        { step_group_id: 'g2', node_id: 'n2' },
      ],
      node_progress: [
        { node_id: 'n1', is_satisfied: false, satisfied_at: null },
        { node_id: 'n2', is_satisfied: false, satisfied_at: null },
      ],
    });
    const vm = buildNextGroupPreview(state);
    expect(vm).not.toBeNull();
    expect(vm!.primaryLocationLabel).toBeNull();
    expect(vm!.tacitItems).toEqual([]);
  });
});
