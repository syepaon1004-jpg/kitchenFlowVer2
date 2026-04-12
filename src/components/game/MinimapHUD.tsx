import styles from './MinimapHUD.module.css';

interface MinimapHUDProps {
  gridRows: number;
  gridCols: number;
  cells: Array<{ row_index: number; col_index: number; section_number: number }>;
  currentSection: number;
}

export default function MinimapHUD({
  gridRows,
  gridCols,
  cells,
  currentSection,
}: MinimapHUDProps) {
  // Build a lookup: "row,col" → section_number
  const cellMap = new Map<string, number>();
  for (const c of cells) {
    cellMap.set(`${c.row_index},${c.col_index}`, c.section_number);
  }

  const rows: number[] = [];
  for (let r = 0; r < gridRows; r++) rows.push(r);

  const cols: number[] = [];
  for (let c = 0; c < gridCols; c++) cols.push(c);

  return (
    <div
      className={styles.container}
      style={{
        gridTemplateColumns: `repeat(${gridCols}, var(--minimap-cell))`,
        gridTemplateRows: `repeat(${gridRows}, var(--minimap-cell))`,
      }}
    >
      {rows.map((r) =>
        cols.map((c) => {
          const section = cellMap.get(`${r},${c}`);
          const occupied = section !== undefined;
          const isCurrent = occupied && section === currentSection;

          return (
            <div
              key={`${r}-${c}`}
              className={`${styles.cell} ${occupied ? styles.occupied : ''} ${isCurrent ? styles.current : ''}`}
            >
              {occupied ? section : ''}
            </div>
          );
        }),
      )}
    </div>
  );
}
