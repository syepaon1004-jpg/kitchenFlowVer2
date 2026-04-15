import { useCallback, useRef } from 'react';
import type { LocalEquipment, PanelEquipmentType } from './types';
import { EQUIPMENT_COLORS, EQUIPMENT_LABELS } from './types';
import { getEquipmentPositionStyle, normalizeOversizedY } from '../../../lib/equipment-position';
import styles from '../KitchenLayoutEditor.module.css';

const SNAP_THRESHOLD_PX = 10;
const MIN_SIZE = 0.05;

interface Props {
  equipment: LocalEquipment[];
  panelIndex: number;
  selectedEquipmentId: string | null;
  onEquipmentChange: (id: string, updates: Partial<LocalEquipment>) => void;
  onSelectEquipment: (id: string | null) => void;
  onDeleteEquipment: (id: string) => void;
  onDuplicateEquipment: (id: string) => void;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** 장비 외형 렌더링 (편집 모드용 간략 표현) */
function renderEquipmentVisual(type: PanelEquipmentType) {
  const color = EQUIPMENT_COLORS[type];
  const base: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: 2,
  };

  switch (type) {
    case 'drawer':
      return (
        <>
          <div style={{ ...base, background: color }} />
          <div className={styles.eqHandleBar} style={{ bottom: 4 }} />
        </>
      );
    case 'fold_fridge':
      return (
        <>
          <div style={{ ...base, background: color }} />
          {/* 세로 적층 내부 패널 표시 */}
          <div style={{ position: 'absolute', bottom: 0, left: '5%', width: '90%', height: '45%', border: '1px dashed #fff', opacity: 0.4, boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', bottom: '50%', left: '5%', width: '90%', height: '45%', border: '1px dashed #fff', opacity: 0.4, boxSizing: 'border-box' }} />
          <div className={styles.eqHandleBar} style={{ top: 4 }} />
        </>
      );
    case 'four_box_fridge':
      return (
        <>
          <div style={{ ...base, background: color }} />
          {/* 세로 4단 구획 */}
          <div style={{ position: 'absolute', left: '5%', bottom: 0, width: '90%', height: '23%', border: '1px dashed #fff', opacity: 0.4, boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', left: '5%', bottom: '25%', width: '90%', height: '23%', border: '1px dashed #fff', opacity: 0.4, boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', left: '5%', bottom: '50%', width: '90%', height: '23%', border: '1px dashed #fff', opacity: 0.4, boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', left: '5%', bottom: '75%', width: '90%', height: '23%', border: '1px dashed #fff', opacity: 0.4, boxSizing: 'border-box' }} />
          {/* 상/하 핸들바 (2 doors) */}
          <div className={styles.eqHandleBar} style={{ top: '25%', transform: 'translateY(-50%)' }} />
          <div className={styles.eqHandleBar} style={{ top: '75%', transform: 'translateY(-50%)' }} />
        </>
      );
    case 'basket':
      return <div style={{ ...base, border: '2px solid #888', background: 'rgba(200,200,200,0.1)' }} />;
    case 'burner':
      return <div style={{ ...base, background: color, borderRadius: 4 }} />;
    case 'sink':
      return <div style={{ ...base, background: color, borderRadius: 3 }} />;
    case 'worktop':
      return <div style={{ ...base, background: color }} />;
    case 'filler_panel':
      return <div style={{ ...base, background: color }} />;
    case 'shelf':
      return (
        <div style={{ ...base, display: 'flex' }}>
          <div className={styles.shelfLeft} />
          <div className={styles.shelfMiddle} />
          <div className={styles.shelfRight} />
        </div>
      );
    default:
      return <div style={{ ...base, background: '#ddd' }} />;
  }
}

/** 스냅 계산: 특정 값을 targets에 근접하면 스냅 */
function snapValue(val: number, targets: number[], thresholdRatio: number): number {
  for (const t of targets) {
    if (Math.abs(val - t) <= thresholdRatio) return t;
  }
  return val;
}

const EquipmentOnPanel = ({
  equipment,
  panelIndex,
  selectedEquipmentId,
  onEquipmentChange,
  onSelectEquipment,
  onDeleteEquipment,
  onDuplicateEquipment,
}: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const getPanelRect = useCallback(() => {
    return panelRef.current?.getBoundingClientRect() ?? null;
  }, []);

  /** 같은 패널 내 다른 장비의 4변 비율값 수집 (스냅 대상) */
  const getSnapTargets = useCallback(
    (excludeId: string) => {
      const targets: { x: number[]; y: number[] } = { x: [0, 1], y: [0, 1] };
      for (const eq of equipment) {
        if (eq.id === excludeId) continue;
        targets.x.push(eq.x, eq.x + eq.width);
        targets.y.push(eq.y, eq.y + eq.height);
      }
      return targets;
    },
    [equipment],
  );

  /** 스냅 threshold를 패널 크기 기준 비율로 변환 */
  const getSnapThreshold = useCallback(() => {
    const rect = getPanelRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: SNAP_THRESHOLD_PX / rect.width,
      y: SNAP_THRESHOLD_PX / rect.height,
    };
  }, [getPanelRect]);

  const handleMoveStart = useCallback(
    (eq: LocalEquipment) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onSelectEquipment(eq.id);

      const rect = getPanelRect();
      if (!rect) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startEqX = eq.x;
      const startEqY = eq.y;
      const snapTargets = getSnapTargets(eq.id);
      const threshold = getSnapThreshold();

      const onMove = (me: MouseEvent) => {
        const dx = (me.clientX - startX) / rect.width;
        const dy = (me.clientY - startY) / rect.height;

        let newX = startEqX + dx;
        let newY = startEqY + dy;

        // 스냅: 좌변, 우변
        newX = snapValue(newX, snapTargets.x, threshold.x);
        const snappedRight = snapValue(newX + eq.width, snapTargets.x, threshold.x);
        if (snappedRight !== newX + eq.width) newX = snappedRight - eq.width;

        // 스냅: 상변, 하변
        newY = snapValue(newY, snapTargets.y, threshold.y);
        const snappedBottom = snapValue(newY + eq.height, snapTargets.y, threshold.y);
        if (snappedBottom !== newY + eq.height) newY = snappedBottom - eq.height;

        // 클램프 0~1 범위
        newX = Math.max(0, Math.min(1 - eq.width, newX));
        newY = eq.height > 1 ? 0 : Math.max(0, Math.min(1 - eq.height, newY));

        onEquipmentChange(eq.id, { x: newX, y: newY });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [getPanelRect, getSnapTargets, getSnapThreshold, onEquipmentChange, onSelectEquipment],
  );

  const handleResizeStart = useCallback(
    (eq: LocalEquipment, corner: Corner) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const rect = getPanelRect();
      if (!rect) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startEq = { x: eq.x, y: eq.y, width: eq.width, height: eq.height };
      const snapTargets = getSnapTargets(eq.id);
      const threshold = getSnapThreshold();

      const onMove = (me: MouseEvent) => {
        const dx = (me.clientX - startX) / rect.width;
        const dy = (me.clientY - startY) / rect.height;

        let { x, y, width, height } = startEq;

        if (corner === 'se' || corner === 'ne') {
          width = Math.max(MIN_SIZE, startEq.width + dx);
          const right = snapValue(x + width, snapTargets.x, threshold.x);
          width = right - x;
        }
        if (corner === 'sw' || corner === 'nw') {
          const newX = startEq.x + dx;
          const snappedX = snapValue(newX, snapTargets.x, threshold.x);
          width = startEq.width + (startEq.x - snappedX);
          x = snappedX;
        }
        if (corner === 'se' || corner === 'sw') {
          height = Math.max(MIN_SIZE, startEq.height + dy);
          const bottom = snapValue(y + height, snapTargets.y, threshold.y);
          height = bottom - y;
        }
        if (corner === 'ne' || corner === 'nw') {
          const newY = startEq.y + dy;
          const snappedY = snapValue(newY, snapTargets.y, threshold.y);
          height = startEq.height + (startEq.y - snappedY);
          y = snappedY;
        }

        // 최소 크기
        if (width < MIN_SIZE) width = MIN_SIZE;
        if (height < MIN_SIZE) height = MIN_SIZE;

        // 클램프
        x = Math.max(0, Math.min(1 - width, x));
        y = normalizeOversizedY(Math.max(0, Math.min(1 - height, y)), height);

        onEquipmentChange(eq.id, { x, y, width, height });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [getPanelRect, getSnapTargets, getSnapThreshold, onEquipmentChange],
  );

  const panelEquipment = equipment.filter((eq) => eq.panelIndex === panelIndex);

  return (
    <div ref={panelRef} className={styles.equipmentLayer}>
      {panelEquipment.map((eq) => {
        const isSelected = eq.id === selectedEquipmentId;
        return (
          <div
            key={eq.id}
            className={`${styles.equipmentItem} ${isSelected ? styles.equipmentSelected : ''}`}
            style={{
              left: `${eq.x * 100}%`,
              ...getEquipmentPositionStyle(eq.y, eq.height),
              width: `${eq.width * 100}%`,
            }}
            onMouseDown={handleMoveStart(eq)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectEquipment(eq.id);
            }}
          >
            {renderEquipmentVisual(eq.equipmentType)}
            <span className={styles.eqTypeLabel}>{EQUIPMENT_LABELS[eq.equipmentType]}</span>

            {isSelected && (
              <>
                {/* 리사이즈 핸들 4개 */}
                {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
                  <div
                    key={corner}
                    className={`${styles.resizeCorner} ${styles[`resize_${corner}`]}`}
                    onMouseDown={handleResizeStart(eq, corner)}
                  />
                ))}
                {/* 액션 버튼 */}
                <div className={styles.eqActions}>
                  <button
                    className={styles.eqActionBtn}
                    onClick={(e) => { e.stopPropagation(); onDuplicateEquipment(eq.id); }}
                    title="복제"
                  >
                    ⧉
                  </button>
                  <button
                    className={`${styles.eqActionBtn} ${styles.eqActionBtnDanger}`}
                    onClick={(e) => { e.stopPropagation(); onDeleteEquipment(eq.id); }}
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EquipmentOnPanel;
