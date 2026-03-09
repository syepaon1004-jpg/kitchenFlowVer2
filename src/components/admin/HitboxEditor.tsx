import { useCallback, useEffect, useRef, useState } from 'react';
import type { AreaDefinition, AreaType, HitboxPoint } from '../../types/db';
import { supabase } from '../../lib/supabase';
import styles from './HitboxEditor.module.css';

const AREA_COLORS: Record<AreaType, string> = {
  ingredient: 'rgba(0,200,0,0.15)',
  container: 'rgba(0,100,255,0.15)',
  navigate: 'rgba(255,200,0,0.15)',
  equipment: 'rgba(255,120,0,0.15)',
  basket: 'rgba(200,0,200,0.15)',
};

const AREA_BORDER_COLORS: Record<AreaType, string> = {
  ingredient: 'rgba(0,200,0,0.8)',
  container: 'rgba(0,100,255,0.8)',
  navigate: 'rgba(255,200,0,0.8)',
  equipment: 'rgba(255,120,0,0.8)',
  basket: 'rgba(200,0,200,0.8)',
};

interface Props {
  zoneId: string | null;
  zoneImageUrl: string | null;
  selectedAreaId: string | null;
  onSelectArea: (area: AreaDefinition | null) => void;
  areas: AreaDefinition[];
  onAreasChange: (areas: AreaDefinition[]) => void;
  storeId: string;
  imageWidth?: number;
  imageHeight?: number;
}

interface DrawState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Get 4 corner points from x/y/w/h (TL, TR, BR, BL) */
function rectToPoints(area: AreaDefinition): HitboxPoint[] {
  return [
    [area.x, area.y],
    [area.x + area.w, area.y],
    [area.x + area.w, area.y + area.h],
    [area.x, area.y + area.h],
  ];
}

function getRelativeFromEvent(
  e: MouseEvent | React.MouseEvent,
  container: HTMLElement,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  return {
    x: clamp((e.clientX - rect.left) / rect.width),
    y: clamp((e.clientY - rect.top) / rect.height),
  };
}

