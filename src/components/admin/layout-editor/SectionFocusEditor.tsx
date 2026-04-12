import { useMemo } from 'react';
import type { SectionCell } from '../../../types/db';
import type { LocalEquipment } from './types';
import { SECTION_VIEWPORT_RATIO } from '../../../lib/sections/camera';
import styles from './SectionFocusEditor.module.css';

interface SectionFocusEditorProps {
  cell: SectionCell;
  rowEquipment: LocalEquipment[];
  onRepresentativeChange: (
    rowIndex: number,
    colIndex: number,
    repType: string | null,
    repIndex: number | null,
  ) => void;
  onBack: () => void;
  /** PanelEditor를 children으로 받아 확대 렌더링 */
  children: React.ReactNode;
}

/** 대표 장비 기반 카메라 중심 X (LocalEquipment camelCase 필드용) */
function computeCenterX(
  cell: SectionCell,
  rowEquipment: LocalEquipment[],
): number {
  if (cell.rep_equipment_type === null || cell.rep_equipment_index === null) {
    return 0.5;
  }
  const eq = rowEquipment.find(
    (e) =>
      e.equipmentType === cell.rep_equipment_type &&
      e.equipmentIndex === cell.rep_equipment_index,
  );
  if (!eq) return 0.5;
  return eq.x + eq.width / 2;
}

const SectionFocusEditor: React.FC<SectionFocusEditorProps> = ({
  cell,
  rowEquipment,
  onRepresentativeChange,
  onBack,
  children,
}) => {
  const centerX = computeCenterX(cell, rowEquipment);
  const halfViewport = SECTION_VIEWPORT_RATIO / 2;

  // 확대 배율: 1 / SECTION_VIEWPORT_RATIO (= 1/0.8 = 1.25)
  const scale = 1 / SECTION_VIEWPORT_RATIO;
  // translateX: 뷰포트 중심을 centerX에 맞추기 위한 이동량 (%)
  const translateXPercent = (0.5 - centerX) * 100 * scale;

  const vpLeft = Math.max(0, centerX - halfViewport);
  const vpRight = Math.min(1, centerX + halfViewport);

  const isSelected = useMemo(
    () => (eq: LocalEquipment) =>
      cell.rep_equipment_type === eq.equipmentType &&
      cell.rep_equipment_index === eq.equipmentIndex,
    [cell.rep_equipment_type, cell.rep_equipment_index],
  );

  return (
    <div className={styles.root}>
      {/* 좌측: 확대된 Row Scene */}
      <div className={styles.sceneArea}>
        <div className={styles.sceneHeader}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            ← 뒤로
          </button>
          <span className={styles.sceneTitle}>
            섹션 {cell.section_number} 포커스 (행 {cell.row_index}, 열 {cell.col_index})
          </span>
        </div>
        {/* 클리핑 컨테이너: overflow hidden, 내부 scale + translateX */}
        <div className={styles.clipContainer}>
          <div
            className={styles.zoomedScene}
            style={{
              transform: `scale(${scale}) translateX(${translateXPercent}%)`,
              transformOrigin: 'top center',
            }}
          >
            {children}
          </div>
        </div>
        {/* 뷰포트 바 미리보기 */}
        <div className={styles.viewportBar}>
          <div
            className={styles.viewportWindow}
            style={{
              left: `${vpLeft * 100}%`,
              width: `${(vpRight - vpLeft) * 100}%`,
            }}
          />
          <div
            className={styles.viewportCenter}
            style={{ left: `${centerX * 100}%` }}
          />
        </div>
        <div className={styles.viewportLabels}>
          <span>0</span>
          <span>center: {centerX.toFixed(2)}</span>
          <span>1</span>
        </div>
      </div>

      {/* 우측: 대표 장비 선택 사이드바 */}
      <div className={styles.sidebar}>
        <h4 className={styles.sidebarTitle}>대표 장비</h4>
        <ul className={styles.equipList}>
          {rowEquipment.map((eq) => {
            const sel = isSelected(eq);
            return (
              <li key={eq.id}>
                <button
                  type="button"
                  className={`${styles.equipBtn} ${sel ? styles.equipBtnSelected : ''}`}
                  onClick={() =>
                    onRepresentativeChange(
                      cell.row_index,
                      cell.col_index,
                      eq.equipmentType,
                      eq.equipmentIndex,
                    )
                  }
                >
                  {eq.equipmentType} #{eq.equipmentIndex}
                </button>
              </li>
            );
          })}
          {rowEquipment.length === 0 && (
            <li className={styles.emptyMsg}>장비 없음</li>
          )}
        </ul>
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() =>
            onRepresentativeChange(cell.row_index, cell.col_index, null, null)
          }
        >
          선택 해제
        </button>
      </div>
    </div>
  );
};

export default SectionFocusEditor;
