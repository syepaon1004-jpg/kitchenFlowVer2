/**
 * 섹션 카메라 계산 순수 함수
 * admin/game 양쪽에서 import 가능 (src/lib/ 경로).
 */

import type { SectionCell, PanelEquipment, ImageFitMode } from '../../types/db';

/** 뷰포트 폭 대비 섹션 표시 비율 (80%) */
export const SECTION_VIEWPORT_RATIO = 0.8;

/**
 * 대표 장비 기반 카메라 중심 X (0~1 비율) 계산.
 * rep_equipment_type/index가 null이거나 매칭 장비가 없으면 fallback 0.5.
 * 반환값은 "이미지 월드 기준 0~1" — 이미지 공간 내의 섹션 중심.
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
 * 이미지 월드 폭(px) 계산.
 * natural: 높이 고정 → 폭은 원본 종횡비. 자연 크기 미지(로딩 전)면 viewport 폭.
 * cover/stretch: viewport 폭 그대로.
 */
export function computeWorldWidthPx(
  mode: ImageFitMode,
  viewportW: number,
  viewportH: number,
  natural: { w: number; h: number } | null,
): number {
  if (mode !== 'natural' || !natural || natural.h <= 0) return viewportW;
  return viewportH * (natural.w / natural.h);
}

/**
 * 이미지 월드에 적용할 translateX(px) 계산.
 * centerX(이미지 기준 0~1)를 뷰포트 중앙에 배치하되, 월드 범위를 벗어나지 않도록 clamp.
 * cover/stretch(worldW === viewportW)에서는 maxLeft === 0 → 항상 0 반환.
 */
export function computeWorldTranslateX(
  centerX: number,
  worldWidthPx: number,
  viewportW: number,
): number {
  const targetLeftPx = centerX * worldWidthPx - viewportW / 2;
  const maxLeft = Math.max(0, worldWidthPx - viewportW);
  const clamped = Math.min(maxLeft, Math.max(0, targetLeftPx));
  return -clamped;
}