export default function HitboxEditor({
  zoneId,
  zoneImageUrl,
  selectedAreaId,
  onSelectArea,
  areas,
  onAreasChange,
  storeId,
  imageWidth,
  imageHeight,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPanorama, setIsPanorama] = useState(false);
  const [currentSection, setCurrentSection] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);
  // Track whether we're in a handle/body drag to suppress drawing
  const draggingRef = useRef(false);

  // ─── Panorama derived values ───
  const sectionWidth = viewportWidth / 1.4;
  const imgDisplayWidth = isPanorama && sectionWidth > 0 ? sectionWidth * 8 : undefined;
  const translateX = isPanorama && sectionWidth > 0
    ? -((currentSection - 1) * sectionWidth) + (sectionWidth * 0.2)
    : 0;

  // ─── Panorama: image onLoad ───
  const handleImageLoad = useCallback(() => {
    if (!imgRef.current) return;
    setNaturalW(imgRef.current.naturalWidth);
    setNaturalH(imgRef.current.naturalHeight);
    const ratio = imgRef.current.naturalWidth / imgRef.current.naturalHeight;
    setIsPanorama(ratio > 2.0);
    setCurrentSection(1);
  }, []);

  // ─── Panorama: ResizeObserver on viewport ───
  useEffect(() => {
    if (!isPanorama || !viewportRef.current) {
      setViewportWidth(0);
      return;
    }
    const el = viewportRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setViewportWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isPanorama]);

  // Load areas when zone changes
  useEffect(() => {
    if (!zoneId) {
      onAreasChange([]);
      return;
    }
    // Reset panorama state on zone change
    setIsPanorama(false);
    setCurrentSection(1);
    setViewportWidth(0);
    setLoading(true);
    supabase
      .from('area_definitions')
      .select('*')
      .eq('zone_id', zoneId)
      .then(({ data, error }) => {
        if (error) {
          console.error('area_definitions 로딩 실패:', error);
          onAreasChange([]);
        } else {
          onAreasChange((data as AreaDefinition[]) ?? []);
        }
        setLoading(false);
      });
  }, [zoneId, onAreasChange]);

  // ─── Rectangle drawing (mousedown on empty area) ───
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (draggingRef.current) return;
      // Only start drawing on empty area (not on SVG shapes)
      const target = e.target as Element;
      if (target.tagName !== 'svg' && target !== containerRef.current) {
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      const pos = getRelativeFromEvent(e, el);
      setDrawState({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawState) return;
      const el = containerRef.current;
      if (!el) return;
      const pos = getRelativeFromEvent(e, el);
      setDrawState((prev) => (prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null));
    },
    [drawState],
  );

  const handleMouseUp = useCallback(() => {
    if (!drawState || !zoneId) {
      setDrawState(null);
      return;
    }

    const x = Math.min(drawState.startX, drawState.currentX);
    const y = Math.min(drawState.startY, drawState.currentY);
    const w = Math.abs(drawState.currentX - drawState.startX);
    const h = Math.abs(drawState.currentY - drawState.startY);

    setDrawState(null);

    if (w < 0.01 || h < 0.01) return;

    const newArea: AreaDefinition = {
      id: `temp-${Date.now()}`,
      store_id: storeId,
      zone_id: zoneId,
      label: '',
      area_type: 'ingredient',
      x,
      y,
      w,
      h,
      points: null,
      ingredient_id: null,
      container_id: null,
      navigate_zone_id: null,
      equipment_type: null,
      equipment_index: null,
      drag_image_url: null,
      overlay_image_url: null,
      parent_area_id: null,
      sort_order: 0,
    };

    onAreasChange([...areas, newArea]);
    onSelectArea(newArea);
  }, [drawState, zoneId, storeId, areas, onAreasChange, onSelectArea]);

  // ─── Handle drag (vertex move) ───
  const handleHandleMouseDown = useCallback(
    (e: React.MouseEvent, areaId: string, pointIndex: number) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;
      const el = containerRef.current;
      if (!el) return;

      const onMove = (me: MouseEvent) => {
        const pos = getRelativeFromEvent(me, el);
        onAreasChange(
          areas.map((a) => {
            if (a.id !== areaId) return a;
            // Initialize points from rect if null
            const pts: HitboxPoint[] = a.points ? [...a.points.map((p) => [...p] as HitboxPoint)] : rectToPoints(a);
            pts[pointIndex] = [pos.x, pos.y];
            return { ...a, points: pts };
          }),
        );
      };

      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [areas, onAreasChange],
  );

  // ─── Body drag (whole hitbox move) ───
  const handleBodyMouseDown = useCallback(
    (e: React.MouseEvent, areaId: string) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;
      const el = containerRef.current;
      if (!el) return;

      const startPos = getRelativeFromEvent(e, el);

      const onMove = (me: MouseEvent) => {
        const currentPos = getRelativeFromEvent(me, el);
        const dx = currentPos.x - startPos.x;
        const dy = currentPos.y - startPos.y;
        startPos.x = currentPos.x;
        startPos.y = currentPos.y;

        onAreasChange(
          areas.map((a) => {
            if (a.id !== areaId) return a;
            if (a.points) {
              const newPoints = a.points.map(
                ([px, py]) => [clamp(px + dx), clamp(py + dy)] as HitboxPoint,
              );
              return { ...a, points: newPoints };
            }
            return {
              ...a,
              x: clamp(a.x + dx),
              y: clamp(a.y + dy),
            };
          }),
        );
      };

      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [areas, onAreasChange],
  );

  // ─── Hitbox click (select) ───
  const handleHitboxClick = useCallback(
    (e: React.MouseEvent, area: AreaDefinition) => {
      e.stopPropagation();
      onSelectArea(area);
    },
    [onSelectArea],
  );

  // Delete key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedAreaId) {
        const area = areas.find((a) => a.id === selectedAreaId);
        if (!area) return;

        if (area.id.startsWith('temp-')) {
          onAreasChange(areas.filter((a) => a.id !== area.id));
          onSelectArea(null);
        } else {
          supabase
            .from('area_definitions')
            .delete()
            .eq('id', area.id)
            .then(({ error }) => {
              if (error) {
                console.error('삭제 실패:', error);
              } else {
                onAreasChange(areas.filter((a) => a.id !== area.id));
                onSelectArea(null);
              }
            });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedAreaId, areas, onAreasChange, onSelectArea]);

  // viewBox 크기: props 우선, 없으면 onLoad에서 캡처한 값, 최종 fallback 1000
  const vbW = imageWidth || naturalW || 1000;
  const vbH = imageHeight || naturalH || 1000;

  if (!zoneId || !zoneImageUrl) {
    return <div className={styles.placeholder}>왼쪽에서 Zone을 선택하세요</div>;
  }

  // Draw preview rect coordinates
  const preview = drawState
    ? {
        x: Math.min(drawState.startX, drawState.currentX),
        y: Math.min(drawState.startY, drawState.currentY),
        w: Math.abs(drawState.currentX - drawState.startX),
        h: Math.abs(drawState.currentY - drawState.startY),
      }
    : null;

  const containerStyle: React.CSSProperties | undefined =
    isPanorama && imgDisplayWidth
      ? { width: imgDisplayWidth, transform: `translateX(${translateX}px)`, transition: 'transform 0.3s ease' }
      : undefined;

  const imgStyle: React.CSSProperties | undefined =
    isPanorama && imgDisplayWidth
      ? { width: imgDisplayWidth, maxWidth: 'none' }
      : undefined;

  return (
    <div ref={viewportRef} className={isPanorama ? styles.editorViewport : undefined}>
      <div
        ref={containerRef}
        className={styles.editorContainer}
        style={containerStyle}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDrawState(null)}
      >
        <img
          ref={imgRef}
          src={zoneImageUrl}
          alt="zone"
          className={styles.zoneImage}
          style={imgStyle}
          draggable={false}
          onLoad={handleImageLoad}
        />
        <svg
          className={styles.hitboxOverlay}
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="none"
        >
          {loading && (
            <text x={vbW / 2} y={vbH / 2} textAnchor="middle" fill="#999" fontSize="24">
              로딩 중...
            </text>
          )}
          {areas.map((area) => {
            const isSelected = area.id === selectedAreaId;
            const fillColor = AREA_COLORS[area.area_type];
            const strokeColor = isSelected ? '#fff' : AREA_BORDER_COLORS[area.area_type];
            const hasOverlay = !!area.overlay_image_url;
            const isPolygon = !hasOverlay && area.points != null && area.points.length >= 3;

            const pts = isPolygon ? area.points! : rectToPoints(area);

            return (
              <g key={area.id}>
                {/* Shape: overlay image or polygon */}
                {hasOverlay ? (
                  <>
                    <image
                      href={area.overlay_image_url!}
                      x={area.x * vbW}
                      y={area.y * vbH}
                      width={area.w * vbW}
                      height={area.h * vbH}
                      preserveAspectRatio="none"
                      style={{ cursor: 'move', pointerEvents: 'all' }}
                      onClick={(e) => handleHitboxClick(e, area)}
                      onMouseDown={(e) => handleBodyMouseDown(e, area.id)}
                    />
                    <rect
                      x={area.x * vbW}
                      y={area.y * vbH}
                      width={area.w * vbW}
                      height={area.h * vbH}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={2}
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
                ) : (
                  <polygon
                    points={pts.map(([px, py]) => `${px * vbW},${py * vbH}`).join(' ')}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2}
                    style={{ cursor: 'move', pointerEvents: 'all' }}
                    onClick={(e) => handleHitboxClick(e, area)}
                    onMouseDown={(e) => handleBodyMouseDown(e, area.id)}
                  />
                )}
                {/* Label */}
                {area.label && (
                  <text
                    x={pts.reduce((s, p) => s + p[0], 0) / pts.length * vbW}
                    y={pts.reduce((s, p) => s + p[1], 0) / pts.length * vbH}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                    fontSize="14"
                    style={{ pointerEvents: 'none', textShadow: '0 0 3px rgba(0,0,0,0.8)' }}
                  >
                    {area.label}
                  </text>
                )}
                {/* Vertex handles (only for selected) */}
                {isSelected &&
                  pts.map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt[0] * vbW}
                      cy={pt[1] * vbH}
                      r={6}
                      fill={AREA_BORDER_COLORS[area.area_type]}
                      stroke="#fff"
                      strokeWidth={2}
                      style={{ cursor: 'grab', pointerEvents: 'all' }}
                      onMouseDown={(e) => handleHandleMouseDown(e, area.id, i)}
                    />
                  ))}
              </g>
            );
          })}
          {/* Draw preview */}
          {preview && (
            <rect
              x={preview.x * vbW}
              y={preview.y * vbH}
              width={preview.w * vbW}
              height={preview.h * vbH}
              fill="rgba(255,255,255,0.15)"
              stroke="#fff"
              strokeWidth={2}
              strokeDasharray="8 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
      </div>

      {/* Section navigation (panorama only) */}
      {isPanorama && (
        <div className={styles.sectionNav}>
          <button
            className={styles.sectionNavBtn}
            onClick={() => setCurrentSection((s) => Math.max(1, s - 1))}
            disabled={currentSection <= 1}
          >
            ◀
          </button>
          <span className={styles.sectionLabel}>섹션 {currentSection} / 8</span>
          <button
            className={styles.sectionNavBtn}
            onClick={() => setCurrentSection((s) => Math.min(8, s + 1))}
            disabled={currentSection >= 8}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
