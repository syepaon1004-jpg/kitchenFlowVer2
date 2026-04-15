import { useMemo, useState, useRef, useCallback } from 'react';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import type { GameEquipmentState } from '../../types/db';
import styles from './WokComponent.module.css';

interface Props {
  equipmentState: GameEquipmentState;
  atSink?: boolean;
}

const STIR_DURATION = 30000; // 30초
const STIR_INTERVAL = 100; // 100ms 간격 업데이트

export default function WokComponent({ equipmentState, atSink = false }: Props) {
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const isStirring = useEquipmentStore((s) => s.stirring_equipment_ids.has(equipmentState.id));
  const addStirring = useEquipmentStore((s) => s.addStirring);
  const removeStirring = useEquipmentStore((s) => s.removeStirring);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const waterIngredientIds = useGameStore((s) => s.waterIngredientIds);

  // 세척은 scene-level hold로 이동 (GameKitchenView) → 로컬 wash state 제거

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

  const handleBurnerChange = (level: 0 | 1 | 2 | 3) => {
    updateEquipment(equipmentState.id, { burner_level: level });
  };


  // 볶��� 홀드 시���
  const startStir = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!equipmentState.burner_level || (equipmentState.wok_status !== 'clean' && equipmentState.wok_status !== 'overheating')) return;

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

  const canStir = !!equipmentState.burner_level && (equipmentState.wok_status === 'clean' || equipmentState.wok_status === 'overheating') && !hasWaterInWok;

  return (
    <div
      className={styles.container}
      style={{
        background: 'var(--equip-bg)',
        border: `2px solid ${atSink ? 'var(--color-sink)' : statusColor}`,
        ...(atSink ? { pointerEvents: 'none' as const } : {}),
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
            disabled={!canStir}
            className={styles.actionBtn}
            style={{
              background: isStirring ? 'var(--color-fire-active)' : canStir ? 'var(--color-warning)' : '#555',
              color: isStirring || canStir ? '#fff' : 'var(--equip-text)',
              cursor: canStir ? 'pointer' : 'not-allowed',
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

      {atSink && equipmentState.wok_status === 'clean' && (
        <div className={styles.cleanStatus}>
          세척 완료
        </div>
      )}
    </div>
  );
}
