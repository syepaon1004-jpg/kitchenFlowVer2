-- ============================================================
-- Kitchen Flow - Seed Data 002
-- 테스트 매장: 테스트주방 / 코드: TEST01
-- Storage base: https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets
-- ============================================================

-- stores
insert into stores (id, name, code) values
  ('00000000-0000-0000-0000-000000000001', '테스트주방', 'TEST01');

-- store_users
insert into store_users (id, store_id, name, avatar_key, role) values
  ('00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001', '테스트사장', 'chef_1', 'admin'),
  ('00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001', '테스트직원', 'staff_1', 'staff');

-- ============================================================
-- kitchen_zones
-- image_width/height: 실제 이미지 크기 기준
-- ============================================================
insert into kitchen_zones (id, store_id, zone_key, label, image_url, image_width, image_height) values
  ('00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   'main_kitchen', '전체 주방',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/Frame_1.png',
   1270, 953),

  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   'fold_fridge_1', '폴딩냉장고 1번',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/fold_fridge_interior.svg',
   800, 600),

  ('00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000001',
   'fold_fridge_2', '폴딩냉장고 2번',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/fold_fridge_interior.svg',
   800, 600),

  ('00000000-0000-0000-0000-000000000013',
   '00000000-0000-0000-0000-000000000001',
   'fold_fridge_3', '폴딩냉장고 3번',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/fold_fridge_interior.svg',
   800, 600),

  ('00000000-0000-0000-0000-000000000014',
   '00000000-0000-0000-0000-000000000001',
   'fold_fridge_4', '폴딩냉장고 4번',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/fold_fridge_interior.svg',
   800, 600),

  ('00000000-0000-0000-0000-000000000015',
   '00000000-0000-0000-0000-000000000001',
   'drawer_fridge_1', '서랍냉장고 1번',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/drawer_fridge_interior.svg',
   500, 800),

  ('00000000-0000-0000-0000-000000000016',
   '00000000-0000-0000-0000-000000000001',
   'drawer_fridge_2', '서랍냉장고 2번',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/drawer_fridge_interior.svg',
   500, 800);

-- ============================================================
-- ingredients_master
-- ============================================================
insert into ingredients_master (id, name) values
  ('00000000-0000-0000-0000-000000000100', '계란'),
  ('00000000-0000-0000-0000-000000000101', '대파'),
  ('00000000-0000-0000-0000-000000000102', '양파'),
  ('00000000-0000-0000-0000-000000000103', '밥'),
  ('00000000-0000-0000-0000-000000000104', '간장'),
  ('00000000-0000-0000-0000-000000000105', '참기름'),
  ('00000000-0000-0000-0000-000000000106', '소금');

-- ============================================================
-- store_ingredients
-- ============================================================
insert into store_ingredients
  (id, store_id, master_id, display_name, state_label, unit, default_quantity, image_url)
values
  ('00000000-0000-0000-0000-000000000200',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000100',
   '계란', 'raw', 'ea', 2,
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/ingredient_egg.svg'),

  ('00000000-0000-0000-0000-000000000201',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000101',
   '챱대파', 'chop', 'g', 10,
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/ingredient_green_onion.svg'),

  ('00000000-0000-0000-0000-000000000202',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000102',
   '다이스양파', 'dice', 'g', 50,
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/ingredient_onion.svg'),

  ('00000000-0000-0000-0000-000000000203',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000103',
   '밥', 'cooked', 'g', 200,
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/ingredient_rice.svg'),

  ('00000000-0000-0000-0000-000000000204',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000104',
   '간장', 'liquid', 'ml', 15,
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/ingredient_soy_sauce.svg'),

  ('00000000-0000-0000-0000-000000000205',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000105',
   '참기름', 'liquid', 'ml', 5,
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/ingredient_sesame_oil.svg'),

  ('00000000-0000-0000-0000-000000000206',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000106',
   '소금', 'raw', 'pinch', 1,
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/ingredient_salt.svg');

-- ============================================================
-- containers
-- ============================================================
insert into containers (id, store_id, name, container_type, image_url) values
  ('00000000-0000-0000-0000-000000000300',
   '00000000-0000-0000-0000-000000000001',
   '스텐볼', 'bowl',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/container_bowl.svg'),

  ('00000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000001',
   '직사각접시', 'plate',
   'https://nunrougezfkuknxuqsdg.supabase.co/storage/v1/object/public/assets/container_plate.svg');

-- ============================================================
-- recipe: 계란볶음밥
-- target: 직사각접시
-- 투입순서:
--   1) 다이스양파 (stir 20초+)
--   2) 계란 + 밥 동시 (stir 각각 10초+, 15초+)
--   3) 간장 + 참기름 동시 (액션 없음)
--   4) 챱대파 마무리 (액션 없음)
-- ============================================================
insert into recipes (id, store_id, name, target_container_id) values
  ('00000000-0000-0000-0000-000000000500',
   '00000000-0000-0000-0000-000000000001',
   '계란볶음밥',
   '00000000-0000-0000-0000-000000000301');

insert into recipe_ingredients
  (recipe_id, ingredient_id, quantity, quantity_tolerance,
   plate_order, required_action_type, required_duration_min, required_duration_max)
values
  -- 1. 다이스양파 50g, stir 20초+
  ('00000000-0000-0000-0000-000000000500',
   '00000000-0000-0000-0000-000000000202',
   50, 0.15, 1, 'stir', 20, null),

  -- 2. 계란 2ea, stir 10초+ (밥과 동시)
  ('00000000-0000-0000-0000-000000000500',
   '00000000-0000-0000-0000-000000000200',
   2, 0.0, 2, 'stir', 10, null),

  -- 2. 밥 200g, stir 15초+ (계란과 동시)
  ('00000000-0000-0000-0000-000000000500',
   '00000000-0000-0000-0000-000000000203',
   200, 0.1, 2, 'stir', 15, null),

  -- 3. 간장 15ml, 액션 없음 (참기름과 동시)
  ('00000000-0000-0000-0000-000000000500',
   '00000000-0000-0000-0000-000000000204',
   15, 0.1, 3, null, null, null),

  -- 3. 참기름 5ml, 액션 없음 (간장과 동시)
  ('00000000-0000-0000-0000-000000000500',
   '00000000-0000-0000-0000-000000000205',
   5, 0.2, 3, null, null, null),

  -- 4. 챱대파 10g, 마무리
  ('00000000-0000-0000-0000-000000000500',
   '00000000-0000-0000-0000-000000000201',
   10, 0.2, 4, null, null, null);

-- ============================================================
-- area_definitions
-- 히트박스 좌표는 어드민 편집기 구현 후 직접 배치
-- ============================================================
