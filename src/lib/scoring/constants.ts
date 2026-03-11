// src/lib/scoring/constants.ts
// 이 파일의 값만 변경하면 전체 점수 체계가 바뀌어야 한다.
// 다른 파일에 점수 값을 하드코딩하지 마라.

export const SCORE_CONFIG = {
  INITIAL_SCORE: 80,

  // 서빙 시간 점수
  FAST_SERVE: +1,
  SLOW_SERVE: -1,
  VERY_SLOW_SERVE: -2,

  // 조리 실수
  DISPOSE: -2,
  WOK_BURNED: -1,

  // 효율성
  SHORT_IDLE: -1,
  LONG_IDLE: -2,
  REDUNDANT_NAV: -1,

  // 시간 기준 (ms)
  FAST_SERVE_THRESHOLD: 5 * 60 * 1000,
  SLOW_SERVE_THRESHOLD: 7 * 60 * 1000,
  VERY_SLOW_SERVE_THRESHOLD: 10 * 60 * 1000,
  SHORT_IDLE_THRESHOLD: 5 * 1000,
  LONG_IDLE_THRESHOLD: 10 * 1000,

  // 연속 navigate 횟수
  REDUNDANT_NAV_COUNT: 3,
} as const;
