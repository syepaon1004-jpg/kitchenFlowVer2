import type { PracticeMenuBundle } from '../../types/practice';

// 엔진 개발용 하드코딩 시드. DB에 INSERT되지 않는 TS-only fixture.
// TASK-110 plan의 fixture 요구 8건 충족:
//  (1) 5개 이상 step_no          — step 1..6 커버
//  (2) 같은 재료 2회 등장        — FIXTURE_ING_EGG가 step 2, step 4에 서로 다른 node로 등장
//  (3) action node 포함          — step 3 fry, step 5 stir
//  (4) multi-hop path 2행 이상   — ingredient node 4개 모두 seq ≥ 2, 최대 4 seq
//  (5) pour 시나리오              — NODE_EGG_B가 wok → plate 전이를 path로 내장
//  (6) step_group_nodes 각 그룹 2+ — 그룹 A·B 모두 node 3개 연결
//  (7) tacit_items 2개 이상      — observe + warning
//  (8) tacit_media 1개 이상      — observe 항목에 image 1

const STORE_ID = '00000000-0000-0000-0000-000000000001';
const MENU_ID = '10000000-0000-0000-0000-000000000001';

const LOC_FRIDGE = '20000000-0000-0000-0000-00000000000a';
const LOC_PANTRY = '20000000-0000-0000-0000-00000000000b';
const LOC_HAND = '20000000-0000-0000-0000-00000000000c';
const LOC_WOK = '20000000-0000-0000-0000-00000000000d';
const LOC_PLATE = '20000000-0000-0000-0000-00000000000e';

const NODE_RICE = '30000000-0000-0000-0000-000000000001';
const NODE_EGG_A = '30000000-0000-0000-0000-000000000002';
const NODE_FRY = '30000000-0000-0000-0000-000000000003';
const NODE_EGG_B = '30000000-0000-0000-0000-000000000004';
const NODE_STIR = '30000000-0000-0000-0000-000000000005';
const NODE_SESAME = '30000000-0000-0000-0000-000000000006';

const ING_RICE = '40000000-0000-0000-0000-000000000001';
const ING_EGG = '40000000-0000-0000-0000-000000000002';
const ING_SESAME = '40000000-0000-0000-0000-000000000003';

const SG_A = '50000000-0000-0000-0000-000000000001';
const SG_B = '50000000-0000-0000-0000-000000000002';

const TI_OBSERVE = '60000000-0000-0000-0000-000000000001';
const TI_WARNING = '60000000-0000-0000-0000-000000000002';

const TM_EGG_COLOR = '70000000-0000-0000-0000-000000000001';

