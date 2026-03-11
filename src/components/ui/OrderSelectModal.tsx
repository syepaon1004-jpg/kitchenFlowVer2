import { useMemo } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useGameStore } from '../../stores/gameStore';
import styles from './OrderSelectModal.module.css';

interface Props {
  getRecipeName: (recipeId: string) => string;
}

export default function OrderSelectModal({ getRecipeName }: Props) {
  const isOpen = useUiStore((s) => s.orderSelectModalOpen);
  const containerInstanceId = useUiStore((s) => s.orderSelectContainerInstanceId);
  const closeModal = useUiStore((s) => s.closeOrderSelectModal);
  const assignOrder = useGameStore((s) => s.assignOrderToContainer);
  const orders = useGameStore((s) => s.orders);

  // pending + in_progress 모두 표시 (1메뉴 2그릇 케이스 지원)
  const selectableOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending' || o.status === 'in_progress'),
    [orders],
  );

  if (!isOpen || !containerInstanceId) return null;

  const handleSelect = (orderId: string) => {
    assignOrder(containerInstanceId, orderId);
    closeModal();
  };

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>주문 선택</h3>
        <div className={styles.orderList}>
          {selectableOrders.length === 0 ? (
            <div className={styles.emptyMessage}>
              대기 중인 주문이 없습니다
            </div>
          ) : (
            selectableOrders.map((order) => (
              <button
                key={order.id}
                className={styles.orderButton}
                onClick={() => handleSelect(order.id)}
              >
                {getRecipeName(order.recipe_id)} #{order.order_sequence}
              </button>
            ))
          )}
        </div>
        <button className={styles.cancelButton} onClick={closeModal}>
          취소
        </button>
      </div>
    </div>
  );
}
