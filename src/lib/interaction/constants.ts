/**
 * 클릭/드롭 시 수량 입력 없이 즉시 qty=1로 투입하는 단위들.
 * 설계서 1.4 기준: spoon, portion, pinch, handful, spatula, ladle, ea
 */
export const INSTANT_UNITS = new Set([
  'spoon',
  'portion',
  'pinch',
  'handful',
  'spatula',
  'ladle',
  'ea',
]);

/** 올려놓인 그릇 한 변의 크기 (vh 단위) */
export const PLACED_CONTAINER_SIZE_VH = 8;