export const FIXTURE_MENU_BUNDLE: PracticeMenuBundle = {
  menu: {
    id: MENU_ID,
    store_id: STORE_ID,
    name: '가정식 볶음밥',
    description: '엔진 개발용 고정 시드 메뉴',
    image_url: null,
    created_at: '2026-04-16T00:00:00.000Z',
  },
  locations: [
    { id: LOC_FRIDGE, menu_id: MENU_ID, label: '냉장고', loc_key: 'fridge' },
    { id: LOC_PANTRY, menu_id: MENU_ID, label: '서랍', loc_key: 'pantry' },
    { id: LOC_HAND, menu_id: MENU_ID, label: '손', loc_key: 'hand' },
    { id: LOC_WOK, menu_id: MENU_ID, label: '웍', loc_key: 'wok_1' },
    { id: LOC_PLATE, menu_id: MENU_ID, label: '접시', loc_key: 'plate_1' },
  ],
  ingredient_nodes: [
    {
      node: { id: NODE_RICE, menu_id: MENU_ID, node_type: 'ingredient', step_no: 1 },
      ingredient: { node_id: NODE_RICE, ingredient_id: ING_RICE, is_deco: false, quantity: 300 },
      location_path: [
        { node_id: NODE_RICE, seq: 0, location_id: LOC_PANTRY },
        { node_id: NODE_RICE, seq: 1, location_id: LOC_HAND },
        { node_id: NODE_RICE, seq: 2, location_id: LOC_WOK },
      ],
    },
    {
      node: { id: NODE_EGG_A, menu_id: MENU_ID, node_type: 'ingredient', step_no: 2 },
      ingredient: { node_id: NODE_EGG_A, ingredient_id: ING_EGG, is_deco: false, quantity: 1 },
      location_path: [
        { node_id: NODE_EGG_A, seq: 0, location_id: LOC_FRIDGE },
        { node_id: NODE_EGG_A, seq: 1, location_id: LOC_HAND },
        { node_id: NODE_EGG_A, seq: 2, location_id: LOC_WOK },
      ],
    },
    {
      node: { id: NODE_EGG_B, menu_id: MENU_ID, node_type: 'ingredient', step_no: 4 },
      ingredient: { node_id: NODE_EGG_B, ingredient_id: ING_EGG, is_deco: false, quantity: 1 },
      location_path: [
        { node_id: NODE_EGG_B, seq: 0, location_id: LOC_FRIDGE },
        { node_id: NODE_EGG_B, seq: 1, location_id: LOC_HAND },
        { node_id: NODE_EGG_B, seq: 2, location_id: LOC_WOK },
        { node_id: NODE_EGG_B, seq: 3, location_id: LOC_PLATE },
      ],
    },
    {
      node: { id: NODE_SESAME, menu_id: MENU_ID, node_type: 'ingredient', step_no: 6 },
      ingredient: { node_id: NODE_SESAME, ingredient_id: ING_SESAME, is_deco: true, quantity: 5 },
      location_path: [
        { node_id: NODE_SESAME, seq: 0, location_id: LOC_PANTRY },
        { node_id: NODE_SESAME, seq: 1, location_id: LOC_HAND },
        { node_id: NODE_SESAME, seq: 2, location_id: LOC_PLATE },
      ],
    },
  ],
  action_nodes: [
    {
      node: { id: NODE_FRY, menu_id: MENU_ID, node_type: 'action', step_no: 3 },
      action: { node_id: NODE_FRY, action_type: 'fry', location_id: LOC_WOK, duration_sec: 30 },
    },
    {
      node: { id: NODE_STIR, menu_id: MENU_ID, node_type: 'action', step_no: 5 },
      action: { node_id: NODE_STIR, action_type: 'stir', location_id: LOC_WOK, duration_sec: 15 },
    },
  ],
  step_groups: [
    {
      id: SG_A,
      menu_id: MENU_ID,
      display_step_no: 1,
      title: '초벌 볶음',
      summary: '밥과 계란을 웍에 넣고 첫 볶음을 낸다',
      primary_location_id: LOC_WOK,
    },
    {
      id: SG_B,
      menu_id: MENU_ID,
      display_step_no: 2,
      title: '마무리 볶음',
      summary: '추가 계란과 참기름으로 마무리한다',
      primary_location_id: LOC_PLATE,
    },
  ],
  step_group_nodes: [
    { step_group_id: SG_A, node_id: NODE_RICE },
    { step_group_id: SG_A, node_id: NODE_EGG_A },
    { step_group_id: SG_A, node_id: NODE_FRY },
    { step_group_id: SG_B, node_id: NODE_EGG_B },
    { step_group_id: SG_B, node_id: NODE_STIR },
    { step_group_id: SG_B, node_id: NODE_SESAME },
  ],
  tacit_items: [
    {
      id: TI_OBSERVE,
      step_group_id: SG_A,
      tacit_type: 'observe',
      title: '계란 흰자 색 변화 관찰',
      body: '흰자가 반투명에서 불투명 흰색으로 바뀔 때 섞기 시작',
      sort_order: 0,
      flame_level: '중불',
      color_note: '흰자 가장자리가 살짝 노릇',
      viscosity_note: null,
      sound_note: '지글 소리가 고르게 들림',
      texture_note: null,
      timing_note: '투입 후 약 20초 전후',
    },
    {
      id: TI_WARNING,
      step_group_id: SG_B,
      tacit_type: 'warning',
      title: '참기름은 불 끄고 넣기',
      body: '고온에서 참기름을 넣으면 쓴맛이 나므로 화구 끈 뒤 넣는다',
      sort_order: 0,
      flame_level: '꺼짐',
      color_note: null,
      viscosity_note: null,
      sound_note: null,
      texture_note: null,
      timing_note: '플레이팅 직전',
    },
  ],
  tacit_media: [
    {
      id: TM_EGG_COLOR,
      tacit_item_id: TI_OBSERVE,
      media_type: 'image',
      url: 'https://fixture.local/practice/egg_color.jpg',
      sort_order: 0,
    },
  ],
};
