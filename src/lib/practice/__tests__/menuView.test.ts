import { describe, it, expect } from 'vitest';
import {
  buildTacitPreviews,
  buildPureMediaPreviews,
  buildStepGroupBrowseList,
  TACIT_TYPE_LABELS,
  SENSORY_FIELD_LABELS,
  isTextTacitType,
} from '../menuView';
import type { SensoryField } from '../menuView';
import type {
  PracticeMenuBundle,
  PracticeStepGroup,
  PracticeTacitItem,
  PracticeTacitMedia,
  PracticeTacitType,
  PracticeLocation,
} from '../../../types/practice';

// ——— Test helpers ————————————————————————————

function makeBundle(
  overrides: Partial<PracticeMenuBundle> = {},
): PracticeMenuBundle {
  return {
    menu: {
      id: 'm1',
      store_id: 's1',
      name: 'Test Menu',
      description: null,
      image_url: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    locations: overrides.locations ?? [],
    ingredient_nodes: [],
    action_nodes: [],
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
  title: string,
  sortOrder: number,
  sensory?: Partial<Pick<PracticeTacitItem, SensoryField>>,
): PracticeTacitItem {
  return {
    id,
    step_group_id: stepGroupId,
    tacit_type: tacitType,
    title,
    body: null,
    sort_order: sortOrder,
    flame_level: sensory?.flame_level ?? null,
    color_note: sensory?.color_note ?? null,
    viscosity_note: sensory?.viscosity_note ?? null,
    sound_note: sensory?.sound_note ?? null,
    texture_note: sensory?.texture_note ?? null,
    timing_note: sensory?.timing_note ?? null,
  };
}

function makeLoc(id: string, label: string): PracticeLocation {
  return { id, menu_id: 'm1', label, loc_key: id };
}

function makeTacitMedia(
  id: string,
  tacitItemId: string,
  mediaType: 'image' | 'video',
  url: string,
  sortOrder: number,
): PracticeTacitMedia {
  return { id, tacit_item_id: tacitItemId, media_type: mediaType, url, sort_order: sortOrder };
}

// ——— Tests ———————————————————————————————————

describe('TACIT_TYPE_LABELS', () => {
  it('contains labels for all non-media tacit types', () => {
    expect(TACIT_TYPE_LABELS.observe).toBe('관찰');
    expect(TACIT_TYPE_LABELS.adjust).toBe('조절');
    expect(TACIT_TYPE_LABELS.warning).toBe('주의');
    expect(TACIT_TYPE_LABELS.reason).toBe('이유');
  });

  it('does not contain media key', () => {
    expect('media' in TACIT_TYPE_LABELS).toBe(false);
  });
});

describe('SENSORY_FIELD_LABELS', () => {
  it('has Korean labels for all 6 sensory fields', () => {
    expect(Object.keys(SENSORY_FIELD_LABELS)).toHaveLength(6);
    expect(SENSORY_FIELD_LABELS.flame_level).toBe('불 세기');
    expect(SENSORY_FIELD_LABELS.color_note).toBe('색');
    expect(SENSORY_FIELD_LABELS.viscosity_note).toBe('점도');
    expect(SENSORY_FIELD_LABELS.sound_note).toBe('소리');
    expect(SENSORY_FIELD_LABELS.texture_note).toBe('질감');
    expect(SENSORY_FIELD_LABELS.timing_note).toBe('타이밍');
  });
});

describe('isTextTacitType', () => {
  it('returns true for non-media types', () => {
    expect(isTextTacitType('observe')).toBe(true);
    expect(isTextTacitType('adjust')).toBe(true);
    expect(isTextTacitType('warning')).toBe(true);
    expect(isTextTacitType('reason')).toBe(true);
  });

  it('returns false for media type', () => {
    expect(isTextTacitType('media')).toBe(false);
  });
});

describe('buildTacitPreviews', () => {
  it('returns compact previews with id, tacitType, and title', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '달걀 색 변화', 1),
        makeTacitItem('t2', 'g1', 'warning', '참기름 타이밍', 2),
      ],
    });

    const previews = buildTacitPreviews('g1', bundle);
    expect(previews).toEqual([
      { id: 't1', tacitType: 'observe', title: '달걀 색 변화', body: null, sensoryEntries: [], mediaEntries: [] },
      { id: 't2', tacitType: 'warning', title: '참기름 타이밍', body: null, sensoryEntries: [], mediaEntries: [] },
    ]);
  });

  it('excludes media-type tacit items', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '관찰 항목', 1),
        makeTacitItem('t2', 'g1', 'media', '미디어 항목', 2),
        makeTacitItem('t3', 'g1', 'adjust', '조절 항목', 3),
      ],
    });

    const previews = buildTacitPreviews('g1', bundle);
    expect(previews).toHaveLength(2);
    expect(previews.map((p) => p.id)).toEqual(['t1', 't3']);
  });

  it('sorts by sort_order ascending', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t3', 'g1', 'reason', '세 번째', 3),
        makeTacitItem('t1', 'g1', 'observe', '첫 번째', 1),
        makeTacitItem('t2', 'g1', 'warning', '두 번째', 2),
      ],
    });

    const previews = buildTacitPreviews('g1', bundle);
    expect(previews.map((p) => p.id)).toEqual(['t1', 't2', 't3']);
  });

  it('returns empty array when group has no tacit items', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'other-group', 'observe', '다른 그룹', 1),
      ],
    });

    expect(buildTacitPreviews('g1', bundle)).toEqual([]);
  });

  it('includes body field (string or null)', () => {
    const withBody = makeTacitItem('t1', 'g1', 'observe', '관찰', 1);
    withBody.body = '달걀이 반투명해질 때까지 저어주세요';
    const withoutBody = makeTacitItem('t2', 'g1', 'warning', '주의', 2);

    const bundle = makeBundle({ tacit_items: [withBody, withoutBody] });
    const previews = buildTacitPreviews('g1', bundle);

    expect(previews[0].body).toBe('달걀이 반투명해질 때까지 저어주세요');
    expect(previews[1].body).toBeNull();
  });

  it('returns empty array for nonexistent group', () => {
    const bundle = makeBundle({ tacit_items: [] });
    expect(buildTacitPreviews('nonexistent', bundle)).toEqual([]);
  });

  it('returns empty sensoryEntries when all sensory fields are null', () => {
    const bundle = makeBundle({
      tacit_items: [makeTacitItem('t1', 'g1', 'observe', '관찰', 1)],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].sensoryEntries).toEqual([]);
  });

  it('includes only non-null sensory fields with correct label and value', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '관찰', 1, {
          flame_level: '중불',
          sound_note: '지글지글',
        }),
      ],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].sensoryEntries).toEqual([
      { field: 'flame_level', label: '불 세기', value: '중불' },
      { field: 'sound_note', label: '소리', value: '지글지글' },
    ]);
  });

  it('maintains SENSORY_FIELDS ordering regardless of which fields are set', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'adjust', '조절', 1, {
          timing_note: '30초',
          flame_level: '강불',
        }),
      ],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].sensoryEntries.map((e) => e.field)).toEqual([
      'flame_level',
      'timing_note',
    ]);
  });

  it('includes all 6 sensory fields when all are non-null', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '전체 감각', 1, {
          flame_level: '중불',
          color_note: '황금빛',
          viscosity_note: '걸쭉',
          sound_note: '보글보글',
          texture_note: '바삭',
          timing_note: '2분',
        }),
      ],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].sensoryEntries).toHaveLength(6);
    expect(previews[0].sensoryEntries.map((e) => e.field)).toEqual([
      'flame_level',
      'color_note',
      'viscosity_note',
      'sound_note',
      'texture_note',
      'timing_note',
    ]);
  });

  it('includes mediaEntries for tacit items with linked tacit_media', () => {
    const bundle = makeBundle({
      tacit_items: [makeTacitItem('t1', 'g1', 'observe', '색 확인', 1)],
      tacit_media: [
        makeTacitMedia('m1', 't1', 'image', 'https://example.com/img.jpg', 1),
        makeTacitMedia('m2', 't1', 'video', 'https://example.com/vid.mp4', 2),
      ],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].mediaEntries).toEqual([
      { id: 'm1', mediaType: 'image', url: 'https://example.com/img.jpg' },
      { id: 'm2', mediaType: 'video', url: 'https://example.com/vid.mp4' },
    ]);
  });

  it('sorts mediaEntries by sort_order, then id as tie-breaker', () => {
    const bundle = makeBundle({
      tacit_items: [makeTacitItem('t1', 'g1', 'observe', '관찰', 1)],
      tacit_media: [
        makeTacitMedia('m-b', 't1', 'image', 'https://example.com/b.jpg', 1),
        makeTacitMedia('m-a', 't1', 'image', 'https://example.com/a.jpg', 1),
        makeTacitMedia('m-c', 't1', 'video', 'https://example.com/c.mp4', 0),
      ],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].mediaEntries.map((e) => e.id)).toEqual(['m-c', 'm-a', 'm-b']);
  });

  it('returns empty mediaEntries when tacit item has no linked media', () => {
    const bundle = makeBundle({
      tacit_items: [makeTacitItem('t1', 'g1', 'adjust', '조절', 1)],
      tacit_media: [],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].mediaEntries).toEqual([]);
  });

  it('excludes media-type tacit items even if they have linked tacit_media', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'media', '미디어 타입', 1),
        makeTacitItem('t2', 'g1', 'observe', '관찰', 2),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't1', 'image', 'https://example.com/excluded.jpg', 1),
        makeTacitMedia('m2', 't2', 'image', 'https://example.com/included.jpg', 1),
      ],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews).toHaveLength(1);
    expect(previews[0].id).toBe('t2');
    expect(previews[0].mediaEntries).toHaveLength(1);
  });

  it('does not include media from other groups', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '그룹1', 1),
        makeTacitItem('t2', 'g2', 'observe', '그룹2', 1),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't2', 'image', 'https://example.com/other.jpg', 1),
      ],
    });
    const previews = buildTacitPreviews('g1', bundle);
    expect(previews[0].mediaEntries).toEqual([]);
  });
});

