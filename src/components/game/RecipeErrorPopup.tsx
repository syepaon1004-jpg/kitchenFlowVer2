import type { GameRecipeError, StoreIngredient } from '../../types/db';
import styles from './RecipeErrorPopup.module.css';

interface RecipeErrorPopupProps {
  errors: GameRecipeError[];
  storeIngredientsMap: Map<string, StoreIngredient>;
  onDispose: () => void;
  onClose: () => void;
}

const ERROR_LABELS: Record<string, string> = {
  missing_ingredient: '누락',
  unexpected_ingredient: '불필요한 재료',
  quantity_error: '수량 오류',
  action_insufficient: '조리 시간 부족',
  action_excessive: '조리 시간 초과',
  plate_order_mismatch: '투입 순서 오류',
  wrong_container: '잘못된 그릇',
};

export default function RecipeErrorPopup({
  errors,
  storeIngredientsMap,
  onDispose,
  onClose,
}: RecipeErrorPopupProps) {
  const getIngredientName = (ingredientId: string | undefined): string => {
    if (!ingredientId) return '';
    return storeIngredientsMap.get(ingredientId)?.display_name ?? '알 수 없는 재료';
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>잘못 조리됨</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <ul className={styles.errorList}>
          {errors.map((error) => {
            const ingredientId = error.details.ingredient_id as string | undefined;
            const name = getIngredientName(ingredientId);
            const label = ERROR_LABELS[error.error_type] ?? error.error_type;

            return (
              <li key={error.id} className={styles.errorItem}>
                {error.error_type === 'wrong_container'
                  ? label
                  : `${name} — ${label}`}
              </li>
            );
          })}
        </ul>

        <button className={styles.disposeBtn} onClick={onDispose}>
          버리기
        </button>
      </div>
    </div>
  );
}
