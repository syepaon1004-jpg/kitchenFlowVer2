/**
 * 섹션 카메라 계산 순수 함수
 * admin/game 양쪽에서 import 가능 (src/lib/ 경로).
 */

import type { SectionCell, PanelEquipment } from '../../types/db';

/** 뷰포트 폭 대비 섹션 표시 비율 (80%) */
export const SECTION_VIEWPORT_RATIO = 0.8;

/**
 * 대표 장비 기반 카메라 중심 X (0~1 비율) 계산.
 * rep_equipment_type/index가 null이거나 매칭 장비가 없으면 fallback 0.5.
 */
export function getSectionCenterX(
  cell: SectionCell,
  rowEquipment: PanelEquipment[],
): number {
  if (cell.rep_equipment_type === null || cell.rep_equipment_index === null) {
    return 0.5;
  }
  const eq = rowEquipment.find(
    (e) =>
      e.equipment_type === cell.rep_equipment_type &&
      e.equipment_index === cell.rep_equipment_index,
  );
  if (!eq) return 0.5;
  return eq.x + eq.width / 2;
}

/**
 * 카메라 중심 X → scene translateX 비율 변환.
 * 뷰��트 중앙에 centerX가 오도록 offset 계산.
 * 반환값: scene wrapper에 적용할 translateX 비율 (음수 = 좌측으로 이동).
 */
export function getCameraTranslateRatio(centerX: number): number {
  return 0.5 - centerX;
}