describe('buildStepGroupBrowseList', () => {
  it('builds view models for all step groups sorted by display_step_no', () => {
    const bundle = makeBundle({
      step_groups: [
        makeGroup('g3', 3, '세 번째 단계'),
        makeGroup('g1', 1, '첫 번째 단계'),
        makeGroup('g2', 2, '두 번째 단계'),
      ],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list.map((vm) => vm.displayStepNo)).toEqual([1, 2, 3]);
    expect(list.map((vm) => vm.groupId)).toEqual(['g1', 'g2', 'g3']);
  });

  it('resolves primaryLocationLabel from locations', () => {
    const bundle = makeBundle({
      locations: [makeLoc('loc-wok', '웍')],
      step_groups: [
        makeGroup('g1', 1, '볶기', { primary_location_id: 'loc-wok' }),
      ],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list[0].primaryLocationLabel).toBe('웍');
  });

  it('returns null primaryLocationLabel when group has no location', () => {
    const bundle = makeBundle({
      step_groups: [
        makeGroup('g1', 1, '준비', { primary_location_id: null }),
      ],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list[0].primaryLocationLabel).toBeNull();
  });

  it('returns null primaryLocationLabel when location id not found', () => {
    const bundle = makeBundle({
      locations: [makeLoc('loc-wok', '웍')],
      step_groups: [
        makeGroup('g1', 1, '볶기', { primary_location_id: 'loc-unknown' }),
      ],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list[0].primaryLocationLabel).toBeNull();
  });

  it('includes tacitPreviews for each group', () => {
    const bundle = makeBundle({
      step_groups: [
        makeGroup('g1', 1, '단계 A'),
        makeGroup('g2', 2, '단계 B'),
      ],
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', 'A 관찰', 1),
        makeTacitItem('t2', 'g2', 'warning', 'B 주의', 1),
        makeTacitItem('t3', 'g2', 'reason', 'B 이유', 2),
      ],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list[0].tacitPreviews).toHaveLength(1);
    expect(list[0].tacitPreviews[0].title).toBe('A 관찰');
    expect(list[1].tacitPreviews).toHaveLength(2);
  });

  it('returns empty array when bundle has no step groups', () => {
    const bundle = makeBundle({ step_groups: [] });
    expect(buildStepGroupBrowseList(bundle)).toEqual([]);
  });

  it('includes groups with no tacit items (empty tacitPreviews)', () => {
    const bundle = makeBundle({
      step_groups: [makeGroup('g1', 1, '빈 단계')],
      tacit_items: [],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list).toHaveLength(1);
    expect(list[0].tacitPreviews).toEqual([]);
  });

  it('tacitPreviews carry sensoryEntries from source items', () => {
    const bundle = makeBundle({
      step_groups: [makeGroup('g1', 1, '볶기')],
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '색 확인', 1, {
          color_note: '황금빛',
        }),
      ],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list[0].tacitPreviews[0].sensoryEntries).toEqual([
      { field: 'color_note', label: '색', value: '황금빛' },
    ]);
  });

  it('includes pureMediaPreviews for groups with media-type items', () => {
    const bundle = makeBundle({
      step_groups: [makeGroup('g1', 1, '단계 A')],
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '관찰', 1),
        makeTacitItem('t2', 'g1', 'media', '참고 사진', 2),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't2', 'image', 'https://example.com/ref.jpg', 1),
      ],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list[0].tacitPreviews).toHaveLength(1);
    expect(list[0].pureMediaPreviews).toHaveLength(1);
    expect(list[0].pureMediaPreviews[0].itemId).toBe('t2');
  });

  it('returns empty pureMediaPreviews when group has no media-type items', () => {
    const bundle = makeBundle({
      step_groups: [makeGroup('g1', 1, '빈 단계')],
      tacit_items: [],
    });

    const list = buildStepGroupBrowseList(bundle);
    expect(list[0].pureMediaPreviews).toEqual([]);
  });
});

describe('buildPureMediaPreviews', () => {
  it('returns only media-type tacit items (excludes text types)', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '관찰 항목', 1),
        makeTacitItem('t2', 'g1', 'media', '미디어 항목', 2),
        makeTacitItem('t3', 'g1', 'adjust', '조절 항목', 3),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't2', 'image', 'https://example.com/img.jpg', 1),
      ],
    });

    const previews = buildPureMediaPreviews('g1', bundle);
    expect(previews).toHaveLength(1);
    expect(previews[0].itemId).toBe('t2');
    expect(previews[0].title).toBe('미디어 항목');
  });

  it('sorts by sort_order ascending', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t3', 'g1', 'media', '세 번째', 3),
        makeTacitItem('t1', 'g1', 'media', '첫 번째', 1),
        makeTacitItem('t2', 'g1', 'media', '두 번째', 2),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't1', 'image', 'https://example.com/1.jpg', 1),
        makeTacitMedia('m2', 't2', 'image', 'https://example.com/2.jpg', 1),
        makeTacitMedia('m3', 't3', 'image', 'https://example.com/3.jpg', 1),
      ],
    });

    const previews = buildPureMediaPreviews('g1', bundle);
    expect(previews.map((p) => p.itemId)).toEqual(['t1', 't2', 't3']);
  });

  it('uses id as tie-breaker when sort_order is equal', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t-b', 'g1', 'media', 'B', 1),
        makeTacitItem('t-a', 'g1', 'media', 'A', 1),
        makeTacitItem('t-c', 'g1', 'media', 'C', 1),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't-a', 'image', 'https://example.com/a.jpg', 1),
        makeTacitMedia('m2', 't-b', 'image', 'https://example.com/b.jpg', 1),
        makeTacitMedia('m3', 't-c', 'image', 'https://example.com/c.jpg', 1),
      ],
    });

    const previews = buildPureMediaPreviews('g1', bundle);
    expect(previews.map((p) => p.itemId)).toEqual(['t-a', 't-b', 't-c']);
  });

  it('maps linked tacit_media to MediaPreviewItem', () => {
    const bundle = makeBundle({
      tacit_items: [makeTacitItem('t1', 'g1', 'media', '참고 영상', 1)],
      tacit_media: [
        makeTacitMedia('m1', 't1', 'image', 'https://example.com/img.jpg', 1),
        makeTacitMedia('m2', 't1', 'video', 'https://example.com/vid.mp4', 2),
      ],
    });

    const previews = buildPureMediaPreviews('g1', bundle);
    expect(previews[0].media).toEqual([
      { id: 'm1', mediaType: 'image', url: 'https://example.com/img.jpg' },
      { id: 'm2', mediaType: 'video', url: 'https://example.com/vid.mp4' },
    ]);
  });

  it('sorts media entries by sort_order then id', () => {
    const bundle = makeBundle({
      tacit_items: [makeTacitItem('t1', 'g1', 'media', '미디어', 1)],
      tacit_media: [
        makeTacitMedia('m-b', 't1', 'image', 'https://example.com/b.jpg', 1),
        makeTacitMedia('m-a', 't1', 'image', 'https://example.com/a.jpg', 1),
        makeTacitMedia('m-c', 't1', 'video', 'https://example.com/c.mp4', 0),
      ],
    });

    const previews = buildPureMediaPreviews('g1', bundle);
    expect(previews[0].media.map((m) => m.id)).toEqual(['m-c', 'm-a', 'm-b']);
  });

  it('excludes media items with zero linked tacit_media', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'media', '미디어 없음', 1),
        makeTacitItem('t2', 'g1', 'media', '미디어 있음', 2),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't2', 'image', 'https://example.com/img.jpg', 1),
      ],
    });

    const previews = buildPureMediaPreviews('g1', bundle);
    expect(previews).toHaveLength(1);
    expect(previews[0].itemId).toBe('t2');
  });

  it('does not include media items from other groups', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'media', '그룹1', 1),
        makeTacitItem('t2', 'g2', 'media', '그룹2', 1),
      ],
      tacit_media: [
        makeTacitMedia('m1', 't1', 'image', 'https://example.com/1.jpg', 1),
        makeTacitMedia('m2', 't2', 'image', 'https://example.com/2.jpg', 1),
      ],
    });

    const previews = buildPureMediaPreviews('g1', bundle);
    expect(previews).toHaveLength(1);
    expect(previews[0].itemId).toBe('t1');
  });

  it('returns empty array for group with no media-type items', () => {
    const bundle = makeBundle({
      tacit_items: [
        makeTacitItem('t1', 'g1', 'observe', '관찰', 1),
      ],
    });

    expect(buildPureMediaPreviews('g1', bundle)).toEqual([]);
  });
});
