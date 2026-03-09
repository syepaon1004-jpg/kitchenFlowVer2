-- ============================================================
-- recipe_steps: 레시피 조리 단계별 이미지
-- step_order 0 = 빈 접시 이미지 (재료 없는 초기 상태)
-- step_order N = 그릇 내 재료 plate_order 최댓값이 N일 때 표시할 이미지
-- ============================================================

create table recipe_steps (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes(id) on delete cascade,
  store_id    uuid not null references stores(id) on delete cascade,
  step_order  int not null default 0,
  image_url   text not null,
  unique(recipe_id, step_order)
);

-- RLS
alter table recipe_steps enable row level security;
create policy "dev_all" on recipe_steps for all using (true) with check (true);

-- Index
create index on recipe_steps (recipe_id);
