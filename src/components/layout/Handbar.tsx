import { useMemo } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useGameStore } from '../../stores/gameStore';
import type { GameIngredientInstance } from '../../types/db';
import type { DragMeta } from '../../types/game';
import styles from './Handbar.module.css';

function HandIngredientChip({ inst }: { inst: GameIngredientInstance }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `hand-ingredient-${inst.id}`,
    data: {
      type: 'ingredient',
      ingredientId: inst.ingredient_id,
      ingredientInstanceId: inst.id,
    } satisfies DragMeta,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={styles.ingredientChip}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
      }}
    >
      {inst.ingredient_id.slice(0, 8)}… (qty: {inst.quantity})
    </div>
  );
}

export default function Handbar() {
  const { setNodeRef, isOver } = useDroppable({ id: 'handbar' });
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const handIngredients = useMemo(
    () => ingredientInstances.filter((i) => i.location_type === 'hand'),
    [ingredientInstances],
  );

  return (
    <div
      ref={setNodeRef}
      className={styles.handbar}
      style={isOver ? { outline: '2px solid var(--color-success)', outlineOffset: '-2px' } : undefined}
    >
      {handIngredients.length === 0 ? (
        <span>재료를 여기에 드롭하세요</span>
      ) : (
        handIngredients.map((inst) => (
          <HandIngredientChip key={inst.id} inst={inst} />
        ))
      )}
    </div>
  );
}
