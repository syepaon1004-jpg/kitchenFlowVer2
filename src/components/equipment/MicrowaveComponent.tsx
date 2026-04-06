import { useState, useMemo } from 'react';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import type { GameEquipmentState, GameIngredientInstance } from '../../types/db';
import styles from './MicrowaveComponent.module.css';

interface MwChipProps {
  inst: GameIngredientInstance;
  isRunning: boolean;
  ingredientName: string;
  ingredientUnit: string;
}

function MwIngredientChip({ inst, isRunning, ingredientName, ingredientUnit }: MwChipProps) {
  return (
    <div
      className={styles.ingredientChip}
      style={{
        cursor: isRunning ? 'not-allowed' : 'default',
      }}
    >
      {ingredientName} ({inst.quantity}{ingredientUnit})
    </div>
  );
}

interface Props {
  equipmentState: GameEquipmentState;
}

export default function MicrowaveComponent({ equipmentState }: Props) {
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const storeIngredientsMap = useGameStore((s) => s.storeIngredientsMap);
  const [inputSec, setInputSec] = useState(30);

  const mwIngredients = useMemo(
    () =>
      ingredientInstances.filter(
        (i) => i.equipment_state_id === equipmentState.id && i.location_type === 'equipment',
      ),
    [ingredientInstances, equipmentState.id],
  );

  const isRunning = equipmentState.mw_status === 'running';
  const isDone = equipmentState.mw_status === 'done';

  const handleStart = () => {
    if (!isRunning && inputSec > 0) {
      updateEquipment(equipmentState.id, {
        mw_status: 'running',
        mw_remaining_sec: inputSec,
      });
    }
  };

  const handleReset = () => {
    updateEquipment(equipmentState.id, {
      mw_status: 'idle',
      mw_remaining_sec: 0,
    });
  };

  const statusColor = isRunning ? 'var(--color-warning)' : isDone ? 'var(--color-success)' : '#9e9e9e';

  return (
    <div
      className={styles.container}
      style={{
        background: 'var(--equip-bg)',
        border: `2px solid ${statusColor}`,
      }}
    >
      <div className={styles.titleRow}>
        <span>MW</span>
        <span style={{ color: statusColor }}>{equipmentState.mw_status}</span>
      </div>

      {isRunning ? (
        <div className={styles.timerDisplay}>
          {equipmentState.mw_remaining_sec}s
        </div>
      ) : (
        <div className={styles.inputRow}>
          <input
            type="number"
            value={inputSec}
            onChange={(e) => setInputSec(Number(e.target.value))}
            min={1}
            className={styles.timeInput}
          />
          <button
            onClick={handleStart}
            disabled={mwIngredients.length === 0}
            className={styles.startBtn}
            style={{
              background: mwIngredients.length > 0 ? 'var(--color-warning)' : '#555',
              color: mwIngredients.length > 0 ? '#fff' : 'var(--equip-text)',
              cursor: mwIngredients.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            시작
          </button>
        </div>
      )}

      {isDone && (
        <button
          onClick={handleReset}
          className={styles.resetBtn}
        >
          리셋
        </button>
      )}

      {mwIngredients.length > 0 && (
        <div className={styles.ingredientList}>
          {mwIngredients.map((inst) => {
            const si = storeIngredientsMap.get(inst.ingredient_id);
            return (
              <MwIngredientChip
                key={inst.id}
                inst={inst}
                isRunning={isRunning}
                ingredientName={si?.display_name ?? '재료'}
                ingredientUnit={si?.unit ?? ''}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
