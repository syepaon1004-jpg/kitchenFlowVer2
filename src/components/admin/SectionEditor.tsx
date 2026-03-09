import { useCallback, useEffect, useRef, useState } from 'react';
import type { SectionConfig } from '../../types/db';
import { supabase } from '../../lib/supabase';
import { DEFAULT_SECTION_CONFIG } from '../../stores/uiStore';
import styles from './SectionEditor.module.css';

const MIN_GAP = 0.02;
const COUNT_MIN = 4;
const COUNT_MAX = 20;
const COUNT_STEP = 2;

interface SectionEditorProps {
  zoneId: string;
  initialConfig: SectionConfig | null;
  imageUrl: string | null;
  onSaved: (config: SectionConfig) => void;
}

function validateSectionConfig(boundaries: number[], walls: number[]): string | null {
  const n = boundaries.length - 1;
  if (n < COUNT_MIN || n > COUNT_MAX) {
    return `섹션 수는 ${COUNT_MIN}~${COUNT_MAX} 사이여야 합니다.`;
  }
  if (n % 2 !== 0) {
    return '섹션 수는 짝수여야 합니다.';
  }
  if (boundaries[0] !== 0 || boundaries[n] !== 1) {
    return '첫 경계는 0, 마지막 경계는 1이어야 합니다.';
  }
  for (let i = 1; i <= n; i++) {
    if (boundaries[i] <= boundaries[i - 1]) {
      return '경계선이 단조 증가 순서가 아닙니다.';
    }
  }
  for (const w of walls) {
    if (w < 1 || w > n) {
      return `벽 섹션 번호 ${w}이(가) 범위를 벗어납니다 (1~${n}).`;
    }
  }
  return null;
}

