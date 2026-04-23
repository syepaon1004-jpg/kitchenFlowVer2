import type { StoreIngredient } from '../../types/db';
import type { ContainerGuideData } from '../../types/game';
import styles from './RecipeStepList.module.css';

const STATUS_LABEL = {
  done: '완료',
  in_progress: '진행 중',
  pending: '대기',
} as const;

const ERROR_LABEL: Record<string, string> = {
  quantity_error: '수량',
  action_insufficient: '조리 부족',
  action_excessive: '조리 과다',
  plate_order_mismatch: '단계 오류',
  unexpected_ingredient: '제외 대상',
};

interface Props {
  data: ContainerGuideData;
  storeIngredientsMap: Map<string, StoreIngredient>;
  /** 단계별 상태 뱃지/색상 적용 여부. 기본 true. 레시피 개요(실투입 미반영) 뷰에서는 false로 전달. */
  showStatusBadge?: boolean;
}

export default function RecipeStepList({ data, storeIngredientsMap, showStatusBadge = true }: Props) {
  const getName = (id: string) => storeIngredientsMap.get(id)?.display_name ?? '재료';
  const getUnit = (id: string) => storeIngredientsMap.get(id)?.unit ?? '';

  return (
    <section className={styles.stepSection}>
      <div className={styles.sectionLabel}>단계별 진행</div>
      <ul className={styles.stepList}>
        {data.steps.map((step) => {
          const isDecoStep = step.ingredients.every((ing) => ing.isDeco);
          const stepCls = showStatusBadge ? styles[`step_${step.status}`] : styles.step_plain;
          return (
            <li key={step.plateOrder} className={`${styles.step} ${stepCls}`}>
              <div className={styles.stepHeader}>
                {showStatusBadge && (
                  <span className={styles.stepBadge}>{STATUS_LABEL[step.status]}</span>
                )}
                <span className={styles.stepTitle}>
                  {isDecoStep ? '데코' : `${step.plateOrder}단계`}
                </span>
              </div>
              <ul className={styles.ingList}>
                {step.ingredients.map((ing) => {
                  const name = getName(ing.ingredientId);
                  const unit = getUnit(ing.ingredientId);
                  const hasQty = ing.currentQuantity !== null;
                  const qtyMatch =
                    hasQty && Math.abs((ing.currentQuantity ?? 0) - ing.requiredQuantity) < 0.001;
                  const badge = ing.errors
                    .map((e) => ERROR_LABEL[e.type] ?? e.type)
                    .filter(Boolean)
                    .join(', ');
                  const rowCls = !hasQty
                    ? styles.ingMissing
                    : qtyMatch && ing.errors.length === 0
                    ? styles.ingOk
                    : styles.ingError;
                  return (
                    <li key={ing.ingredientId} className={rowCls}>
                      <span className={styles.ingName}>{name}</span>
                      <span className={styles.ingQty}>
                        {hasQty ? `${ing.currentQuantity}${unit}` : '미투입'} / {ing.requiredQuantity}
                        {unit}
                      </span>
                      {badge && <span className={styles.ingBadge}>{badge}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
