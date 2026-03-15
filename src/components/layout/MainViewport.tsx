import { useEffect, useRef, useState, useCallback } from 'react';
import { useDndMonitor, type DragMoveEvent } from '@dnd-kit/core';
import { useUiStore, DEFAULT_SECTION_CONFIG } from '../../stores/uiStore';
import type { TurnResult } from '../../stores/uiStore';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { KitchenZone } from '../../types/db';
import HitboxLayer from '../game/HitboxLayer';
import BillQueue from './BillQueue';
import LeftSidebar from './LeftSidebar';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import styles from './MainViewport.module.css';

interface Props {
  getRecipeName?: (recipeId: string) => string;
  getRecipeNaturalText?: (recipeId: string) => string | null;
}

export default function MainViewport({ getRecipeName, getRecipeNaturalText }: Props) {
  const currentSection = useUiStore((s) => s.currentSection);
  const setCurrentSection = useUiStore((s) => s.setCurrentSection);
  const currentZoneId = useUiStore((s) => s.currentZoneId);
  const setCurrentZoneId = useUiStore((s) => s.setCurrentZoneId);
  const sectionConfig = useUiStore((s) => s.sectionConfig);
  const setSectionConfig = useUiStore((s) => s.setSectionConfig);
  const goNextAction = useUiStore((s) => s.goNext);
  const goPrevAction = useUiStore((s) => s.goPrev);
  const goTurnAction = useUiStore((s) => s.goTurn);
  const setBillQueueAreas = useUiStore((s) => s.setBillQueueAreas);
  const billQueueAreas = useUiStore((s) => s.billQueueAreas);
  const leftSidebarAnchor = useUiStore((s) => s.leftSidebarAnchor);
  const selectedStore = useAuthStore((s) => s.selectedStore)!;
  const storeId = useGameStore((s) => s.storeId) ?? selectedStore.id;
  const resetZoneCache = useUiStore((s) => s.resetZoneCache);

  const [zone, setZone] = useState<KitchenZone | null>(null);
  const [visualOffset, setVisualOffset] = useState<-1 | 0 | 1>(0);
  const [suppressTransition, setSuppressTransition] = useState(false);
  const [imgWidth, setImgWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isSnappingRef = useRef(false);

  // 이미지 로드 완료 시 정확한 너비 재측정 (ResizeObserver 보완)
  const handleImageLoad = useCallback(() => {
    if (imgRef.current) {
      setImgWidth(imgRef.current.getBoundingClientRect().width);
    }
  }, []);

  // zone 로딩 + section_config 적용 (Step 14)
  useEffect(() => {
    resetZoneCache();
    supabase
      .from('kitchen_zones')
      .select('*')
      .eq('store_id', storeId)
      .eq('zone_key', 'main_kitchen')
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const z = data as KitchenZone;
          setZone(z);
          setCurrentZoneId(z.id);

          // section_config 적용 (null → DEFAULT fallback in uiStore)
          setSectionConfig(z.section_config);
          setBillQueueAreas(z.bill_queue_areas);

          // 초기 섹션: 1이 벽이면 첫 번째 비벽 섹션 찾기
          const config = z.section_config ?? DEFAULT_SECTION_CONFIG;
          const wallSet = new Set(config.walls);
          const totalSections = config.boundaries.length - 1;
          let initialSection = 1;
          if (wallSet.has(1)) {
            for (let s = 2; s <= totalSections; s++) {
              if (!wallSet.has(s)) { initialSection = s; break; }
            }
          }
          setCurrentSection(initialSection);
        }
      });
  }, [storeId, setCurrentZoneId, setCurrentSection, setSectionConfig, setBillQueueAreas, resetZoneCache]);

  // 이미지 크기 추적 (원칙 7: img.offsetWidth 기준)
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(([entry]) => {
      setImgWidth(entry.contentRect.width);
    });
    ro.observe(img);
    return () => ro.disconnect();
  }, [zone]);

  // 뷰포트 크기 추적
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // translateX (boundaries 기반 순수 중앙 정렬 + 3-copy 캐러셀 보정)
  const config = sectionConfig;
  const startRatio = config.boundaries[currentSection - 1] ?? 0;
  const endRatio = config.boundaries[currentSection] ?? 0;
  const sectionCenterPx = ((startRatio + endRatio) / 2) * imgWidth;

  const translateX = imgWidth > 0
    ? -(sectionCenterPx - viewportWidth / 2) - imgWidth - (visualOffset * imgWidth)
    : 0;

  const innerStyle = {
    transform: `translateX(${translateX}px)`,
    transition: suppressTransition ? 'none' : 'transform 0.3s ease',
  };

  // onTransitionEnd: 슬라이드 완료 후 스냅백
  const handleTransitionEnd = useCallback(() => {
    if (!isSnappingRef.current) return;
    setSuppressTransition(true);
    setVisualOffset(0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setSuppressTransition(false);
      isSnappingRef.current = false;
    }));
  }, []);

  // 턴 결과 처리 (애니메이션 방향 설정)
  const handleTurnResult = useCallback(
    (result: TurnResult | null) => {
      if (!result) return;
      if (result.direction === 0) return;
      isSnappingRef.current = true;
      setVisualOffset(result.direction);
    },
    [],
  );

  // 섹션 이동 함수 (uiStore 액션 래퍼)
  const goNext = useCallback(() => {
    if (imgWidth === 0 || isSnappingRef.current) return;
    handleTurnResult(goNextAction());
  }, [imgWidth, goNextAction, handleTurnResult]);

  const goPrev = useCallback(() => {
    if (imgWidth === 0 || isSnappingRef.current) return;
    handleTurnResult(goPrevAction());
  }, [imgWidth, goPrevAction, handleTurnResult]);

  const goTurn = useCallback(() => {
    if (imgWidth === 0 || isSnappingRef.current) return;
    handleTurnResult(goTurnAction());
  }, [imgWidth, goTurnAction, handleTurnResult]);

  // 스와이프 제스처 네비게이션
  const NAV_COOLDOWN_MS = 500;
  const orderSelectModalOpen = useUiStore((s) => s.orderSelectModalOpen);
  const quantityModalOpen = useUiStore((s) => s.quantityModalOpen);
  useSwipeNavigation({
    containerRef,
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
    onSwipeVertical: goTurn,
    enabled: !orderSelectModalOpen && !quantityModalOpen,
    cooldownMs: NAV_COOLDOWN_MS,
  });

  // 드래그 중 버튼 호버 → 시점 이동 / 오른쪽 가장자리 → 사이드바 펼침
  const navLeftRef = useRef<HTMLButtonElement>(null);
  const navRightRef = useRef<HTMLButtonElement>(null);
  const navBackRef = useRef<HTMLButtonElement>(null);

  const isOverLeftRef = useRef(false);
  const isOverRightRef = useRef(false);
  const isOverBackRef = useRef(false);
  const isOverRightEdgeRef = useRef(false);
  const leftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightEdgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavTimestampRef = useRef(0);

  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);

  const resetAllDragHover = useCallback(() => {
    const pairs: [React.RefObject<boolean>, React.RefObject<ReturnType<typeof setTimeout> | null>][] = [
      [isOverLeftRef, leftTimerRef],
      [isOverRightRef, rightTimerRef],
      [isOverBackRef, backTimerRef],
      [isOverRightEdgeRef, rightEdgeTimerRef],
    ];
    for (const [flagRef, timerRef] of pairs) {
      flagRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
    lastNavTimestampRef.current = 0;
  }, []);

  useDndMonitor({
    onDragMove(event: DragMoveEvent) {
      const { activatorEvent, delta } = event;
      if (!(activatorEvent instanceof PointerEvent || activatorEvent instanceof MouseEvent)) return;
      const pointerX = activatorEvent.clientX + delta.x;
      const pointerY = activatorEvent.clientY + delta.y;

      const isInsideEl = (el: HTMLElement | null): boolean => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return pointerX >= r.left && pointerX <= r.right && pointerY >= r.top && pointerY <= r.bottom;
      };

      const checkHover = (
        isInside: boolean,
        flagRef: React.RefObject<boolean>,
        timerRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
        action: () => void,
        delay: number,
        isNav = false,
      ) => {
        if (isInside) {
          if (!flagRef.current) {
            if (isNav && Date.now() - lastNavTimestampRef.current < NAV_COOLDOWN_MS) return;
            flagRef.current = true;
            timerRef.current = setTimeout(() => {
              if (isNav) lastNavTimestampRef.current = Date.now();
              action();
              timerRef.current = null;
            }, delay);
          }
        } else if (flagRef.current) {
          flagRef.current = false;
          if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        }
      };

      // ◀ 버튼 호버 → 0.5s → goPrev
      checkHover(isInsideEl(navLeftRef.current), isOverLeftRef, leftTimerRef, goPrev, 500, true);
      // ▶ 버튼 호버 → 0.5s → goNext
      checkHover(isInsideEl(navRightRef.current), isOverRightRef, rightTimerRef, goNext, 500, true);
      // 뒤돌기 버튼 호버 → 0.5s → goTurn
      checkHover(isInsideEl(navBackRef.current), isOverBackRef, backTimerRef, goTurn, 500, true);

      // 오른쪽 가장자리(10%) → 0.2s → 사이드바 펼침 (쿨다운 미적용)
      if (containerRef.current) {
        const vpRect = containerRef.current.getBoundingClientRect();
        const rightEdge = pointerX > vpRect.right - vpRect.width * 0.1;
        checkHover(rightEdge, isOverRightEdgeRef, rightEdgeTimerRef, () => setRightSidebarOpen(true), 200);
      }
    },
    onDragEnd() { resetAllDragHover(); },
    onDragCancel() { resetAllDragHover(); },
  });

  return (
    <div ref={containerRef} className={styles.viewport}>
      {zone ? (
        <div
          className={styles.inner}
          style={innerStyle}
          onTransitionEnd={handleTransitionEnd}
        >
          {/* 복사본 L */}
          <img
            src={zone.image_url ?? ''}
            alt=""
            aria-hidden="true"
            className={styles.zoneImage}
            draggable={false}
            style={{ pointerEvents: 'none' }}
          />
          {/* 원본 C + HitboxLayer */}
          <div className={styles.centerSlot}>
            <img
              ref={imgRef}
              src={zone.image_url ?? ''}
              alt={zone.label}
              className={styles.zoneImage}
              draggable={false}
              onLoad={handleImageLoad}
            />
            {currentZoneId && <HitboxLayer zoneId={currentZoneId} imageWidth={zone.image_width} imageHeight={zone.image_height} />}
            {billQueueAreas && billQueueAreas.length > 0 && getRecipeName && (
              billQueueAreas.map((area, i) => (
                <div
                  key={i}
                  className={styles.billQueueAnchor}
                  style={{
                    left: `${area.x * 100}%`,
                    top: `${area.y * 100}%`,
                    width: `${area.w * 100}%`,
                    height: `${area.h * 100}%`,
                  }}
                >
                  <BillQueue getRecipeName={getRecipeName} getRecipeNaturalText={getRecipeNaturalText} />
                </div>
              ))
            )}
            {leftSidebarAnchor && (
              <div
                className={styles.leftSidebarAnchor}
                style={{
                  left: `${leftSidebarAnchor.x * 100}%`,
                  top: `${leftSidebarAnchor.y * 100}%`,
                  width: `${leftSidebarAnchor.w * 100}%`,
                }}
              >
                <LeftSidebar />
              </div>
            )}
          </div>
          {/* 복사본 R */}
          <img
            src={zone.image_url ?? ''}
            alt=""
            aria-hidden="true"
            className={styles.zoneImage}
            draggable={false}
            style={{ pointerEvents: 'none' }}
          />
        </div>
      ) : (
        <div className={styles.loading}>로딩 중...</div>
      )}

      <button
        ref={navLeftRef}
        className={`${styles.navBtn} ${styles.navLeft}`}
        onClick={goPrev}
      >
        ◀
      </button>
      <button
        ref={navRightRef}
        className={`${styles.navBtn} ${styles.navRight}`}
        onClick={goNext}
      >
        ▶
      </button>
      <button ref={navBackRef} className={`${styles.navBtn} ${styles.navBack}`} onClick={goTurn}>뒤돌기</button>
    </div>
  );
}
