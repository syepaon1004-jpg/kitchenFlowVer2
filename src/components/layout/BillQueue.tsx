import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import styles from './BillQueue.module.css';

function formatElapsed(createdAt: string, now: number): string {
  const diff = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  getRecipeName: (recipeId: string) => string;
}

export default function BillQueue({ getRecipeName }: Props) {
  const orders = useGameStore((s) => s.orders);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'completed'),
    [orders],
  );

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (activeOrders.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeOrders.length]);

  return (
    <div className={styles.billQueue}>
      {activeOrders.length === 0 ? (
        <span className={styles.empty}>주문 없음</span>
      ) : (
        activeOrders.slice(0, 5).map((order) => (
          <div
            key={order.id}
            className={`${styles.orderChip} ${order.status === 'in_progress' ? styles.inProgress : ''}`}
          >
            {getRecipeName(order.recipe_id)} #{order.order_sequence}
            <span className={styles.elapsed}>{formatElapsed(order.created_at, now)}</span>
          </div>
        ))
      )}
    </div>
  );
}
