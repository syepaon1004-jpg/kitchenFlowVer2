import React, { useState, useCallback } from 'react';
import type { SectionCell } from '../../../types/db';
import styles from './GridOverview.module.css';

interface GridOverviewProps {
  gridRows: number;
  gridCols: number;
  cells: SectionCell[];
  onGridResize: (rows: number, cols: number) => void;
  onCellToggle: (rowIndex: number, colIndex: number) => void;
  onCellSectionNumberChange: (rowIndex: number, colIndex: number, sectionNumber: number) => void;
  onRowSelect: (rowIndex: number) => void;
}

function GridOverview({
  gridRows,
  gridCols,
  cells,
  onGridResize,
  onCellToggle,
  onCellSectionNumberChange,
  onRowSelect,
}: GridOverviewProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const findCell = useCallback(
    (row: number, col: number): SectionCell | undefined =>
      cells.find((c) => c.row_index === row && c.col_index === col),
    [cells],
  );

  const handleCellClick = (row: number, col: number) => {
    const cell = findCell(row, col);
    if (cell) {
      setEditingCell({ row, col });
      setEditValue(String(cell.section_number));
    } else {
      onCellToggle(row, col);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    const cell = findCell(row, col);
    if (cell) {
      onCellToggle(row, col);
      if (editingCell?.row === row && editingCell?.col === col) {
        setEditingCell(null);
      }
    }
  };

  const handleEditConfirm = () => {
    if (!editingCell) return;
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onCellSectionNumberChange(editingCell.row, editingCell.col, parsed);
    }
    setEditingCell(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleEditConfirm();
    if (e.key === 'Escape') setEditingCell(null);
  };

  return (
    <div className={styles.root}>
      <h3 className={styles.title}>Grid Overview</h3>

      <div className={styles.controls}>
        <span>
          {gridRows} rows × {gridCols} cols
        </span>
        <button type="button" className={styles.controlBtn} onClick={() => onGridResize(gridRows, gridCols + 1)}>
          + Col
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => onGridResize(gridRows, Math.max(1, gridCols - 1))}
          disabled={gridCols <= 1}
        >
          − Col
        </button>
        <button type="button" className={styles.controlBtn} onClick={() => onGridResize(gridRows + 1, gridCols)}>
          + Row
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => onGridResize(Math.max(1, gridRows - 1), gridCols)}
          disabled={gridRows <= 1}
        >
          − Row
        </button>
      </div>

      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${gridCols}, var(--admin-grid-cell-size)) auto`,
          gridTemplateRows: `repeat(${gridRows}, var(--admin-grid-cell-size))`,
        }}
      >
        {Array.from({ length: gridRows }, (_, rowIdx) => (
          <React.Fragment key={rowIdx}>
            {Array.from({ length: gridCols }, (_, colIdx) => {
              const cell = findCell(rowIdx, colIdx);
              const isEditing =
                editingCell?.row === rowIdx && editingCell?.col === colIdx;

              return (
                <div
                  key={colIdx}
                  className={`${styles.cell} ${cell ? styles.cellOccupied : styles.cellEmpty}`}
                  onClick={() => handleCellClick(rowIdx, colIdx)}
                  onContextMenu={(e) => handleContextMenu(e, rowIdx, colIdx)}
                  title={
                    cell
                      ? `Section ${cell.section_number} (right-click to remove)`
                      : 'Click to add cell'
                  }
                >
                  {isEditing ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleEditConfirm}
                      onKeyDown={handleEditKeyDown}
                      autoFocus
                      className={styles.editInput}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : cell ? (
                    <span>{cell.section_number}</span>
                  ) : (
                    <span className={styles.cellEmptyIcon}>+</span>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className={styles.rowBtn}
              onClick={() => onRowSelect(rowIdx)}
            >
              Row {rowIdx} →
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default GridOverview;
