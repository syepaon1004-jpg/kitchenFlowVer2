import { useCallback, useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useSelectionStore } from '../../stores/selectionStore';
import type { GameIngredientInstance, StoreIngredient } from '../../types/db';
import type { SelectionState } from '../../types/game';
import styles from './Handbar.module.css';

interface HandbarProps {
  onIngredientToHandbar?: (selection: SelectionState) => void;
  onCollapseBaskets?: () => void;
}

function HandIngredientChip({
  inst,
  storeIngredientsMap,
  onCollapseBaskets,
}: {
  inst: GameIngredientInstance;
  storeIngredientsMap: Map<string, StoreIngredient>;
  onCollapseBaskets?: () => void;
}) {
  const selection = useSelectionStore((s) => s.selection);
  const select = useSelectionStore((s) => s.select);
  const deselect = useSelectionStore((s) => s.deselect);

  const isSelected = selection?.type === 'ingredient'
    && selection?.instanceId === inst.id;

  const si = storeIngredientsMap.get(inst.ingredient_id);
  const displayName = si?.display_name ?? '재료';
  const unit = si?.unit ?? '';

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCollapseBaskets?.();
    if (isSelected) {
      deselect();
    } else {
      select({
        type: 'ingredient',
        ingredientId: inst.ingredient_id,
        instanceId: inst.id,
        sourceLabel: `${displayName} ${inst.quantity}${unit}`,
      });
    }
  }, [isSelected, select, deselect, onCollapseBaskets, inst.ingredient_id, inst.id, inst.quantity, displayName, unit]);

  const chipClass = `${styles.ingredientChip}${isSelected ? ` ${styles.chipSelected}` : ''}`;

  return (
    <div
      className={chipClass}
      style={{
        cursor: 'pointer',
        touchAction: 'none',
      }}
      onClick={handleClick}
    >
      {displayName} {inst.quantity}{unit}
    </div>
  );
}

export default function Handbar({ onIngredientToHandbar, onCollapseBaskets }: HandbarProps) {
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const storeIngredientsMap = useGameStore((s) => s.storeIngredientsMap);

  const handIngredients = useMemo(
    () => ingredientInstances.filter((i) => i.location_type === 'hand'),
    [ingredientInstances],
  );

  const handleHandbarClick = useCallback(() => {
    onCollapseBaskets?.();
    const sel = useSelectionStore.getState().selection;

    // 무한 소스 재료 선택 상태 → 핸드바에 추가
    if (sel?.type === 'ingredient' && sel.ingredientId && !sel.instanceId) {
      onIngredientToHandbar?.(sel);
      return;
    }
    // 그 외 클릭은 무시 (칩 클릭은 stopPropagation으로 여기 도달하지 않음)
  }, [onCollapseBaskets, onIngredientToHandbar]);

  return (
    <div
      className={styles.handbar}
      onClick={handleHandbarClick}
    >
      {handIngredients.length === 0 ? (
        <span>핸드바 (비어있음)</span>
      ) : (
        handIngredients.map((inst) => (
          <HandIngredientChip key={inst.id} inst={inst} storeIngredientsMap={storeIngredientsMap} onCollapseBaskets={onCollapseBaskets} />
        ))
      )}
    </div>
  );
}
