/**
 * 섹션 그리드 시스템 — 게임/관리자 공용 타입
 * DB 타입은 src/types/db.ts의 SectionGrid, SectionCell 참조.
 * 이 파일은 런타임 파생 타입과 유틸 인터페이스를 정의한다.
 */

/** 4방향 이동 가능 여부 */
export interface MovableDirections {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** 이동 방향 */
export type MoveDirection = 'up' | 'down' | 'left' | 'right';

/** 카메라 상태 (인게임 뷰포트 위치) */
export interface CameraState {
  /** 현재 행 인덱스 */
  rowIndex: number;
  /** 뷰포트 중심 X (0~1 비율) — translateX 계산 기준 */
  centerX: number;
}

/** 편집기 뷰 모드 */
export type EditorView = 'grid' | 'row' | 'section';
