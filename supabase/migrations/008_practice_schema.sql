-- ============================================================
-- Kitchen Flow - Schema Migration 008 (Practice Domain)
-- Practice 전용 도메인 — sim(gameStore/plate_order)과 물리 분리
-- 승인안: TASK-20260416-100 v7 / TASK-20260416-110 plan
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- 0. Helper 함수 (trigger 공용)
-- ============================================================

create or replace function check_same_store(a_store_id uuid, b_store_id uuid)
returns void as $$
begin
  if a_store_id is null or b_store_id is null or a_store_id <> b_store_id then
    raise exception 'practice same-store violation: % <> %', a_store_id, b_store_id;
  end if;
end;
$$ language plpgsql;

create or replace function check_same_menu(a_menu_id uuid, b_menu_id uuid)
returns void as $$
begin
  if a_menu_id is null or b_menu_id is null or a_menu_id <> b_menu_id then
    raise exception 'practice same-menu violation: % <> %', a_menu_id, b_menu_id;
  end if;
end;
$$ language plpgsql;

create or replace function check_node_type(p_node_id uuid, p_expected text)
returns void as $$
declare
  v_actual text;
begin
  select node_type into v_actual from practice_recipe_nodes where id = p_node_id;
  if v_actual is null then
    raise exception 'practice recipe node not found: %', p_node_id;
  end if;
  if v_actual <> p_expected then
    raise exception 'practice node_type mismatch on %: expected % got %', p_node_id, p_expected, v_actual;
  end if;
end;
$$ language plpgsql;

-- ============================================================
-- 1. 테이블 (위상 정렬 순서)
-- ============================================================

