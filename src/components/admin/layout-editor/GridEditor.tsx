import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoreIngredient } from '../../../types/db';
import type { GridCell, GridConfig } from '../../../types/game';
import { isGridConfig } from '../../../types/game';
import styles from '../KitchenLayoutEditor.module.css';

// ——— 유틸 ———

function makeDefaultGrid(rows: number, cols: number): GridConfig {
  const cells: GridCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ row: r, col: c, rowSpan: 1, colSpan: 1, ingredientId: null });
    }
  }
  return { rows, cols, cells };
}

function resolveGrid(config: Record<string, unknown>, eqType: 'drawer' | 'basket'): GridConfig {
  const inner = (config as Record<string, unknown>).grid;
  if (isGridConfig(inner)) return inner;
  return eqType === 'basket' ? makeDefaultGrid(2, 2) : makeDefaultGrid(1, 1);
}

function findCellAt(cells: GridCell[], row: number, col: number): GridCell | null {
  for (const cell of cells) {
    if (
      row >= cell.row &&
      row < cell.row + cell.rowSpan &&
      col >= cell.col &&
      col < cell.col + cell.colSpan
    ) {
      return cell;
    }
  }
  return null;
}

function cellKey(cell: GridCell): string {
  return `${cell.row}-${cell.col}`;
}

function buildConfigFromGrid(grid: GridConfig): Record<string, unknown> {
  return { grid };
}

/** 행/열 변경 시 새 그리드 생성 (병합 초기화, ingredientId 유지) */
function resizeGrid(oldGrid: GridConfig, newRows: number, newCols: number): GridConfig {
  const newGrid = makeDefaultGrid(newRows, newCols);
  for (const cell of newGrid.cells) {
    const oldCell = oldGrid.cells.find(
      (c) => c.row === cell.row && c.col === cell.col && c.rowSpan === 1 && c.colSpan === 1,
    );
    if (oldCell) {
      cell.ingredientId = oldCell.ingredientId;
    }
  }
  return newGrid;
}

// ——— Props ———

interface GridEditorProps {
  equipmentId: string;
  equipmentType: 'drawer' | 'basket';
  config: Record<string, unknown>;
  /** 패널 비율(0..1)의 장비 가로 = 서랍판 가로. drawer 동기화용 */
  equipmentWidth?: number;
  /** 서랍판 높이 = 서랍 깊이 (0..1). config.depth와 연동. drawer 동기화용.
   *  주의: eq.height(서랍 face 세로)와는 다름. */
  equipmentDepth?: number;
  /** 드로어가 속한 패널의 픽셀 너비. 박스 종횡비 = in-game 일치용. drawer 동기화 전용. */
  panelPxW?: number;
  /** 드로어가 속한 패널의 픽셀 높이. drawer 동기화 전용. */
  panelPxH?: number;
  /** 가로 변경 시 클램프 상한 (0..1, 패널 끝 기준) */
  maxWidth?: number;
  ingredients: StoreIngredient[];
  onConfigChange: (id: string, newConfig: Record<string, unknown>) => void;
  onDimensionsChange?: (id: string, dims: { width?: number; depth?: number }) => void;
}

/** 하단 그리드 표시 영역의 기준 픽셀 (1.0 = BASE_PX) */
const GRID_BASE_PX = 600;
const MIN_DIM = 0.05;

// ——— 컴포넌트 ———

