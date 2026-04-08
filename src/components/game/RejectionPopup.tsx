import { useUiStore } from '../../stores/uiStore';
import type { StoreIngredient } from '../../types/db';
import styles from './RejectionPopup.module.css';

interface Props {
  storeIngredientsMap: Map<string, StoreIngredient>;
}

const ERROR_LABEL: Record<string, string> = {
  unexpected_ingredient: '레시피에 없음',
  plate_order_mismatch: '잘못된 단계',
  quantity_error: '수량 오류',
  action_insufficient: '조리 부족',
  action_excessive: '조리 초과',
  wrong_container: '잘못된 그릇',
};

const REASON_TEXT: Record<string, string> = {
  wrong_container: '이 그릇에는 이 재료를 담을 수 없습니다',
  unexpected_ingredient: '이 레시피에 없는 재료입니다',
  plate_order_mismatch: '지금 단계에 추가할 수 없는 재료입니다',
};

export default function RejectionPopup({ storeIngredientsMap }: Props) {
  const isOpen = useUiStore((s) => s.rejectionPopupOpen);
  const info = useUiStore((s) => s.rejectionInfo);
  const close = useUiStore((s) => s.closeRejectionPopup);

  if (!isOpen || !info) return null;

  const getName = (id: string) => storeIngredientsMap.get(id)?.display_name ?? '재료';
  const getUnit = (id: string) => storeIngredientsMap.get(id)?.unit ?? '';

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{info.recipeName}</h2>
          <p className={styles.reason}>{REASON_TEXT[info.blockReason]}</p>
        </header>

        <section className={styles.body}>
          <div className={styles.columns}>
            <div className={styles.column}>
              <p className={styles.sectionLabel}>시도한 재료</p>
              <ul className={styles.itemList}>
                {info.attemptingItems.map((item, idx) => {
                  const errors = info.errorsByIngredientId.get(item.ingredientId) ?? [];
                  const badges = errors.map((e) => ERROR_LABEL[e.type] ?? e.type);
                  const hasBlocking = errors.some(
                    (e) => e.type === 'unexpected_ingredient' || e.type === 'plate_order_mismatch',
                  );
                  const cls = hasBlocking
                    ? styles.itemRejected
                    : errors.length > 0
                    ? styles.itemError
                    : styles.itemNormal;
                  return (
                    <li key={`${item.ingredientId}-${idx}`} className={cls}>
                      <span className={styles.itemName}>{getName(item.ingredientId)}</span>
                      {item.quantity > 0 && (
                        <span className={styles.itemQty}>
                          {' '}
                          {item.quantity}
                          {getUnit(item.ingredientId)}
                        </span>
                      )}
                      {badges.length > 0 && (
                        <span className={styles.itemBadge}>{badges.join(', ')}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={styles.column}>
              <p className={styles.sectionLabel}>올바른 레시피</p>
              <ul className={styles.recipeList}>
                {(() => {
                  // plate_order별 그룹화 (sorted)
                  const groups = new Map<number, typeof info.correctRecipe>();
                  for (const ri of info.correctRecipe) {
                    const arr = groups.get(ri.plate_order) ?? [];
                    arr.push(ri);
                    groups.set(ri.plate_order, arr);
                  }
                  return Array.from(groups.entries()).map(([plateOrder, items]) => (
                    <li key={plateOrder} className={styles.recipeGroup}>
                      <span className={styles.recipeStep}>{plateOrder}단계</span>
                      <ul className={styles.recipeGroupList}>
                        {items.map((ri) => (
                          <li key={ri.id} className={ri.is_deco ? styles.recipeDeco : undefined}>
                            {getName(ri.ingredient_id)} {ri.quantity}
                            {getUnit(ri.ingredient_id)}
                            {ri.required_actions && ri.required_actions.length > 0 && (
                              <span className={styles.recipeActions}>
                                {' × '}
                                {ri.required_actions.map((a) => a.action_type).join(', ')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ));
                })()}
              </ul>
            </div>
          </div>

          {info.missingForThisAction.length > 0 && (
            <div className={styles.callout}>
              <p className={styles.calloutLabel}>⚠ 이번 단계에 함께 들어가야 하는데 빠진 재료</p>
              <ul className={styles.calloutList}>
                {info.missingForThisAction.map((ri) => (
                  <li key={ri.id}>
                    {getName(ri.ingredient_id)} {ri.quantity}
                    {getUnit(ri.ingredient_id)}
                    {ri.required_actions && ri.required_actions.length > 0 && (
                      <span className={styles.calloutActions}>
                        {' × '}
                        {ri.required_actions.map((a) => a.action_type).join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <button type="button" className={styles.closeButton} onClick={close} autoFocus>
          닫기
        </button>
      </div>
    </div>
  );
}