create table practice_menus (
  id          uuid primary key default uuid_generate_v4(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  description text,
  image_url   text,
  created_at  timestamptz not null default now()
);

create table practice_locations (
  id       uuid primary key default uuid_generate_v4(),
  menu_id  uuid not null references practice_menus(id) on delete cascade,
  label    text not null,
  loc_key  text not null,
  unique(menu_id, loc_key)
);

create table practice_recipe_nodes (
  id         uuid primary key default uuid_generate_v4(),
  menu_id    uuid not null references practice_menus(id) on delete cascade,
  node_type  text not null check (node_type in ('ingredient','action')),
  step_no    int not null
);

create table practice_ingredient_nodes (
  node_id        uuid primary key references practice_recipe_nodes(id) on delete cascade,
  ingredient_id  uuid not null references store_ingredients(id),
  is_deco        bool not null default false,
  quantity       float not null
);

create table practice_action_nodes (
  node_id        uuid primary key references practice_recipe_nodes(id) on delete cascade,
  action_type    text not null check (action_type in ('fry','stir','microwave','boil')),
  location_id    uuid not null references practice_locations(id),
  duration_sec   float
);

create table practice_node_location_path (
  node_id      uuid not null references practice_ingredient_nodes(node_id) on delete cascade,
  seq          int not null check (seq >= 0),
  location_id  uuid not null references practice_locations(id),
  primary key (node_id, seq)
);

create table practice_step_groups (
  id                   uuid primary key default uuid_generate_v4(),
  menu_id              uuid not null references practice_menus(id) on delete cascade,
  display_step_no      int not null,
  title                text not null,
  summary              text,
  primary_location_id  uuid references practice_locations(id),
  unique(menu_id, display_step_no)
);

create table practice_step_group_nodes (
  step_group_id  uuid not null references practice_step_groups(id) on delete cascade,
  node_id        uuid not null references practice_recipe_nodes(id) on delete cascade,
  primary key (step_group_id, node_id),
  unique (node_id)
);

create table practice_tacit_items (
  id               uuid primary key default uuid_generate_v4(),
  step_group_id    uuid not null references practice_step_groups(id) on delete cascade,
  tacit_type       text not null check (tacit_type in ('observe','adjust','warning','reason','media')),
  title            text not null,
  body             text,
  sort_order       int not null default 0,
  flame_level      text,
  color_note       text,
  viscosity_note   text,
  sound_note       text,
  texture_note     text,
  timing_note      text
);

create table practice_tacit_media (
  id             uuid primary key default uuid_generate_v4(),
  tacit_item_id  uuid not null references practice_tacit_items(id) on delete cascade,
  media_type     text not null check (media_type in ('image','video')),
  url            text not null,
  sort_order     int not null default 0
);

create table practice_sessions (
  id             uuid primary key default uuid_generate_v4(),
  menu_id        uuid not null references practice_menus(id),
  store_id       uuid not null references stores(id),
  store_user_id  uuid not null references store_users(id),
  status         text not null default 'active' check (status in ('active','completed','abandoned')),
  started_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table practice_ingredient_instances (
  id                            uuid primary key default uuid_generate_v4(),
  session_id                    uuid not null references practice_sessions(id) on delete cascade,
  node_id                       uuid not null references practice_ingredient_nodes(node_id),
  actual_location_id            uuid not null references practice_locations(id),
  current_required_location_id  uuid not null references practice_locations(id),
  is_satisfied                  bool not null default false,
  unique(session_id, node_id)
);

create table practice_node_progress (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references practice_sessions(id) on delete cascade,
  node_id       uuid not null references practice_recipe_nodes(id),
  is_satisfied  bool not null default false,
  satisfied_at  timestamptz,
  unique(session_id, node_id)
);

-- ============================================================
-- 2. Trigger 함수 (F1~F12)
-- ============================================================

-- F1: ingredient_nodes discriminator
create or replace function fn_ing_discriminator() returns trigger as $$
begin
  perform check_node_type(NEW.node_id, 'ingredient');
  return NEW;
end;
$$ language plpgsql;

-- F2: action_nodes discriminator
create or replace function fn_act_discriminator() returns trigger as $$
begin
  perform check_node_type(NEW.node_id, 'action');
  return NEW;
end;
$$ language plpgsql;

-- F3: ingredient_nodes same-store (ingredient.store_id == menu.store_id)
create or replace function fn_ing_same_store() returns trigger as $$
declare
  v_node_store uuid;
  v_ing_store  uuid;
begin
  select m.store_id into v_node_store
    from practice_recipe_nodes n
    join practice_menus m on m.id = n.menu_id
    where n.id = NEW.node_id;
  select store_id into v_ing_store
    from store_ingredients
    where id = NEW.ingredient_id;
  perform check_same_store(v_node_store, v_ing_store);
  return NEW;
end;
$$ language plpgsql;

-- F4: sessions same-store (menu.store_id + store_user.store_id == session.store_id)
create or replace function fn_sess_same_store() returns trigger as $$
declare
  v_menu_store uuid;
  v_user_store uuid;
begin
  select store_id into v_menu_store from practice_menus where id = NEW.menu_id;
  select store_id into v_user_store from store_users where id = NEW.store_user_id;
  perform check_same_store(NEW.store_id, v_menu_store);
  perform check_same_store(NEW.store_id, v_user_store);
  return NEW;
end;
$$ language plpgsql;

-- F5: node_location_path same-menu (location.menu_id == node.menu_id)
create or replace function fn_locpath_same_menu() returns trigger as $$
declare
  v_node_menu uuid;
  v_loc_menu  uuid;
begin
  select menu_id into v_node_menu from practice_recipe_nodes where id = NEW.node_id;
  select menu_id into v_loc_menu from practice_locations where id = NEW.location_id;
  perform check_same_menu(v_node_menu, v_loc_menu);
  return NEW;
end;
$$ language plpgsql;

-- F6: action_nodes same-menu (location.menu_id == node.menu_id)
create or replace function fn_act_same_menu() returns trigger as $$
declare
  v_node_menu uuid;
  v_loc_menu  uuid;
begin
  select menu_id into v_node_menu from practice_recipe_nodes where id = NEW.node_id;
  select menu_id into v_loc_menu from practice_locations where id = NEW.location_id;
  perform check_same_menu(v_node_menu, v_loc_menu);
  return NEW;
end;
$$ language plpgsql;

-- F7: step_groups same-menu (primary_location.menu_id == step_group.menu_id, nullable skip)
create or replace function fn_sg_same_menu() returns trigger as $$
declare
  v_loc_menu uuid;
begin
  if NEW.primary_location_id is null then
    return NEW;
  end if;
  select menu_id into v_loc_menu from practice_locations where id = NEW.primary_location_id;
  perform check_same_menu(NEW.menu_id, v_loc_menu);
  return NEW;
end;
$$ language plpgsql;

-- F8: step_group_nodes same-menu (group.menu_id == node.menu_id)
create or replace function fn_sgn_same_menu() returns trigger as $$
declare
  v_group_menu uuid;
  v_node_menu  uuid;
begin
  select menu_id into v_group_menu from practice_step_groups where id = NEW.step_group_id;
  select menu_id into v_node_menu from practice_recipe_nodes where id = NEW.node_id;
  perform check_same_menu(v_group_menu, v_node_menu);
  return NEW;
end;
$$ language plpgsql;

-- F9: ingredient_instances same-menu (node + actual/current_required location == session.menu_id)
create or replace function fn_ingi_same_menu() returns trigger as $$
declare
  v_sess_menu   uuid;
  v_node_menu   uuid;
  v_actual_menu uuid;
  v_cur_menu    uuid;
begin
  select menu_id into v_sess_menu   from practice_sessions        where id = NEW.session_id;
  select menu_id into v_node_menu   from practice_recipe_nodes    where id = NEW.node_id;
  select menu_id into v_actual_menu from practice_locations       where id = NEW.actual_location_id;
  select menu_id into v_cur_menu    from practice_locations       where id = NEW.current_required_location_id;
  perform check_same_menu(v_sess_menu, v_node_menu);
  perform check_same_menu(v_sess_menu, v_actual_menu);
  perform check_same_menu(v_sess_menu, v_cur_menu);
  return NEW;
end;
$$ language plpgsql;

-- F10: node_progress same-menu (node.menu_id == session.menu_id)
create or replace function fn_np_same_menu() returns trigger as $$
declare
  v_sess_menu uuid;
  v_node_menu uuid;
begin
  select menu_id into v_sess_menu from practice_sessions     where id = NEW.session_id;
  select menu_id into v_node_menu from practice_recipe_nodes where id = NEW.node_id;
  perform check_same_menu(v_sess_menu, v_node_menu);
  return NEW;
end;
$$ language plpgsql;

-- F11: ingredient_nodes min-path row (deferred) — 커밋 시 해당 node_id의 path row >= 1
create or replace function fn_ing_min_path() returns trigger as $$
declare
  v_count int;
begin
  select count(*) into v_count from practice_node_location_path where node_id = NEW.node_id;
  if v_count < 1 then
    raise exception 'practice_ingredient_nodes % requires >= 1 location_path row at commit (found 0)', NEW.node_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

-- F12: node_location_path DELETE — 커밋 시 parent ingredient_node가 살아있다면 path row >= 1
create or replace function fn_locpath_min_row() returns trigger as $$
declare
  v_count int;
begin
  if exists (select 1 from practice_ingredient_nodes where node_id = OLD.node_id) then
    select count(*) into v_count from practice_node_location_path where node_id = OLD.node_id;
    if v_count < 1 then
      raise exception 'practice_node_location_path for node % must keep >= 1 row at commit (found 0)', OLD.node_id;
    end if;
  end if;
  return OLD;
end;
$$ language plpgsql;

-- ============================================================
-- 3. Trigger 선언 (T1~T12)
-- ============================================================

-- discriminator (T1, T2)
create trigger trg_ing_discriminator
  before insert or update on practice_ingredient_nodes
  for each row execute function fn_ing_discriminator();

create trigger trg_act_discriminator
  before insert or update on practice_action_nodes
  for each row execute function fn_act_discriminator();

-- same-store (T3, T4)
create trigger trg_ing_same_store
  before insert or update on practice_ingredient_nodes
  for each row execute function fn_ing_same_store();

create trigger trg_sess_same_store
  before insert or update on practice_sessions
  for each row execute function fn_sess_same_store();

-- same-menu (T5~T10)
create trigger trg_locpath_same_menu
  before insert or update on practice_node_location_path
  for each row execute function fn_locpath_same_menu();

create trigger trg_act_same_menu
  before insert or update on practice_action_nodes
  for each row execute function fn_act_same_menu();

create trigger trg_sg_same_menu
  before insert or update on practice_step_groups
  for each row execute function fn_sg_same_menu();

create trigger trg_sgn_same_menu
  before insert or update on practice_step_group_nodes
  for each row execute function fn_sgn_same_menu();

create trigger trg_ingi_same_menu
  before insert or update on practice_ingredient_instances
  for each row execute function fn_ingi_same_menu();

create trigger trg_np_same_menu
  before insert or update on practice_node_progress
  for each row execute function fn_np_same_menu();

-- min-row deferred (T11, T12)
create constraint trigger trg_ing_min_path
  after insert on practice_ingredient_nodes
  deferrable initially deferred
  for each row execute function fn_ing_min_path();

create constraint trigger trg_locpath_min_row
  after delete on practice_node_location_path
  deferrable initially deferred
  for each row execute function fn_locpath_min_row();

-- ============================================================
-- 4. Index
-- ============================================================

create index on practice_menus                     (store_id);
create index on practice_locations                 (menu_id);
create index on practice_recipe_nodes              (menu_id, step_no);
create index on practice_ingredient_nodes          (ingredient_id);
create index on practice_node_location_path        (location_id);
create index on practice_action_nodes              (location_id);
create index on practice_step_groups               (menu_id);
create index on practice_tacit_items               (step_group_id);
create index on practice_tacit_media               (tacit_item_id);
create index on practice_sessions                  (store_id, status);
create index on practice_sessions                  (store_user_id);
create index on practice_ingredient_instances      (session_id);
create index on practice_ingredient_instances      (node_id);
create index on practice_node_progress             (session_id);

-- ============================================================
-- 5. RLS (개발 단계: 전체 허용. 파일럿 이후 매장별 격리)
-- ============================================================

alter table practice_menus                    enable row level security;
alter table practice_locations                enable row level security;
alter table practice_recipe_nodes             enable row level security;
alter table practice_ingredient_nodes         enable row level security;
alter table practice_action_nodes             enable row level security;
alter table practice_node_location_path       enable row level security;
alter table practice_step_groups              enable row level security;
alter table practice_step_group_nodes         enable row level security;
alter table practice_tacit_items              enable row level security;
alter table practice_tacit_media              enable row level security;
alter table practice_sessions                 enable row level security;
alter table practice_ingredient_instances     enable row level security;
alter table practice_node_progress            enable row level security;

create policy "dev_all" on practice_menus                 for all using (true) with check (true);
create policy "dev_all" on practice_locations             for all using (true) with check (true);
create policy "dev_all" on practice_recipe_nodes          for all using (true) with check (true);
create policy "dev_all" on practice_ingredient_nodes      for all using (true) with check (true);
create policy "dev_all" on practice_action_nodes          for all using (true) with check (true);
create policy "dev_all" on practice_node_location_path    for all using (true) with check (true);
create policy "dev_all" on practice_step_groups           for all using (true) with check (true);
create policy "dev_all" on practice_step_group_nodes      for all using (true) with check (true);
create policy "dev_all" on practice_tacit_items           for all using (true) with check (true);
create policy "dev_all" on practice_tacit_media           for all using (true) with check (true);
create policy "dev_all" on practice_sessions              for all using (true) with check (true);
create policy "dev_all" on practice_ingredient_instances  for all using (true) with check (true);
create policy "dev_all" on practice_node_progress         for all using (true) with check (true);
