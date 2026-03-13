import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { supabase } from '../../lib/supabase';
import type { KitchenZone } from '../../types/db';
import HitboxLayer from '../game/HitboxLayer';
import styles from './LeftSidebar.module.css';

export default function LeftSidebar() {
  const leftSidebarZoneId = useUiStore((s) => s.leftSidebarZoneId);
  const leftSidebarOpen = useUiStore((s) => s.leftSidebarOpen);
  const setLeftSidebarZone = useUiStore((s) => s.setLeftSidebarZone);
  const toggleLeftSidebar = useUiStore((s) => s.toggleLeftSidebar);
  const zoneCacheMap = useUiStore((s) => s.zoneCacheMap);
  const [zone, setZone] = useState<KitchenZone | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!leftSidebarZoneId) {
      setZone(null);
      return;
    }

    // 캐시 히트: 즉시 반환
    const cached = zoneCacheMap.get(leftSidebarZoneId);
    if (cached) {
      setZone(cached);
      return;
    }

    // 캐시 미스: 기존 fetch 폴백
    supabase
      .from('kitchen_zones')
      .select('*')
      .eq('id', leftSidebarZoneId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setZone(data as KitchenZone);
        }
      });
  }, [leftSidebarZoneId, zoneCacheMap]);

  // 외부 클릭 시 사이드바 닫기
  useEffect(() => {
    if (!leftSidebarOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setLeftSidebarZone(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [leftSidebarOpen, setLeftSidebarZone]);

  return (
    <div ref={wrapperRef} className={styles.leftSidebarWrapper}>
      <div className={`${styles.sidebar} ${leftSidebarOpen ? styles.open : ''}`}>
        <button
          className={styles.toggleButton}
          onClick={toggleLeftSidebar}
        >
          {leftSidebarOpen ? '<<' : '>>'}
        </button>
        <div className={styles.sidebarContent}>
          {zone ? (
            <>
              <div className={styles.header}>
                <span className={styles.headerTitle}>{zone.label}</span>
                <button
                  className={styles.closeButton}
                  onClick={() => setLeftSidebarZone(null)}
                  aria-label="사이드바 닫기"
                >
                  ✕
                </button>
              </div>
              <div className={styles.imageWrapper}>
                <div
                  className={styles.imageInner}
                  style={{ '--img-ratio': zone.image_height > 0 ? zone.image_width / zone.image_height : 1 } as React.CSSProperties}
                >
                  <img
                    src={zone.image_url ?? ''}
                    alt={zone.label}
                    className={styles.zoneImage}
                    draggable={false}
                  />
                  <HitboxLayer zoneId={zone.id} imageWidth={zone.image_width} imageHeight={zone.image_height} />
                </div>
              </div>
            </>
          ) : (
            <div className={styles.empty}>구역을 선택하세요</div>
          )}
        </div>
      </div>
    </div>
  );
}
