/**
 * 섹션 네비게이션 순수 함수
 * admin/game 양쪽에서 import 가능 (src/lib/ 경로).
 */

import type { SectionCell } from '../../types/db';
import type { MovableDirections, MoveDirection } from '../../types/section';

/** 전체 셀 목록에서 시작 섹션 (가장 작은 section_number) 반환. 셀이 없으면 null. */
export function getStartSection(cells: SectionCell[]): SectionCell | null {
  if (cells.length === 0) return null;
  let min = cells[0];
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].section_number < min.section_number) {
      min = cells[i];
    }
  }
  return min;
}

/** section_number로 셀 조회 */
export function findCellByNumber(
  cells: SectionCell[],
  sectionNumber: number,
): SectionCell | null {
  return cells.find((c) => c.section_number === sectionNumber) ?? null;
}

/** (row, col) 좌표로 셀 조회 */
export function findCellByCoord(
  cells: SectionCell[],
  rowIndex: number,
  colIndex: number,
): SectionCell | null {
  return cells.find(
    (c) => c.row_index === rowIndex && c.col_index === colIndex,
  ) ?? null;
}

/** 현재 셀 기준 4방향 이동 가능 여부 계산 */
export function getMovableDirections(
  currentCell: SectionCell,
  allCells: SectionCell[],
  gridRows: number,
  gridCols: number,
): MovableDirections {
  const { row_index: r, col_index: c } = currentCell;
  return {
    up: r > 0 && findCellByCoord(allCells, r - 1, c) !== null,
    down: r < gridRows - 1 && findCellByCoord(allCells, r + 1, c) !== null,
    left: c > 0 && findCellByCoord(allCells, r, c - 1) !== null,
    right: c < gridCols - 1 && findCellByCoord(allCells, r, c + 1) !== null,
  };
}

/** 이동 방향 → 대상 셀 반환. 이동 불가면 null. */
export function getTargetCell(
  currentCell: SectionCell,
  direction: MoveDirection,
  allCells: SectionCell[],
  gridRows: number,
  gridCols: number,
): SectionCell | null {
  const { row_index: r, col_index: c } = currentCell;
  switch (direction) {
    case 'up':
      return r > 0 ? findCellByCoord(allCells, r - 1, c) : null;
    case 'down':
      return r < gridRows - 1 ? findCellByCoord(allCells, r + 1, c) : null;
    case 'left':
      return c > 0 ? findCellByCoord(allCells, r, c - 1) : null;
    case 'right':
      return c < gridCols - 1 ? findCellByCoord(allCells, r, c + 1) : null;
  }
}

/** 같은 행 이동인지 판별 */
export function isSameRowMove(
  fromCell: SectionCell,
  toCell: SectionCell,
): boolean {
  return fromCell.row_index === toCell.row_index;
}
