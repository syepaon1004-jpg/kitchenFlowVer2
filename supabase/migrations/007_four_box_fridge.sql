-- 007_four_box_fridge.sql
-- 4호박스(four_box_fridge) 장비 타입 추가 + oversized 장비 height 상한 확장

-- 1) equipment_type CHECK에 'four_box_fridge' 추가
ALTER TABLE panel_equipment DROP CONSTRAINT IF EXISTS panel_equipment_equipment_type_check;
ALTER TABLE panel_equipment ADD CONSTRAINT panel_equipment_equipment_type_check
  CHECK (equipment_type IN (
    'drawer','fold_fridge','four_box_fridge','basket','burner','sink','worktop','shelf'
  ));

-- 2) height 상한 1 → 2 확장 (oversized 장비 허용, panel_items는 변경하지 않음)
ALTER TABLE panel_equipment DROP CONSTRAINT IF EXISTS panel_equipment_height_check;
ALTER TABLE panel_equipment ADD CONSTRAINT panel_equipment_height_check
  CHECK (height > 0 AND height <= 2);
