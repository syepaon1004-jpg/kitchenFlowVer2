import { useMemo, useState, useRef, useCallback } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import type { GameEquipmentState } from '../../types/db';
import styles from './WokComponent.module.css';

interface Props {
  equipmentState: GameEquipmentState;
  atSink?: boolean;
  skipDroppable?: boolean;
  skipDraggable?: boolean;
  overlayImageUrl?: string | null;
}

const WASH_DURATION = 3000; // 3초
const WASH_INTERVAL = 50; // 50ms 간격 업데이트
const STIR_DURATION = 30000; // 30초
const STIR_INTERVAL = 100; // 100ms 간격 업데이트

export default function WokComponent({ equipmentState, atSink = false, skipDroppable = false, skipDraggable = false, overlayImageUrl }: Props) {
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const isWashing = useEquipmentStore((s) => s.washing_equipment_ids.has(equipmentState.id));
  const isStirring = useEquipmentStore((s) => s.stirring_equipment_ids.has(equipmentState.id));
  const addStirring = useEquipmentStore((s) => s.addStirring);
  const removeStirring = useEquipmentStore((s) => s.removeStirring);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const waterIngredientIds = useGameStore((s) => s.waterIngredientIds);

  // 세척 진행률 (로컬 state)
  const [washProgress, setWashProgress] = useState(0);
  const washTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 볶기 진행률 (로컬 state)
  const [stirProgress, setStirProgress] = useState(0);
  const stirTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wokIngredients = useMemo(
    () =>
      ingredientInstances.filter(
        (i) => i.equipment_state_id === equipmentState.id && i.location_type === 'equipment',
      ),
    [ingredientInstances, equipmentState.id],
  );

  const hasWaterInWok = useMemo(
    () => wokIngredients.some((i) => waterIngredientIds.has(i.ingredient_id)),
    [wokIngredients, waterIngredientIds],
  );

  // 드롭 타겟: 씽크에 있으면 비활성화
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `equipment-wok-${equipmentState.id}`,
    data: { equipmentStateId: equipmentState.id, equipmentType: 'wok' },
    disabled:
      skipDroppable ||
      atSink ||
      equipmentState.wok_status === 'dirty' ||
      equipmentState.wok_status === 'burned' ||
      isWashing,
  });

  // 드래그 소스
  const { setNodeRef: dragRef, listeners, attributes } = useDraggable({
    id: `wok-drag-${equipmentState.id}`,
    data: {
      type: 'equipment' as const,
      equipmentType: 'wok',
      equipmentStateId: equipmentState.id,
      dragImageUrl: overlayImageUrl ?? undefined,
    },
    disabled: isWashing || skipDraggable,
  });

  const handleBurnerChange = (level: 0 | 1 | 2 | 3) => {
    updateEquipment(equipmentState.id, { burner_level: level });
  };

  // 세척 홀드 시작
  const startWash = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (equipmentState.wok_status === 'clean') return;

      let elapsed = 0;
      washTimerRef.current = setInterval(() => {
        elapsed += WASH_INTERVAL;
        setWashProgress(elapsed);
        if (elapsed >= WASH_DURATION) {
          // 세척 완료
          if (washTimerRef.current) clearInterval(washTimerRef.current);
          washTimerRef.current = null;
          setWashProgress(0);
          updateEquipment(equipmentState.id, {
            wok_status: 'clean',
            wok_temp: 25,
            burner_level: 0,
          });
        }
      }, WASH_INTERVAL);
    },
    [equipmentState.id, equipmentState.wok_status, updateEquipment],
  );

  // 세척 홀드 중단
  const stopWash = useCallback(() => {
    if (washTimerRef.current) {
      clearInterval(washTimerRef.current);
      washTimerRef.current = null;
    }
    setWashProgress(0);
  }, []);

  // 볶기 홀드 시작
  const startStir = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!equipmentState.burner_level || equipmentState.wok_status !== 'clean') return;

      addStirring(equipmentState.id);
      let elapsed = 0;
      stirTimerRef.current = setInterval(() => {
        elapsed += STIR_INTERVAL;
        setStirProgress(elapsed);
        if (elapsed >= STIR_DURATION) {
          if (stirTimerRef.current) clearInterval(stirTimerRef.current);
          stirTimerRef.current = null;
          setStirProgress(0);
          removeStirring(equipmentState.id);
        }
      }, STIR_INTERVAL);
    },
    [equipmentState.id, equipmentState.burner_level, equipmentState.wok_status, addStirring, removeStirring],
  );

  // 볶기 홀드 중단
  const stopStir = useCallback(() => {
    if (stirTimerRef.current) {
      clearInterval(stirTimerRef.current);
      stirTimerRef.current = null;
    }
    setStirProgress(0);
    removeStirring(equipmentState.id);
  }, [equipmentState.id, removeStirring]);

  const statusColor =
    equipmentState.wok_status === 'burned'
      ? 'var(--color-error)'
      : equipmentState.wok_status === 'overheating'
        ? 'var(--color-warning)'
        : equipmentState.wok_status === 'dirty'
          ? 'var(--color-dirty)'
          : 'var(--color-success)';

  const needsWash = atSink && equipmentState.wok_status !== 'clean';
  const washPercent = (washProgress / WASH_DURATION) * 100;

  return (
    <div
      ref={(node) => {
        if (!skipDroppable) dropRef(node);
        if (!skipDraggable) dragRef(node);
      }}
      {...(!skipDraggable ? { ...listeners, ...attributes } : {})}
      className={styles.container}
      style={{
        background: isOver ? 'rgba(76,175,80,0.15)' : 'var(--equip-bg)',
        border: `2px solid ${atSink ? 'var(--color-sink)' : statusColor}`,
      }}
    >
      <div className={styles.titleRow}>
        <span>Wok{atSink ? ' (싱크)' : ''}</span>
        <span style={{ color: statusColor }}>
          {equipmentState.wok_status}
        </span>
      </div>

      {!atSink && (
        <>
          <div>{equipmentState.wok_temp ?? 0}°C</div>

          <div className={styles.burnerRow}>
            {([0, 1, 2, 3] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={(e) => {
                  e.stopPropagation();
                  handleBurnerChange(lvl);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={styles.burnerBtn}
                style={{
                  fontWeight: equipmentState.burner_level === lvl ? 'bold' : 'normal',
                  background: equipmentState.burner_level === lvl ? 'var(--color-fire)' : '#555',
                  color: equipmentState.burner_level === lvl ? '#fff' : 'var(--equip-text)',
                }}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onPointerDown={startStir}
            onPointerUp={stopStir}
            onPointerLeave={stopStir}
            disabled={!equipmentState.burner_level || equipmentState.wok_status !== 'clean' || hasWaterInWok}
            className={styles.actionBtn}
            style={{
              background: isStirring ? 'var(--color-fire-active)' : (!equipmentState.burner_level || equipmentState.wok_status !== 'clean' || hasWaterInWok) ? '#555' : 'var(--color-warning)',
              color: isStirring || (equipmentState.burner_level && equipmentState.wok_status === 'clean' && !hasWaterInWok) ? '#fff' : 'var(--equip-text)',
              cursor: (!equipmentState.burner_level || equipmentState.wok_status !== 'clean' || hasWaterInWok) ? 'not-allowed' : 'pointer',
            }}
          >
            <div
              className={styles.progressBar}
              style={{
                width: `${(stirProgress / STIR_DURATION) * 100}%`,
                transition: `width ${STIR_INTERVAL}ms linear`,
              }}
            />
            <span className={styles.progressLabel}>
              {isStirring ? `볶는 중 ${Math.round(stirProgress / 1000)}초 / ${STIR_DURATION / 1000}초` : '볶기 (꾹 누르기)'}
            </span>
          </button>

          {wokIngredients.length > 0 && (
            <div className={styles.ingredientCount}>
              재료: {wokIngredients.length}개
            </div>
          )}

          {hasWaterInWok && equipmentState.wok_temp === 100 && (
            <div className={styles.boilingStatus}>
              끓는 중
            </div>
          )}
        </>
      )}

      {needsWash && (
        <div className={styles.washSection}>
          <button
            onPointerDown={startWash}
            onPointerUp={stopWash}
            onPointerLeave={stopWash}
            className={styles.actionBtn}
            style={{
              background: washProgress > 0 ? 'var(--color-sink)' : 'var(--color-sink)',
              cursor: 'pointer',
            }}
          >
            <div
              className={styles.progressBar}
              style={{
                width: `${washPercent}%`,
                transition: `width ${WASH_INTERVAL}ms linear`,
              }}
            />
            <span className={styles.progressLabel}>
              {washProgress > 0 ? `세척중 ${Math.round(washPercent)}%` : '세척 (꾹 누르기)'}
            </span>
          </button>
        </div>
      )}

      {atSink && equipmentState.wok_status === 'clean' && (
        <div className={styles.cleanStatus}>
          세척 완료 — 원래 자리로 드래그
        </div>
      )}
    </div>
  );
}
