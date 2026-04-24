-- ============================================================
-- 010_recipe_ingredient_fk.sql
-- game_ingredient_instances에 recipe_ingredient_id FK 추가.
-- 인스턴스가 container 안에 있을 때 어느 recipe_ingredients row의
-- 요구를 충족하는지 명시 태깅. 판별·머지 로직을 이 FK 단일 키로 단순화.
-- null 허용 (equipment/hand/disposed/주문 미할당 container 상태).
-- ============================================================

alter table game_ingredient_instances
  add column recipe_ingredient_id uuid null
    references recipe_ingredients(id)
    on delete set null;

create index on game_ingredient_instances (recipe_ingredient_id);
