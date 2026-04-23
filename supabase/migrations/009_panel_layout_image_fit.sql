-- ============================================================
-- 009: panel_layouts image fit mode
-- 배경 이미지 표시 방식 선택 (natural / cover / stretch)
-- ============================================================
--
-- natural  : 이미지 원본 비율 유지 (높이 = 뷰포트 100%, 폭은 비율대로).
--            이미지가 뷰포트보다 넓으면 방향키 카메라로 좌우 스크롤.
-- cover    : 뷰포트 꽉 채움 + 세로 잘림 (기존 동작 보존).
-- stretch  : 뷰포트 꽉 채움 + 비율 왜곡.
--
-- 기본값은 'cover' — 기존 매장 시각 회귀 방지.
-- 신규 레이아웃은 애플리케이션 레벨에서 'natural'을 명시해서 insert한다.

ALTER TABLE panel_layouts
  ADD COLUMN image_fit_mode text NOT NULL
    DEFAULT 'cover'
    CHECK (image_fit_mode IN ('natural', 'cover', 'stretch'));
