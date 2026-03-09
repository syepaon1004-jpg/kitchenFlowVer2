-- ============================================================
-- Kitchen Flow - Schema Migration 001
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. 정적 데이터
-- 원재료명만. 어느 매장이든 공통. 변하지 않는다.
-- ============================================================

create table ingredients_master (
  id    uuid primary key default uuid_generate_v4(),
  name  text not null unique
);

-- ============================================================
-- 2. 매장
-- ============================================================

create table stores (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  code        text not null unique,
  created_at  timestamptz not null default now()
);

create table store_users (
  id          uuid primary key default uuid_generate_v4(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  avatar_key  text,
  role        text not null default 'staff'
              check (role in ('admin','staff')),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 3. 설정 데이터 (매장별 커스텀)
-- 모두 store_id FK 보유. 매장 단위로 완전 커스텀 가능.
-- ============================================================

-- 주방 구역 이미지
-- zone_key 예시: main_kitchen / fold_fridge_1 / drawer_fridge_1
-- image_width/height: 히트박스 비율 좌표 계산 기준
-- 매장마다 zone 수와 종류가 다름

create table kitchen_zones (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid not null references stores(id) on delete cascade,
  zone_key      text not null,
  label         text not null,
  image_url     text,
  image_width   int not null default 1920,
  image_height  int not null default 1080,
  unique(store_id, zone_key)
);

-- 매장 재료
-- 같은 원재료도 상태/단위가 다르면 다른 레코드
-- 예) 대파 → '6cm대파(ea)', '챱대파(g)' 별도 레코드

create table store_ingredients (
  id                uuid primary key default uuid_generate_v4(),
  store_id          uuid not null references stores(id) on delete cascade,
  master_id         uuid not null references ingredients_master(id),
  display_name      text not null,
  state_label       text,
  unit              text not null
                    check (unit in ('g','ml','ea','spoon','portion','pinch')),
  default_quantity  float not null default 1,
  image_url         text
);

-- 용기
-- 섞기 가능 여부는 레시피 진행 스텝이 결정 → DB에 없음

create table containers (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  name            text not null,
  container_type  text not null
                  check (container_type in ('bowl','plate','pot','box')),
  image_url       text
);

-- 히트박스 / 장비 컴포넌트
-- 좌표: 부모 이미지 기준 비율값 0.0~1.0 (px 아님)
--
-- area_type 상세:
--   ingredient → store_ingredients FK. 드래그 시 재료 인스턴스 생성
--   container  → containers FK. 드래그→사이드바 드롭→그릇 배치
--   navigate   → navigate_zone_id FK. 클릭 시 왼쪽 사이드바에 zone 이미지 로딩
--                시점이동 버튼(left/right/turn)은 고정 UI → DB에 없음
--   equipment  → 장비 컴포넌트 배치. 배치 시 물리법칙 작동
--                화구·튀김기 본체는 이미지로만 존재

create table area_definitions (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  zone_id         uuid not null references kitchen_zones(id) on delete cascade,
  label           text not null,
  area_type       text not null
                  check (area_type in ('ingredient','container','navigate','equipment')),

  -- 비율 좌표 (0.0 ~ 1.0)
  x  float not null check (x >= 0 and x <= 1),
  y  float not null check (y >= 0 and y <= 1),
  w  float not null check (w > 0  and w <= 1),
  h  float not null check (h > 0  and h <= 1),

  -- ingredient
  ingredient_id     uuid references store_ingredients(id),

  -- container
  container_id      uuid references containers(id),

  -- navigate: zone_key 텍스트 아님, kitchen_zones.id FK
  navigate_zone_id  uuid references kitchen_zones(id),

  -- equipment: 컴포넌트 배치 개념. index로 같은 타입 여러 개 구분
  equipment_type    text check (equipment_type in
                      ('wok','frying_basket','microwave','sink')),
  equipment_index   int,

  drag_image_url    text,

  -- 4가지 연결값 중 최소 하나는 not null
  constraint area_has_target check (
    ingredient_id    is not null or
    container_id     is not null or
    navigate_zone_id is not null or
    equipment_type   is not null
  )
);

-- 레시피
-- target_container_id: 최종 담길 용기

create table recipes (
  id                  uuid primary key default uuid_generate_v4(),
  store_id            uuid not null references stores(id) on delete cascade,
  name                text not null,
  target_container_id uuid references containers(id),
  created_at          timestamptz not null default now()
);

-- 레시피별 재료 요구사항
-- 재료 인스턴스 판별 기준 4가지 전부 여기 정의:
--   1. 재료 존재 + 수량 (quantity ± tolerance)
--   2. action_history (required_action_type + duration)
--   3. 투입 순서 (plate_order, 같은 값 = 동시 투입)
--   4. 그릇 종류 (recipes.target_container_id)

create table recipe_ingredients (
  id                    uuid primary key default uuid_generate_v4(),
  recipe_id             uuid not null references recipes(id) on delete cascade,
  ingredient_id         uuid not null references store_ingredients(id),
  quantity              float not null,
  quantity_tolerance    float not null default 0.1,
  plate_order           int not null default 1,
  required_action_type  text check (required_action_type in
                          ('stir','fry','microwave','boil')),
  required_duration_min float,
  required_duration_max float
);

-- ============================================================
-- 4. 런타임 데이터
-- 물리엔진은 클라이언트(Zustand)에서만 실행
-- 세션 종료 시에만 DB 저장
-- ============================================================

create table game_sessions (
  id          uuid primary key default uuid_generate_v4(),
  store_id    uuid not null references stores(id),
  user_id     uuid not null references store_users(id),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  score       int,
  status      text not null default 'active'
              check (status in ('active','completed','abandoned'))
);

-- 빌지 큐
-- order_sequence: 세션 내 전체 주문 순서 (#1, #2, #3...)
-- 그릇 하단 표시: '메뉴명 #order_sequence'

create table game_orders (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references game_sessions(id) on delete cascade,
  recipe_id       uuid not null references recipes(id),
  order_sequence  int not null,
  status          text not null default 'pending'
                  check (status in ('pending','in_progress','completed')),
  created_at      timestamptz not null default now()
);

-- 장비 런타임 상태
-- session_id + equipment_type + equipment_index 로 장비 식별
-- 게임 시작 시 area_definitions의 equipment 기준으로 레코드 생성
-- game_ingredient_instances.equipment_state_id가 이 테이블 FK 참조

create table game_equipment_state (
  id               uuid primary key default uuid_generate_v4(),
  session_id       uuid not null references game_sessions(id) on delete cascade,
  equipment_type   text not null
                   check (equipment_type in ('wok','frying_basket','microwave','sink')),
  equipment_index  int not null default 1,

  -- 웍
  wok_status       text check (wok_status in
                     ('clean','dirty','burned','overheating')),
  wok_temp         float,
  burner_level     int check (burner_level between 0 and 3),

  -- 튀김채
  basket_status             text check (basket_status in ('up','down')),
  basket_ingredient_ids     jsonb,

  -- 전자레인지
  mw_status        text check (mw_status in ('idle','running','done')),
  mw_remaining_sec float,

  unique(session_id, equipment_type, equipment_index)
);

-- 그릇 인스턴스
-- assigned_order_id 동일한 그릇들이 한 묶음 (bundle_pair_id 없음)
-- 같은 order_id의 모든 그릇 is_complete = true → 서빙 버튼 활성화

create table game_container_instances (
  id                  uuid primary key default uuid_generate_v4(),
  session_id          uuid not null references game_sessions(id) on delete cascade,
  container_id        uuid not null references containers(id),
  assigned_order_id   uuid references game_orders(id),
  is_complete         bool not null default false,
  is_served           bool not null default false
);

-- 재료 인스턴스
-- action_history: [{actionType: 'stir', seconds: 15}, ...] 1초씩 누적
-- location_type에 따라 위치값 하나만 채워짐
-- equipment_state_id: FK로 game_equipment_state 참조 (텍스트 아님)

create table game_ingredient_instances (
  id                    uuid primary key default uuid_generate_v4(),
  session_id            uuid not null references game_sessions(id) on delete cascade,
  ingredient_id         uuid not null references store_ingredients(id),
  quantity              float not null,

  location_type         text not null
                        check (location_type in
                          ('zone','equipment','container','hand','disposed')),

  -- 위치 상세 (location_type에 따라 하나만 사용)
  zone_id               uuid references kitchen_zones(id),
  equipment_state_id    uuid references game_equipment_state(id),
  container_instance_id uuid references game_container_instances(id),

  action_history        jsonb not null default '[]',
  plate_order           int,

  -- location_type별 위치값 정합성
  constraint location_zone_requires_zone_id check (
    location_type != 'zone' or zone_id is not null
  ),
  constraint location_equipment_requires_state check (
    location_type != 'equipment' or equipment_state_id is not null
  ),
  constraint location_container_requires_instance check (
    location_type != 'container' or container_instance_id is not null
  ),

  created_at  timestamptz not null default now()
);

-- 액션 로그 (점수 산출 + 리플레이 분석용)

create table game_action_log (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid not null references game_sessions(id) on delete cascade,
  action_type text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 5. RLS (개발 단계: 전체 허용)
-- 파일럿 이후 매장별 격리 정책으로 강화
-- ============================================================

alter table ingredients_master          enable row level security;
alter table stores                      enable row level security;
alter table store_users                 enable row level security;
alter table kitchen_zones               enable row level security;
alter table store_ingredients           enable row level security;
alter table containers                  enable row level security;
alter table area_definitions            enable row level security;
alter table recipes                     enable row level security;
alter table recipe_ingredients          enable row level security;
alter table game_sessions               enable row level security;
alter table game_orders                 enable row level security;
alter table game_equipment_state        enable row level security;
alter table game_container_instances    enable row level security;
alter table game_ingredient_instances   enable row level security;
alter table game_action_log             enable row level security;

create policy "dev_all" on ingredients_master         for all using (true) with check (true);
create policy "dev_all" on stores                     for all using (true) with check (true);
create policy "dev_all" on store_users                for all using (true) with check (true);
create policy "dev_all" on kitchen_zones              for all using (true) with check (true);
create policy "dev_all" on store_ingredients          for all using (true) with check (true);
create policy "dev_all" on containers                 for all using (true) with check (true);
create policy "dev_all" on area_definitions           for all using (true) with check (true);
create policy "dev_all" on recipes                    for all using (true) with check (true);
create policy "dev_all" on recipe_ingredients         for all using (true) with check (true);
create policy "dev_all" on game_sessions              for all using (true) with check (true);
create policy "dev_all" on game_orders                for all using (true) with check (true);
create policy "dev_all" on game_equipment_state       for all using (true) with check (true);
create policy "dev_all" on game_container_instances   for all using (true) with check (true);
create policy "dev_all" on game_ingredient_instances  for all using (true) with check (true);
create policy "dev_all" on game_action_log            for all using (true) with check (true);

-- ============================================================
-- 6. 인덱스
-- ============================================================

create index on store_users               (store_id);
create index on kitchen_zones             (store_id);
create index on store_ingredients         (store_id);
create index on store_ingredients         (master_id);
create index on containers                (store_id);
create index on area_definitions          (store_id, zone_id);
create index on area_definitions          (area_type);
create index on recipes                   (store_id);
create index on recipe_ingredients        (recipe_id);
create index on game_sessions             (store_id, status);
create index on game_orders               (session_id, status);
create index on game_equipment_state      (session_id);
create index on game_container_instances  (session_id);
create index on game_container_instances  (assigned_order_id);
create index on game_ingredient_instances (session_id, location_type);
create index on game_ingredient_instances (equipment_state_id);
create index on game_ingredient_instances (container_instance_id);
create index on game_action_log           (session_id, created_at);