const SectionEditor = ({ zoneId, initialConfig, imageUrl, onSaved }: SectionEditorProps) => {
  const [boundaries, setBoundaries] = useState<number[]>([]);
  const [walls, setWalls] = useState<number[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragTooltip, setDragTooltip] = useState<{ index: number; ratio: number } | null>(null);

  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const boundariesRef = useRef(boundaries);

  // Keep boundariesRef in sync
  useEffect(() => {
    boundariesRef.current = boundaries;
  }, [boundaries]);

  // Sync state from zone/config change
  useEffect(() => {
    const config = initialConfig ?? DEFAULT_SECTION_CONFIG;
    setBoundaries([...config.boundaries]);
    setWalls([...config.walls]);
    setIsDirty(false);
    setError(null);
    setDragTooltip(null);
  }, [zoneId, initialConfig]);

  const sectionCount = boundaries.length - 1;
  const wallSet = new Set(walls);

  // ─── Section count change ───
  const handleCountChange = useCallback(
    (delta: -1 | 1) => {
      const currentCount = boundaries.length - 1;
      const newCount = currentCount + delta * COUNT_STEP;
      if (newCount < COUNT_MIN || newCount > COUNT_MAX) return;

      const confirmed = window.confirm(
        `섹션 수를 ${currentCount}개에서 ${newCount}개로 변경하면\n` +
        `경계선과 벽 설정이 초기화됩니다. 계속하시겠습니까?`,
      );
      if (!confirmed) return;

      const newBoundaries = Array.from(
        { length: newCount + 1 },
        (_, i) => Math.round((i / newCount) * 1000) / 1000,
      );
      const newWalls = [newCount / 2, newCount];

      setBoundaries(newBoundaries);
      setWalls(newWalls);
      setIsDirty(true);
    },
    [boundaries],
  );

  // ─── Boundary marker drag (document-level) ───
  const handleBoundaryMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;

      const bar = barRef.current;
      if (!bar) return;

      const onMove = (me: MouseEvent) => {
        const barRect = bar.getBoundingClientRect();
        const barWidth = barRect.width;
        if (barWidth === 0) return;

        const rawRatio = (me.clientX - barRect.left) / barWidth;
        const currentBounds = boundariesRef.current;
        const lo = currentBounds[index - 1] + MIN_GAP;
        const hi = currentBounds[index + 1] - MIN_GAP;
        const clamped = Math.min(hi, Math.max(lo, rawRatio));

        setBoundaries((prev) => {
          const next = [...prev];
          next[index] = Math.round(clamped * 1000) / 1000;
          return next;
        });
        setDragTooltip({ index, ratio: Math.round(clamped * 1000) / 1000 });
      };

      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setDragTooltip(null);
        setIsDirty(true);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [],
  );

  // ─── Wall toggle ───
  const handleSectionClick = useCallback(
    (sectionIndex: number) => {
      if (draggingRef.current) return;
      setWalls((prev) => {
        const set = new Set(prev);
        if (set.has(sectionIndex)) {
          set.delete(sectionIndex);
        } else {
          set.add(sectionIndex);
        }
        return Array.from(set).sort((a, b) => a - b);
      });
      setIsDirty(true);
    },
    [],
  );

  // ─── Save ───
  const handleSave = useCallback(async () => {
    const validationError = validateSectionConfig(boundaries, walls);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    const config: SectionConfig = { boundaries, walls };
    const { error: dbError } = await supabase
      .from('kitchen_zones')
      .update({ section_config: config })
      .eq('id', zoneId);

    if (dbError) {
      setError(`저장 실패: ${dbError.message}`);
      setSaving(false);
      return;
    }

    onSaved(config);
    setIsDirty(false);
    setSaving(false);
  }, [boundaries, walls, zoneId, onSaved]);

  if (sectionCount < 1) return null;

  return (
    <div className={styles.sectionEditorRoot}>
      {/* Header: label + count control + save */}
      <div className={styles.header}>
        <span className={styles.headerLabel}>섹션 설정</span>
        <div className={styles.countControl}>
          <button
            className={styles.countBtn}
            onClick={() => handleCountChange(-1)}
            disabled={sectionCount <= COUNT_MIN}
          >
            −
          </button>
          <span className={styles.countLabel}>{sectionCount}</span>
          <button
            className={styles.countBtn}
            onClick={() => handleCountChange(1)}
            disabled={sectionCount >= COUNT_MAX}
          >
            +
          </button>
        </div>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* Panorama preview */}
      {imageUrl && (
        <div className={styles.previewWrapper}>
          <img src={imageUrl} alt="" className={styles.previewImage} />
          <div className={styles.previewOverlay}>
            {Array.from({ length: sectionCount }, (_, i) => {
              const idx = i + 1;
              const isWall = wallSet.has(idx);
              const left = boundaries[i] * 100;
              const width = (boundaries[i + 1] - boundaries[i]) * 100;
              return (
                <div
                  key={`preview-sec-${idx}`}
                  className={`${styles.previewSection} ${isWall ? styles.previewSectionWall : ''}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <span className={styles.previewSectionLabel}>{idx}</span>
                </div>
              );
            })}
            {boundaries.map((b, i) => {
              if (i === 0 || i === sectionCount) return null;
              return (
                <div
                  key={`preview-line-${i}`}
                  className={styles.previewBoundaryLine}
                  style={{ left: `${b * 100}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Section bar */}
      <div className={styles.barWrapper}>
        <div ref={barRef} className={styles.sectionBar}>
          {/* Section cells */}
          {Array.from({ length: sectionCount }, (_, i) => {
            const idx = i + 1; // 1-indexed
            const isWall = wallSet.has(idx);
            const left = boundaries[i] * 100;
            const width = (boundaries[i + 1] - boundaries[i]) * 100;
            return (
              <div
                key={`sec-${idx}`}
                className={`${styles.sectionCell} ${isWall ? styles.sectionCellWall : styles.sectionCellNormal}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => handleSectionClick(idx)}
              >
                <span className={styles.sectionLabel}>
                  {idx}{isWall ? ' (벽)' : ''}
                </span>
              </div>
            );
          })}

          {/* Boundary markers (internal only: 1..N-1) */}
          {boundaries.map((b, i) => {
            if (i === 0 || i === sectionCount) return null;
            return (
              <div
                key={`marker-${i}`}
                className={styles.boundaryMarkerHitArea}
                style={{ left: `${b * 100}%` }}
                onMouseDown={(e) => handleBoundaryMouseDown(e, i)}
              >
                <div className={styles.boundaryMarkerLine} />
                <div className={styles.boundaryMarkerHandle} />
              </div>
            );
          })}

          {/* Drag tooltip */}
          {dragTooltip && (
            <div
              className={styles.tooltip}
              style={{ left: `${dragTooltip.ratio * 100}%` }}
            >
              {dragTooltip.ratio.toFixed(3)}
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};

export default SectionEditor;
