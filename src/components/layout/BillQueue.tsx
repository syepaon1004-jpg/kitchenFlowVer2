import { useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import styles from './BillQueue.module.css';

interface Props {
  getRecipeName: (recipeId: string) => string;
}

export default function BillQueue({ getRecipeName }: Props) {
  const orders = useGameStore((s) => s.orders);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'completed'),
    [orders],
  );

  return (
    <div className={styles.billQueue}>
      {activeOrders.length === 0 ? (
        <span className={styles.empty}>주문 없음</span>
      ) : (
        activeOrders.map((order) => (
          <div
            key={order.id}
            className={`${styles.orderChip} ${order.status === 'in_progress' ? styles.inProgress : ''}`}
          >
            {getRecipeName(order.recipe_id)} #{order.order_sequence}
          </div>
        ))
      )}
    </div>
  );
}
