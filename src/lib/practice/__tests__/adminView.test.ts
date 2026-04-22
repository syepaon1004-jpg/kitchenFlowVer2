import { describe, it, expect } from 'vitest';
import {
  buildMenuStructureSummary,
  buildStepGroupDrilldown,
  buildAdminActionNodeList,
  buildAdminIngredientNodeList,
  buildAdminUnlinkedNodeOptions,
  ADMIN_TACIT_TYPE_LABELS,
  ADMIN_SENSORY_FIELDS,
} from '../adminView';
import type {
  PracticeMenuBundle,
  PracticeStepGroup,
  PracticeStepGroupNode,
  PracticeTacitItem,
  PracticeTacitMedia,
  PracticeTacitType,
  PracticeIngredientNodeWithPath,
  PracticeActionNodeWithLocation,
  PracticeLocation,
} from '../../../types/practice';

// ——— Test helpers ————————————————————————————

function makeBundle(
  overrides: Partial<PracticeMenuBundle> = {},
): PracticeMenuBundle {
  return {
    menu: overrides.menu ?? {
      id: 'm1',
      store_id: 's1',
      name: 'Test Menu',
      description: null,
      image_url: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    locations: overrides.locations ?? [],
    ingredient_nodes: overrides.ingredient_nodes ?? [],
    action_nodes: overrides.action_nodes ?? [],
    step_groups: overrides.step_groups ?? [],
    step_group_nodes: overrides.step_group_nodes ?? [],
    tacit_items: overrides.tacit_items ?? [],
    tacit_media: overrides.tacit_media ?? [],
  };
}

function makeGroup(
  id: string,
  displayStepNo: number,
  title: string,
  opts: Partial<PracticeStepGroup> = {},
): PracticeStepGroup {
  return {
    id,
    menu_id: 'm1',
    display_step_no: displayStepNo,
    title,
    summary: opts.summary ?? null,
    primary_location_id: opts.primary_location_id ?? null,
  };
}

function makeTacitItem(
  id: string,
  stepGroupId: string,
  tacitType: PracticeTacitType,
  sortOrder: number,
): PracticeTacitItem {
  return {
    id,
    step_group_id: stepGroupId,
    tacit_type: tacitType,
    title: `tacit-${id}`,
    body: null,
    sort_order: sortOrder,
    flame_level: null,
    color_note: null,
    viscosity_note: null,
    sound_note: null,
    texture_note: null,
    timing_note: null,
  };
}

function makeTacitMedia(
  id: string,
  tacitItemId: string,
  sortOrder: number,
): PracticeTacitMedia {
  return {
    id,
    tacit_item_id: tacitItemId,
    media_type: 'image',
    url: `https://example.com/${id}.jpg`,
    sort_order: sortOrder,
  };
}

function makeIngredientNode(nodeId: string): PracticeIngredientNodeWithPath {
  return {
    node: { id: nodeId, menu_id: 'm1', node_type: 'ingredient', step_no: 1 },
    ingredient: { node_id: nodeId, ingredient_id: 'ing1', is_deco: false, quantity: 1 },
    location_path: [],
  };
}

function makeActionNode(nodeId: string): PracticeActionNodeWithLocation {
  return {
    node: { id: nodeId, menu_id: 'm1', node_type: 'action', step_no: 2 },
    action: { node_id: nodeId, action_type: 'fry', location_id: 'loc1', duration_sec: null },
  };
}

function makeStepGroupNode(
  stepGroupId: string,
  nodeId: string,
): PracticeStepGroupNode {
  return { step_group_id: stepGroupId, node_id: nodeId };
}

// ——— Tests ——————————————————————————————————

describe('buildMenuStructureSummary', () => {
  it('returns all zeros for an empty bundle', () => {
    const result = buildMenuStructureSummary(makeBundle());

    expect(result.menuId).toBe('m1');
    expect(result.menuName).toBe('Test Menu');
    expect(result.totalNodes).toBe(0);
    expect(result.ingredientNodeCount).toBe(0);
    expect(result.actionNodeCount).toBe(0);
    expect(result.stepGroupCount).toBe(0);
    expect(result.tacitItemCount).toBe(0);
    expect(result.tacitMediaCount).toBe(0);
    expect(result.groups).toEqual([]);
  });

  it('counts ingredient and action nodes correctly', () => {
    const result = buildMenuStructureSummary(
      makeBundle({
        ingredient_nodes: [
          makeIngredientNode('n1'),
          makeIngredientNode('n2'),
          makeIngredientNode('n3'),
        ],
        action_nodes: [
          makeActionNode('n4'),
          makeActionNode('n5'),
        ],
      }),
    );

    expect(result.ingredientNodeCount).toBe(3);
    expect(result.actionNodeCount).toBe(2);
    expect(result.totalNodes).toBe(5);
  });

  it('counts per-group tacit text, pure media, and linked media', () => {
    const g1 = makeGroup('g1', 1, '준비');
    const g2 = makeGroup('g2', 2, '조리');

    const tacitItems: PracticeTacitItem[] = [
      makeTacitItem('t1', 'g1', 'observe', 1),
      makeTacitItem('t2', 'g1', 'warning', 2),
      makeTacitItem('t3', 'g1', 'media', 3),
      makeTacitItem('t4', 'g2', 'adjust', 1),
    ];

    const tacitMedia: PracticeTacitMedia[] = [
      makeTacitMedia('m1', 't1', 1),
      makeTacitMedia('m2', 't3', 1),
      makeTacitMedia('m3', 't3', 2),
    ];

    const result = buildMenuStructureSummary(
      makeBundle({
        step_groups: [g1, g2],
        tacit_items: tacitItems,
        tacit_media: tacitMedia,
      }),
    );

    expect(result.tacitItemCount).toBe(4);
    expect(result.tacitMediaCount).toBe(3);

    expect(result.groups).toHaveLength(2);

    const cov1 = result.groups[0];
    expect(cov1.groupId).toBe('g1');
    expect(cov1.textTacitCount).toBe(2);
    expect(cov1.pureMediaTacitCount).toBe(1);
    expect(cov1.linkedMediaCount).toBe(3);

    const cov2 = result.groups[1];
    expect(cov2.groupId).toBe('g2');
    expect(cov2.textTacitCount).toBe(1);
    expect(cov2.pureMediaTacitCount).toBe(0);
    expect(cov2.linkedMediaCount).toBe(0);
  });

  it('counts step_group_nodes per group', () => {
    const g1 = makeGroup('g1', 1, '준비');
    const g2 = makeGroup('g2', 2, '조리');

    const result = buildMenuStructureSummary(
      makeBundle({
        step_groups: [g1, g2],
        step_group_nodes: [
          makeStepGroupNode('g1', 'n1'),
          makeStepGroupNode('g1', 'n2'),
          makeStepGroupNode('g1', 'n3'),
          makeStepGroupNode('g2', 'n4'),
        ],
      }),
    );

    expect(result.groups[0].nodeCount).toBe(3);
    expect(result.groups[1].nodeCount).toBe(1);
  });

  it('sorts groups by display_step_no ascending', () => {
    const result = buildMenuStructureSummary(
      makeBundle({
        step_groups: [
          makeGroup('g3', 3, '마무리'),
          makeGroup('g1', 1, '준비'),
          makeGroup('g2', 2, '조리'),
        ],
      }),
    );

    expect(result.groups.map((g) => g.displayStepNo)).toEqual([1, 2, 3]);
    expect(result.groups.map((g) => g.groupId)).toEqual(['g1', 'g2', 'g3']);
  });

  it('extracts menuId and menuName from bundle.menu', () => {
    const result = buildMenuStructureSummary(
      makeBundle({
        menu: {
          id: 'custom-id',
          store_id: 's1',
          name: '김치찌개',
          description: null,
          image_url: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      }),
    );

    expect(result.menuId).toBe('custom-id');
    expect(result.menuName).toBe('김치찌개');
  });
});

// ——— buildStepGroupDrilldown tests ————————————

function makeLocation(id: string, label: string): PracticeLocation {
  return { id, menu_id: 'm1', label, loc_key: id };
}

function makeIngredientNodeFull(
  nodeId: string,
  stepNo: number,
  opts: {
    ingredientId?: string;
    isDeco?: boolean;
    quantity?: number;
    locationPath?: Array<{ seq: number; location_id: string }>;
  } = {},
): PracticeIngredientNodeWithPath {
  return {
    node: { id: nodeId, menu_id: 'm1', node_type: 'ingredient', step_no: stepNo },
    ingredient: {
      node_id: nodeId,
      ingredient_id: opts.ingredientId ?? 'ing1',
      is_deco: opts.isDeco ?? false,
      quantity: opts.quantity ?? 1,
    },
    location_path: (opts.locationPath ?? []).map((lp) => ({
      node_id: nodeId,
      seq: lp.seq,
      location_id: lp.location_id,
    })),
  };
}

function makeActionNodeFull(
  nodeId: string,
  stepNo: number,
  opts: {
    actionType?: 'fry' | 'stir' | 'microwave' | 'boil';
    locationId?: string;
    durationSec?: number | null;
  } = {},
): PracticeActionNodeWithLocation {
  return {
    node: { id: nodeId, menu_id: 'm1', node_type: 'action', step_no: stepNo },
    action: {
      node_id: nodeId,
      action_type: opts.actionType ?? 'fry',
      location_id: opts.locationId ?? 'loc1',
      duration_sec: opts.durationSec ?? null,
    },
  };
}

describe('buildStepGroupDrilldown', () => {
  it('returns null for unknown groupId', () => {
    const result = buildStepGroupDrilldown('nonexistent', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
    }));
    expect(result).toBeNull();
  });

  it('returns empty arrays for a group with no nodes or tacit items', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
    }));
    expect(result).not.toBeNull();
    expect(result!.groupId).toBe('g1');
    expect(result!.displayStepNo).toBe(1);
    expect(result!.title).toBe('준비');
    expect(result!.ingredientNodes).toEqual([]);
    expect(result!.actionNodes).toEqual([]);
    expect(result!.textTacitItems).toEqual([]);
    expect(result!.pureMediaItems).toEqual([]);
    expect(result!.totalMediaCount).toBe(0);
  });

  it('partitions nodes into ingredient and action correctly', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      ingredient_nodes: [
        makeIngredientNodeFull('n1', 1),
        makeIngredientNodeFull('n2', 2),
      ],
      action_nodes: [makeActionNodeFull('n3', 3)],
      step_group_nodes: [
        makeStepGroupNode('g1', 'n1'),
        makeStepGroupNode('g1', 'n2'),
        makeStepGroupNode('g1', 'n3'),
      ],
    }));
    expect(result!.ingredientNodes).toHaveLength(2);
    expect(result!.actionNodes).toHaveLength(1);
  });

  it('maps ingredient node fields including stepNo, ingredientId, isDeco, quantity, locationPathLabels', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      locations: [makeLocation('loc-a', '워크스테이션'), makeLocation('loc-b', '냉장고')],
      ingredient_nodes: [
        makeIngredientNodeFull('n1', 5, {
          ingredientId: 'onion',
          isDeco: true,
          quantity: 3,
          locationPath: [
            { seq: 2, location_id: 'loc-b' },
            { seq: 1, location_id: 'loc-a' },
          ],
        }),
      ],
      step_group_nodes: [makeStepGroupNode('g1', 'n1')],
    }));
    const node = result!.ingredientNodes[0];
    expect(node.nodeId).toBe('n1');
    expect(node.stepNo).toBe(5);
    expect(node.ingredientId).toBe('onion');
    expect(node.isDeco).toBe(true);
    expect(node.quantity).toBe(3);
    expect(node.locationPathLabels).toEqual(['워크스테이션', '냉장고']);
  });

  it('maps action node fields with location label resolution and durationSec', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '조리')],
      locations: [makeLocation('loc1', '가스레인지')],
      action_nodes: [
        makeActionNodeFull('n1', 2, { actionType: 'stir', locationId: 'loc1', durationSec: 30 }),
        makeActionNodeFull('n2', 3, { actionType: 'boil', locationId: 'unknown-loc', durationSec: null }),
      ],
      step_group_nodes: [
        makeStepGroupNode('g1', 'n1'),
        makeStepGroupNode('g1', 'n2'),
      ],
    }));
    const a1 = result!.actionNodes[0];
    expect(a1.actionType).toBe('stir');
    expect(a1.locationLabel).toBe('가스레인지');
    expect(a1.durationSec).toBe(30);

    const a2 = result!.actionNodes[1];
    expect(a2.locationLabel).toBeNull();
    expect(a2.durationSec).toBeNull();
  });

  it('sorts nodes by step_no ASC then nodeId ASC', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      ingredient_nodes: [
        makeIngredientNodeFull('n-b', 2),
        makeIngredientNodeFull('n-a', 2),
        makeIngredientNodeFull('n-c', 1),
      ],
      step_group_nodes: [
        makeStepGroupNode('g1', 'n-b'),
        makeStepGroupNode('g1', 'n-a'),
        makeStepGroupNode('g1', 'n-c'),
      ],
    }));
    expect(result!.ingredientNodes.map((n) => n.nodeId)).toEqual(['n-c', 'n-a', 'n-b']);
  });

  it('sorts text tacit items by sort_order ASC then id ASC', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      tacit_items: [
        makeTacitItem('t-c', 'g1', 'warning', 2),
        makeTacitItem('t-a', 'g1', 'observe', 1),
        makeTacitItem('t-b', 'g1', 'adjust', 1),
      ],
    }));
    expect(result!.textTacitItems.map((t) => t.id)).toEqual(['t-a', 't-b', 't-c']);
  });

  it('extracts sensory entries for non-null fields with correct labels', () => {
    const item: PracticeTacitItem = {
      ...makeTacitItem('t1', 'g1', 'observe', 1),
      flame_level: '중불',
      color_note: '갈색',
      viscosity_note: null,
      sound_note: null,
      texture_note: null,
      timing_note: null,
    };
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      tacit_items: [item],
    }));
    const entries = result!.textTacitItems[0].sensoryEntries;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ field: 'flame_level', label: '불 세기', value: '중불' });
    expect(entries[1]).toEqual({ field: 'color_note', label: '색', value: '갈색' });
  });

  it('includes linkedMedia for text tacit items, sorted by sort_order then id', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      tacit_items: [makeTacitItem('t1', 'g1', 'observe', 1)],
      tacit_media: [
        { id: 'm-b', tacit_item_id: 't1', media_type: 'video', url: 'v.mp4', sort_order: 2 },
        { id: 'm-a', tacit_item_id: 't1', media_type: 'image', url: 'i.jpg', sort_order: 1 },
      ],
    }));
    const media = result!.textTacitItems[0].linkedMedia;
    expect(media).toHaveLength(2);
    expect(media[0].id).toBe('m-a');
    expect(media[0].mediaType).toBe('image');
    expect(media[1].id).toBe('m-b');
    expect(media[1].mediaType).toBe('video');
  });

  it('returns empty linkedMedia for text tacit item with no media', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      tacit_items: [makeTacitItem('t1', 'g1', 'reason', 1)],
    }));
    expect(result!.textTacitItems[0].linkedMedia).toEqual([]);
  });

  it('maps pure media items with linked media, sorted by sort_order then id', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      tacit_items: [makeTacitItem('t1', 'g1', 'media', 1)],
      tacit_media: [
        { id: 'm2', tacit_item_id: 't1', media_type: 'video', url: 'v.mp4', sort_order: 2 },
        { id: 'm1', tacit_item_id: 't1', media_type: 'image', url: 'i.jpg', sort_order: 1 },
      ],
    }));
    expect(result!.pureMediaItems).toHaveLength(1);
    expect(result!.pureMediaItems[0].id).toBe('t1');
    expect(result!.pureMediaItems[0].media).toHaveLength(2);
    expect(result!.pureMediaItems[0].media[0].id).toBe('m1');
  });

  it('excludes pure media items with 0 media files', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      tacit_items: [makeTacitItem('t1', 'g1', 'media', 1)],
      tacit_media: [],
    }));
    expect(result!.pureMediaItems).toEqual([]);
  });

  it('aggregates totalMediaCount across text linked + pure media', () => {
    const result = buildStepGroupDrilldown('g1', makeBundle({
      step_groups: [makeGroup('g1', 1, '준비')],
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', 1),
        makeTacitItem('t2', 'g1', 'media', 2),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't1', 1),
        makeTacitMedia('m2', 't2', 1),
        makeTacitMedia('m3', 't2', 2),
      ],
    }));
    expect(result!.totalMediaCount).toBe(3);
  });

  it('exports correct label constants', () => {
    expect(ADMIN_TACIT_TYPE_LABELS.observe).toBe('관찰');
    expect(ADMIN_TACIT_TYPE_LABELS.adjust).toBe('조절');
    expect(ADMIN_TACIT_TYPE_LABELS.warning).toBe('주의');
    expect(ADMIN_TACIT_TYPE_LABELS.reason).toBe('이유');
    expect('media' in ADMIN_TACIT_TYPE_LABELS).toBe(false);

    expect(ADMIN_SENSORY_FIELDS).toHaveLength(6);
    expect(ADMIN_SENSORY_FIELDS[0]).toEqual({ field: 'flame_level', label: '불 세기' });
  });
});

