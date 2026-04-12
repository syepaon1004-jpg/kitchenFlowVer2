-- ============================================================
-- 006: Section Grid System
-- 행-셀-섹션 기반 다중 행 주방 레이아웃 지원
-- ============================================================

-- 1. panel_layouts에 row_index 추가 (기존 단일 행 = 0)
ALTER TABLE panel_layouts ADD COLUMN row_index integer NOT NULL DEFAULT 0;

-- 기존 UNIQUE(store_id) → UNIQUE(store_id, row_index)
-- 제약명 확인: 2026-04-12 REST API duplicate insert 에러에서 "panel_layouts_store_id_key" 확정
ALTER TABLE panel_layouts DROP CONSTRAINT panel_layouts_store_id_key;
ALTER TABLE panel_layouts ADD CONSTRAINT panel_layouts_store_row_key
  UNIQUE (store_id, row_index);

-- 2. section_grid: store당 1행, 전체 그리드 크기 메타
CREATE TABLE section_grid (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  grid_rows integer NOT NULL DEFAULT 1 CHECK (grid_rows >= 1),
  grid_cols integer NOT NULL DEFAULT 1 CHECK (grid_cols >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. section_cells: 비어있지 않은 셀만 저장 (layout_id FK 없음)
CREATE TABLE section_cells (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  section_number integer NOT NULL CHECK (section_number > 0),
  row_index integer NOT NULL CHECK (row_index >= 0),
  col_index integer NOT NULL CHECK (col_index >= 0),
  rep_equipment_type text DEFAULT NULL,
  rep_equipment_index integer DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, section_number),
  UNIQUE (store_id, row_index, col_index),
  CONSTRAINT rep_equipment_both_or_neither CHECK (
    (rep_equipment_type IS NULL) = (rep_equipment_index IS NULL)
  )
);

-- 4. RLS + 개발 정책
ALTER TABLE section_grid  ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_all" ON section_grid  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON section_cells FOR ALL USING (true) WITH CHECK (true);

-- 5. 인덱스
CREATE INDEX ON section_cells (store_id);

-- 6. 기존 매장 데이터 자동 마이그레이션 (단일 레이아웃 → 1행 1셀)
INSERT INTO section_grid (store_id, grid_rows, grid_cols)
SELECT store_id, 1, 1 FROM panel_layouts;

INSERT INTO section_cells (store_id, section_number, row_index, col_index)
SELECT store_id, 1, 0, 0 FROM panel_layouts;