const GridEditor = ({
  equipmentId,
  equipmentType,
  config,
  equipmentWidth,
  equipmentDepth,
  panelPxW,
  panelPxH,
  maxWidth = 1,
  ingredients,
  onConfigChange,
  onDimensionsChange,
}: GridEditorProps) => {
  const [grid, setGrid] = useState<GridConfig>(() => resolveGrid(config, equipmentType));
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [mergeAnchor, setMergeAnchor] = useState<{ row: number; col: number } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // 경고 자동 소멸
  useEffect(() => {
    if (!warning) return;
    const timer = setTimeout(() => setWarning(null), 3000);
    return () => clearTimeout(timer);
  }, [warning]);

  const emitChange = useCallback(
    (newGrid: GridConfig) => {
      setGrid(newGrid);
      onConfigChange(equipmentId, buildConfigFromGrid(newGrid));
    },
    [equipmentId, onConfigChange],
  );

  // ——— 서랍판 외곽 리사이즈 (drawer 전용) ———
  // 우변(E) → equipmentWidth(eq.width) 변경
  // 하변(S) → equipmentDepth(config.depth, 서랍 깊이) 변경
  // SE 코너 → 둘 다 변경
  // GridEditor 박스의 (width × depth)는 위에서 본 서랍판 footprint와 동일 비율.
  const showDimResize =
    equipmentType === 'drawer' && onDimensionsChange !== undefined &&
    typeof equipmentWidth === 'number' && typeof equipmentDepth === 'number';

  const startDimResize = useCallback(
    (axis: 'x' | 'y' | 'xy') => (e: React.MouseEvent) => {
      if (!onDimensionsChange) return;
      e.preventDefault();
      e.stopPropagation();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startW = equipmentWidth ?? 0.5;
      const startD = equipmentDepth ?? 0.5;

      const onMove = (me: MouseEvent) => {
        const dx = (me.clientX - startClientX) / GRID_BASE_PX;
        const dy = (me.clientY - startClientY) / GRID_BASE_PX;
        const dims: { width?: number; depth?: number } = {};
        if (axis === 'x' || axis === 'xy') {
          dims.width = Math.max(MIN_DIM, Math.min(maxWidth, startW + dx));
        }
        if (axis === 'y' || axis === 'xy') {
          dims.depth = Math.max(MIN_DIM, Math.min(1, startD + dy));
        }
        onDimensionsChange(equipmentId, dims);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [equipmentId, equipmentWidth, equipmentDepth, maxWidth, onDimensionsChange],
  );

  // 선택된 셀 객체
  const selectedCell = useMemo(() => {
    if (!selectedCellKey) return null;
    return grid.cells.find((c) => cellKey(c) === selectedCellKey) ?? null;
  }, [selectedCellKey, grid.cells]);

  // 합치기 범위 계산
  const mergeRange = useMemo(() => {
    if (!mergeAnchor || !selectedCellKey) return null;
    const [sr, sc] = selectedCellKey.split('-').map(Number);
    const minRow = Math.min(mergeAnchor.row, sr);
    const maxRow = Math.max(mergeAnchor.row, sr);
    const minCol = Math.min(mergeAnchor.col, sc);
    const maxCol = Math.max(mergeAnchor.col, sc);
    if (minRow === maxRow && minCol === maxCol) return null;
    return { minRow, maxRow, minCol, maxCol };
  }, [mergeAnchor, selectedCellKey]);

  // 셀이 merge range에 포함되는지
  const isCellInRange = useCallback(
    (cell: GridCell) => {
      if (!mergeRange) return false;
      const { minRow, maxRow, minCol, maxCol } = mergeRange;
      return cell.row >= minRow && cell.row + cell.rowSpan - 1 <= maxRow &&
             cell.col >= minCol && cell.col + cell.colSpan - 1 <= maxCol;
    },
    [mergeRange],
  );

  // ——— 행/열 추가/삭제 ———

  const handleAddRow = useCallback(() => {
    emitChange(resizeGrid(grid, grid.rows + 1, grid.cols));
    setSelectedCellKey(null);
    setMergeAnchor(null);
  }, [grid, emitChange]);

  const handleRemoveRow = useCallback(() => {
    if (grid.rows <= 1) return;
    emitChange(resizeGrid(grid, grid.rows - 1, grid.cols));
    setSelectedCellKey(null);
    setMergeAnchor(null);
  }, [grid, emitChange]);

  const handleAddCol = useCallback(() => {
    emitChange(resizeGrid(grid, grid.rows, grid.cols + 1));
    setSelectedCellKey(null);
    setMergeAnchor(null);
  }, [grid, emitChange]);

  const handleRemoveCol = useCallback(() => {
    if (grid.cols <= 1) return;
    emitChange(resizeGrid(grid, grid.rows, grid.cols - 1));
    setSelectedCellKey(null);
    setMergeAnchor(null);
  }, [grid, emitChange]);

  // ——— 셀 선택 ———

  const handleCellClick = useCallback(
    (cell: GridCell, e: React.MouseEvent) => {
      const key = cellKey(cell);

      if (e.shiftKey && selectedCellKey) {
        // Shift+클릭: merge anchor 설정
        const [anchorRow, anchorCol] = selectedCellKey.split('-').map(Number);
        setMergeAnchor({ row: anchorRow, col: anchorCol });
        setSelectedCellKey(key);
      } else {
        setSelectedCellKey(key);
        setMergeAnchor(null);
      }
    },
    [selectedCellKey],
  );

  // ——— 셀 합치기 ———

  const canMerge = useMemo(() => {
    if (!mergeRange) return false;
    const { minRow, maxRow, minCol, maxCol } = mergeRange;
    // 영역 내 모든 위치가 1×1 셀로 채워져 있는지 확인
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = findCellAt(grid.cells, r, c);
        if (!cell) return false;
        if (cell.rowSpan !== 1 || cell.colSpan !== 1) return false;
      }
    }
    return true;
  }, [mergeRange, grid.cells]);

  const handleMerge = useCallback(() => {
    if (!mergeRange || !canMerge) {
      if (mergeRange && !canMerge) {
        setWarning('이미 병합된 셀이 포함되어 합칠 수 없습니다');
      }
      return;
    }

    const { minRow, maxRow, minCol, maxCol } = mergeRange;
    const newCells = grid.cells.filter(
      (c) =>
        !(c.row >= minRow && c.row <= maxRow && c.col >= minCol && c.col <= maxCol),
    );

    newCells.push({
      row: minRow,
      col: minCol,
      rowSpan: maxRow - minRow + 1,
      colSpan: maxCol - minCol + 1,
      ingredientId: null,
    });

    const newGrid: GridConfig = { rows: grid.rows, cols: grid.cols, cells: newCells };
    emitChange(newGrid);
    setSelectedCellKey(`${minRow}-${minCol}`);
    setMergeAnchor(null);
  }, [mergeRange, canMerge, grid, emitChange]);

  // ——— 셀 나누기 ———

  const canSplit = selectedCell !== null && (selectedCell.rowSpan > 1 || selectedCell.colSpan > 1);

  const handleSplit = useCallback(() => {
    if (!selectedCell || !canSplit) return;

    const newCells = grid.cells.filter((c) => cellKey(c) !== cellKey(selectedCell));
    for (let r = selectedCell.row; r < selectedCell.row + selectedCell.rowSpan; r++) {
      for (let c = selectedCell.col; c < selectedCell.col + selectedCell.colSpan; c++) {
        newCells.push({
          row: r,
          col: c,
          rowSpan: 1,
          colSpan: 1,
          ingredientId: r === selectedCell.row && c === selectedCell.col ? selectedCell.ingredientId : null,
        });
      }
    }

    const newGrid: GridConfig = { rows: grid.rows, cols: grid.cols, cells: newCells };
    emitChange(newGrid);
    setMergeAnchor(null);
  }, [selectedCell, canSplit, grid, emitChange]);

  // ——— 셀 묶기/풀기 ———

  const canBind = useMemo(() => {
    if (!mergeRange) return false;
    const { minRow, maxRow, minCol, maxCol } = mergeRange;
    // 같은 열이어야 함
    if (minCol !== maxCol) return false;
    // 범위 내 셀 수집
    const cellsInRange: GridCell[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const cell = findCellAt(grid.cells, r, minCol);
      if (!cell) return false;
      if (cell.bindGroup) return false;
      cellsInRange.push(cell);
    }
    // colSpan 동일 확인
    const firstSpan = cellsInRange[0].colSpan;
    if (!cellsInRange.every((c) => c.colSpan === firstSpan)) return false;
    // 수직 연속 확인 (중복 제거 후 row 기준 정렬)
    const uniqueCells = [...new Map(cellsInRange.map((c) => [cellKey(c), c])).values()];
    uniqueCells.sort((a, b) => a.row - b.row);
    for (let i = 0; i < uniqueCells.length - 1; i++) {
      if (uniqueCells[i].row + uniqueCells[i].rowSpan !== uniqueCells[i + 1].row) return false;
    }
    return uniqueCells.length >= 2;
  }, [mergeRange, grid.cells]);

  const canUnbind = selectedCell !== null && !!selectedCell.bindGroup;

  const handleBind = useCallback(() => {
    if (!mergeRange || !canBind) return;
    const { minRow, maxRow, minCol } = mergeRange;
    // 범위 내 셀 키 수집
    const keysInRange = new Set<string>();
    for (let r = minRow; r <= maxRow; r++) {
      const cell = findCellAt(grid.cells, r, minCol);
      if (cell) keysInRange.add(cellKey(cell));
    }
    // 앵커 = 가장 큰 row
    const anchorRow = maxRow;
    const bindGroupValue = `bind_${minCol}_${anchorRow}`;
    const newCells = grid.cells.map((c) =>
      keysInRange.has(cellKey(c)) ? { ...c, bindGroup: bindGroupValue } : c,
    );
    emitChange({ rows: grid.rows, cols: grid.cols, cells: newCells });
    setMergeAnchor(null);
  }, [mergeRange, canBind, grid, emitChange]);

  const handleUnbind = useCallback(() => {
    if (!selectedCell || !selectedCell.bindGroup) return;
    const groupValue = selectedCell.bindGroup;
    const newCells = grid.cells.map((c) =>
      c.bindGroup === groupValue ? { ...c, bindGroup: null } : c,
    );
    emitChange({ rows: grid.rows, cols: grid.cols, cells: newCells });
  }, [selectedCell, grid, emitChange]);

  // ——— 재료 연결 ———

  const handleIngredientChange = useCallback(
    (ingredientId: string | null) => {
      if (!selectedCell) return;
      const key = cellKey(selectedCell);
      const newCells = grid.cells.map((c) =>
        cellKey(c) === key ? { ...c, ingredientId } : c,
      );
      emitChange({ rows: grid.rows, cols: grid.cols, cells: newCells });
    },
    [selectedCell, grid, emitChange],
  );

  // ——— 렌더링 ———

  const title = equipmentType === 'drawer' ? '서랍 내부 편집' : '바구니 내부 편집';

  return (
    <div className={styles.gridEditorRoot}>
      <h3 className={styles.gridEditorTitle}>{title}</h3>

      {/* 툴바: 행/열 조절 + 합치기/나누기 */}
      <div className={styles.gridToolbar}>
        <div className={styles.gridToolbarGroup}>
          <span>행:</span>
          <button className={styles.gridToolbarBtn} onClick={handleRemoveRow} disabled={grid.rows <= 1}>-</button>
          <span>{grid.rows}</span>
          <button className={styles.gridToolbarBtn} onClick={handleAddRow}>+</button>
        </div>

        <div className={styles.gridToolbarDivider} />

        <div className={styles.gridToolbarGroup}>
          <span>열:</span>
          <button className={styles.gridToolbarBtn} onClick={handleRemoveCol} disabled={grid.cols <= 1}>-</button>
          <span>{grid.cols}</span>
          <button className={styles.gridToolbarBtn} onClick={handleAddCol}>+</button>
        </div>

        <div className={styles.gridToolbarDivider} />

        <button
          className={styles.gridActionBtn}
          onClick={handleMerge}
          disabled={!canMerge}
          title="Shift+클릭으로 범위 선택 후 합치기"
        >
          합치기
        </button>
        <button
          className={styles.gridActionBtn}
          onClick={handleSplit}
          disabled={!canSplit}
        >
          나누기
        </button>

        <div className={styles.gridToolbarDivider} />

        <button
          className={styles.gridActionBtn}
          onClick={handleBind}
          disabled={!canBind}
          title="Shift+클릭으로 같은 열의 연속 셀 선택 후 묶기"
        >
          묶기
        </button>
        <button
          className={styles.gridActionBtn}
          onClick={handleUnbind}
          disabled={!canUnbind}
        >
          풀기
        </button>
      </div>

      {/* 그리드 영역 (서랍이면 외곽 리사이즈로 폭/깊이 동기화).
          박스 = in-game 서랍판 top-down 모양 (eq.width × panelPxW : depth × panelPxH).
          panelPxW/panelPxH 미측정(0)이면 정사각형 fallback (eq.width × GRID_BASE_PX, depth × GRID_BASE_PX). */}
      {(() => {
        const naturalW = (equipmentWidth ?? 0.5) * (panelPxW ?? 0);
        const naturalH = (equipmentDepth ?? 0.5) * (panelPxH ?? 0);
        const natMax = Math.max(naturalW, naturalH);
        const useAspect = natMax > 0;
        const aspectScale = useAspect ? GRID_BASE_PX / natMax : 1;
        const boxW = useAspect ? naturalW * aspectScale : (equipmentWidth ?? 0.5) * GRID_BASE_PX;
        const boxH = useAspect ? naturalH * aspectScale : (equipmentDepth ?? 0.5) * GRID_BASE_PX;
        return (
      <div
        className={styles.gridResizeWrapper}
        style={
          showDimResize
            ? {
                position: 'relative',
                width: `${boxW}px`,
                height: `${boxH}px`,
                minWidth: 40,
                minHeight: 40,
              }
            : { position: 'relative' }
        }
      >
      <div
        className={styles.gridArea}
        style={{
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          ...(showDimResize ? { width: '100%', height: '100%', minHeight: 0 } : null),
        }}
      >
        {grid.cells.map((cell) => {
          const key = cellKey(cell);
          const isSelected = key === selectedCellKey;
          const isLinked = cell.ingredientId !== null;
          const inRange = isCellInRange(cell);

          const ingredientName = isLinked
            ? ingredients.find((i) => i.id === cell.ingredientId)?.display_name ?? '(삭제됨)'
            : '';

          const isBound = !!cell.bindGroup;

          let className = styles.gridCell;
          if (isSelected) className += ` ${styles.gridCellSelected}`;
          else if (inRange) className += ` ${styles.gridCellInRange}`;
          else if (isLinked) className += ` ${styles.gridCellLinked}`;
          if (isBound) className += ` ${styles.gridCellBound}`;

          return (
            <div
              key={key}
              className={className}
              style={{
                gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
                gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
              }}
              onClick={(e) => handleCellClick(cell, e)}
            >
              {ingredientName}
            </div>
          );
        })}
      </div>
      {showDimResize && (
        <>
          <div
            className={styles.gridDimHandleE}
            onMouseDown={startDimResize('x')}
            title="드래그하여 서랍 가로 조절"
          />
          <div
            className={styles.gridDimHandleS}
            onMouseDown={startDimResize('y')}
            title="드래그하여 서랍 깊이 조절"
          />
          <div
            className={styles.gridDimHandleSE}
            onMouseDown={startDimResize('xy')}
            title="드래그하여 가로/깊이 동시 조절"
          />
        </>
      )}
      </div>
        );
      })()}

      {/* 재료 연결 UI */}
      {selectedCell && (
        <div className={styles.gridIngredientSection}>
          <select
            className={styles.fkSelect}
            style={{ width: 'auto', minWidth: 120 }}
            value={selectedCell.ingredientId ?? ''}
            onChange={(e) => handleIngredientChange(e.target.value || null)}
          >
            <option value="">-- 재료 선택 --</option>
            {ingredients.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.display_name}
              </option>
            ))}
          </select>
          {selectedCell.ingredientId && (
            <button
              className={styles.fkUnlinkBtn}
              style={{ width: 'auto' }}
              onClick={() => handleIngredientChange(null)}
            >
              연결 해제
            </button>
          )}
        </div>
      )}

      {/* 경고 메시지 */}
      {warning && <div className={styles.gridWarning}>{warning}</div>}
    </div>
  );
};

export default GridEditor;