// ——— buildAdminActionNodeList tests ————————

describe('buildAdminActionNodeList', () => {
  it('returns empty array for bundle with no action nodes', () => {
    expect(buildAdminActionNodeList(makeBundle())).toEqual([]);
  });

  it('maps every action node field including locationId and resolved label', () => {
    const result = buildAdminActionNodeList(
      makeBundle({
        locations: [makeLocation('loc1', '가스레인지')],
        action_nodes: [
          makeActionNodeFull('n1', 2, {
            actionType: 'stir',
            locationId: 'loc1',
            durationSec: 30,
          }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      nodeId: 'n1',
      stepNo: 2,
      actionType: 'stir',
      locationId: 'loc1',
      locationLabel: '가스레인지',
      durationSec: 30,
    });
  });

  it('sets locationLabel null when location_id is unknown but preserves locationId', () => {
    const result = buildAdminActionNodeList(
      makeBundle({
        locations: [],
        action_nodes: [
          makeActionNodeFull('n1', 1, { locationId: 'missing-loc' }),
        ],
      }),
    );
    expect(result[0].locationId).toBe('missing-loc');
    expect(result[0].locationLabel).toBeNull();
  });

  it('sorts by stepNo ASC then nodeId ASC', () => {
    const result = buildAdminActionNodeList(
      makeBundle({
        action_nodes: [
          makeActionNodeFull('n-b', 2),
          makeActionNodeFull('n-a', 2),
          makeActionNodeFull('n-c', 1),
        ],
      }),
    );
    expect(result.map((i) => i.nodeId)).toEqual(['n-c', 'n-a', 'n-b']);
  });

  it('returns all action nodes even when no step_group_nodes link them (authoring-before-group)', () => {
    const result = buildAdminActionNodeList(
      makeBundle({
        step_groups: [],
        step_group_nodes: [],
        action_nodes: [
          makeActionNodeFull('n1', 1),
          makeActionNodeFull('n2', 2),
        ],
      }),
    );
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.nodeId)).toEqual(['n1', 'n2']);
  });

  it('preserves null durationSec', () => {
    const result = buildAdminActionNodeList(
      makeBundle({
        action_nodes: [
          makeActionNodeFull('n1', 1, { durationSec: null }),
        ],
      }),
    );
    expect(result[0].durationSec).toBeNull();
  });
});

// ——— buildAdminIngredientNodeList tests ————————

describe('buildAdminIngredientNodeList', () => {
  it('returns empty array for bundle with no ingredient nodes', () => {
    expect(buildAdminIngredientNodeList(makeBundle())).toEqual([]);
  });

  it('maps every ingredient node field including stepNo, ingredientId, isDeco, quantity, locationPathLabels', () => {
    const result = buildAdminIngredientNodeList(
      makeBundle({
        locations: [
          makeLocation('loc-a', '워크스테이션'),
          makeLocation('loc-b', '냉장고'),
        ],
        ingredient_nodes: [
          makeIngredientNodeFull('n1', 2, {
            ingredientId: 'onion',
            isDeco: true,
            quantity: 3,
            locationPath: [
              { seq: 0, location_id: 'loc-a' },
              { seq: 1, location_id: 'loc-b' },
            ],
          }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      nodeId: 'n1',
      stepNo: 2,
      ingredientId: 'onion',
      isDeco: true,
      quantity: 3,
      locationPathLabels: ['워크스테이션', '냉장고'],
    });
  });

  it('uses location_id as label fallback when location is unknown', () => {
    const result = buildAdminIngredientNodeList(
      makeBundle({
        locations: [],
        ingredient_nodes: [
          makeIngredientNodeFull('n1', 1, {
            locationPath: [{ seq: 0, location_id: 'missing-loc' }],
          }),
        ],
      }),
    );
    expect(result[0].locationPathLabels).toEqual(['missing-loc']);
  });

  it('sorts by stepNo ASC then nodeId ASC', () => {
    const result = buildAdminIngredientNodeList(
      makeBundle({
        ingredient_nodes: [
          makeIngredientNodeFull('n-b', 2),
          makeIngredientNodeFull('n-a', 2),
          makeIngredientNodeFull('n-c', 1),
        ],
      }),
    );
    expect(result.map((i) => i.nodeId)).toEqual(['n-c', 'n-a', 'n-b']);
  });

  it('returns all ingredient nodes even when no step_group_nodes link them (authoring-before-group)', () => {
    const result = buildAdminIngredientNodeList(
      makeBundle({
        step_groups: [],
        step_group_nodes: [],
        ingredient_nodes: [
          makeIngredientNodeFull('n1', 1),
          makeIngredientNodeFull('n2', 2),
        ],
      }),
    );
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.nodeId)).toEqual(['n1', 'n2']);
  });

  it('sorts location_path by seq ASC regardless of input order', () => {
    const result = buildAdminIngredientNodeList(
      makeBundle({
        locations: [
          makeLocation('loc-1', 'L1'),
          makeLocation('loc-2', 'L2'),
          makeLocation('loc-3', 'L3'),
        ],
        ingredient_nodes: [
          makeIngredientNodeFull('n1', 1, {
            locationPath: [
              { seq: 2, location_id: 'loc-3' },
              { seq: 0, location_id: 'loc-1' },
              { seq: 1, location_id: 'loc-2' },
            ],
          }),
        ],
      }),
    );
    expect(result[0].locationPathLabels).toEqual(['L1', 'L2', 'L3']);
  });
});

// ——— buildAdminUnlinkedNodeOptions tests ————————

describe('buildAdminUnlinkedNodeOptions', () => {
  it('returns empty array for an empty bundle', () => {
    expect(buildAdminUnlinkedNodeOptions(makeBundle())).toEqual([]);
  });

  it('returns empty array when every node is already linked', () => {
    const result = buildAdminUnlinkedNodeOptions(
      makeBundle({
        ingredient_nodes: [makeIngredientNodeFull('n1', 1)],
        action_nodes: [makeActionNodeFull('n2', 1)],
        step_group_nodes: [
          makeStepGroupNode('g1', 'n1'),
          makeStepGroupNode('g1', 'n2'),
        ],
      }),
    );
    expect(result).toEqual([]);
  });

  it('returns only nodes that are not present in step_group_nodes', () => {
    const result = buildAdminUnlinkedNodeOptions(
      makeBundle({
        ingredient_nodes: [
          makeIngredientNodeFull('i-linked', 1),
          makeIngredientNodeFull('i-free', 2),
        ],
        action_nodes: [
          makeActionNodeFull('a-linked', 1),
          makeActionNodeFull('a-free', 3),
        ],
        step_group_nodes: [
          makeStepGroupNode('g1', 'i-linked'),
          makeStepGroupNode('g1', 'a-linked'),
        ],
      }),
    );
    expect(result.map((o) => o.nodeId).sort()).toEqual(['a-free', 'i-free']);
  });

  it('sorts by stepNo ASC first', () => {
    const result = buildAdminUnlinkedNodeOptions(
      makeBundle({
        ingredient_nodes: [
          makeIngredientNodeFull('n-c', 3),
          makeIngredientNodeFull('n-a', 1),
        ],
        action_nodes: [makeActionNodeFull('n-b', 2)],
      }),
    );
    expect(result.map((o) => o.stepNo)).toEqual([1, 2, 3]);
    expect(result.map((o) => o.nodeId)).toEqual(['n-a', 'n-b', 'n-c']);
  });

  it('places action before ingredient on tied stepNo', () => {
    const result = buildAdminUnlinkedNodeOptions(
      makeBundle({
        ingredient_nodes: [makeIngredientNodeFull('n-ing', 2)],
        action_nodes: [makeActionNodeFull('n-act', 2)],
      }),
    );
    expect(result.map((o) => o.nodeType)).toEqual(['action', 'ingredient']);
  });

  it('maps action node fields with nodeType=action and null ingredient fields', () => {
    const result = buildAdminUnlinkedNodeOptions(
      makeBundle({
        action_nodes: [
          makeActionNodeFull('a1', 4, {
            actionType: 'stir',
            locationId: 'loc-x',
            durationSec: 30,
          }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      nodeId: 'a1',
      nodeType: 'action',
      stepNo: 4,
      ingredientId: null,
      isDeco: null,
      quantity: null,
      actionType: 'stir',
      locationId: 'loc-x',
    });
  });

  it('maps ingredient node fields with nodeType=ingredient and null action fields', () => {
    const result = buildAdminUnlinkedNodeOptions(
      makeBundle({
        ingredient_nodes: [
          makeIngredientNodeFull('i1', 5, {
            ingredientId: 'onion',
            isDeco: true,
            quantity: 2,
          }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      nodeId: 'i1',
      nodeType: 'ingredient',
      stepNo: 5,
      ingredientId: 'onion',
      isDeco: true,
      quantity: 2,
      actionType: null,
      locationId: null,
    });
  });

  it('breaks ties within same nodeType by nodeId ASC', () => {
    const result = buildAdminUnlinkedNodeOptions(
      makeBundle({
        action_nodes: [
          makeActionNodeFull('n-b', 1),
          makeActionNodeFull('n-a', 1),
        ],
      }),
    );
    expect(result.map((o) => o.nodeId)).toEqual(['n-a', 'n-b']);
  });
});
