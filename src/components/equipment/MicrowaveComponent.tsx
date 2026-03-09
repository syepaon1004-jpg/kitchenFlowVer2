import { useState, useMemo } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import type { GameEquipmentState, GameIngredientInstance } from '../../types/db';
import type { DragMeta } from '../../types/game';

interface MwChipProps {
  inst: GameIngredientInstance;
  isRunning: boolean;
  ingredientName: string;
  ingredientUnit: string;
  dragImageUrl: string | null;
}

function MwIngredientChip({ inst, isRunning, ingredientName, ingredientUnit, dragImageUrl }: MwChipProps) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `mw-ingredient-${inst.id}`,
    data: {
      type: 'ingredient',
      ingredientId: inst.ingredient_id,
      ingredientInstanceId: inst.id,
      dragImageUrl,
    } satisfies DragMeta,
    disabled: isRunning,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        fontSize: 10,
        padding: '1px 4px',
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 3,
        cursor: isRunning ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {ingredientName} ({inst.quantity}{ingredientUnit})
    </div>
  );
}

interface Props {
  equipmentState: GameEquipmentState;
  skipDroppable?: boolean;
}

export default function MicrowaveComponent({ equipmentState, skipDroppable = false }: Props) {
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

  const { setNodeRef, isOver } = useDroppable({
    id: `equipment-mw-${equipmentState.id}`,
    data: { equipmentStateId: equipmentState.id, equipmentType: 'microwave' },
    disabled: skipDroppable || isRunning,
  });

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

  const statusColor = isRunning ? '#ff9800' : isDone ? '#4caf50' : '#9e9e9e';

  return (
    <div
      ref={skipDroppable ? undefined : setNodeRef}
      style={{
        width: '100%',
        height: '100%',
        background: isOver ? 'rgba(76,175,80,0.2)' : 'rgba(0,0,0,0.6)',
        border: `2px solid ${statusColor}`,
        borderRadius: 6,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: 11,
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
        <span>MW</span>
        <span style={{ color: statusColor }}>{equipmentState.mw_status}</span>
      </div>

      {isRunning ? (
        <div style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}>
          {equipmentState.mw_remaining_sec}s
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 2 }}>
          <input
            type="number"
            value={inputSec}
            onChange={(e) => setInputSec(Number(e.target.value))}
            min={1}
            style={{
              flex: 1,
              width: '100%',
              fontSize: 10,
              padding: '1px 3px',
              background: '#333',
              color: '#fff',
              border: '1px solid #666',
              borderRadius: 3,
            }}
          />
          <button
            onClick={handleStart}
            disabled={mwIngredients.length === 0}
            style={{
              fontSize: 10,
              padding: '1px 4px',
              background: mwIngredients.length > 0 ? '#ff9800' : '#555',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
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
          style={{
            fontSize: 10,
            padding: '1px 0',
            background: '#4caf50',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          리셋
        </button>
      )}

      {mwIngredients.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mwIngredients.map((inst) => {
            const si = storeIngredientsMap.get(inst.ingredient_id);
            return (
              <MwIngredientChip
                key={inst.id}
                inst={inst}
                isRunning={isRunning}
                ingredientName={si?.display_name ?? '재료'}
                ingredientUnit={si?.unit ?? ''}
                dragImageUrl={si?.image_url ?? null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
