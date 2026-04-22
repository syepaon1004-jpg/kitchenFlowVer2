-- ============================================================
-- Kitchen Flow - Schema Migration 009 (Practice Ingredient Node RPC)
-- T11(DEFERRABLE INITIALLY DEFERRED) 트리거는 transaction COMMIT 시점에 발화하므로
-- Supabase JS SDK의 분리된 `.from().insert()` 호출로는 ingredient_nodes를
-- path row ≥ 1과 함께 원자적으로 생성할 수 없음. 단일 plpgsql 함수 안에서
-- recipe_node → ingredient_node → path(seq=0) 3회 INSERT를 한 TX로 묶어
-- 함수 종료 시 COMMIT에서 T11이 path row 1개를 발견하도록 한다.
-- ============================================================

create or replace function create_practice_ingredient_node_with_path(
  p_menu_id             uuid,
  p_step_no             int,
  p_ingredient_id       uuid,
  p_is_deco             bool,
  p_quantity            float,
  p_initial_location_id uuid
) returns table (
  node_id             uuid,
  menu_id             uuid,
  step_no             int,
  ingredient_id       uuid,
  is_deco             bool,
  quantity            float,
  initial_location_id uuid
)
language plpgsql as $$
declare
  v_node_id uuid;
begin
  insert into practice_recipe_nodes (menu_id, node_type, step_no)
    values (p_menu_id, 'ingredient', p_step_no)
    returning id into v_node_id;

  insert into practice_ingredient_nodes (node_id, ingredient_id, is_deco, quantity)
    values (v_node_id, p_ingredient_id, p_is_deco, p_quantity);

  insert into practice_node_location_path (node_id, seq, location_id)
    values (v_node_id, 0, p_initial_location_id);

  return query select
    v_node_id, p_menu_id, p_step_no, p_ingredient_id, p_is_deco, p_quantity, p_initial_location_id;
end;
$$;
