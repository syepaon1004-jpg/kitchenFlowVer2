-- 008_ingredient_direct_input.sql
-- 매장 재료별 "직접 투입량 입력" 옵션 추가.
-- true이면 게임 내 재료 클릭 시 단위와 무관하게 항상 수량 입력 모달이 떠서
-- 사용자가 직접 양을 타이핑(또는 기본값 사용)할 수 있다.

ALTER TABLE store_ingredients
  ADD COLUMN allow_direct_input boolean NOT NULL DEFAULT false;
