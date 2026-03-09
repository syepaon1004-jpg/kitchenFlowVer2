-- 사다리꼴 등 다각형 히트박스를 위한 points 컬럼 추가
-- jsonb 배열: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]  (비율 좌표 0.0~1.0)
alter table area_definitions
  add column points jsonb default null;
