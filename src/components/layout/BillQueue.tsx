import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  getRecipeNaturalText?: (recipeId: string) => string | null;
}

export default function BillQueue({ getRecipeName, getRecipeNaturalText }: Props) {
  const orders = useGameStore((s) => s.orders);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'completed'),
    [orders],
  );

  const [now, setNow] = useState(() => Date.now());
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (activeOrders.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeOrders.length]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!openOrderId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`.${styles.dropdown}`) || target.closest(`.${styles.orderChip}`)) return;
      setOpenOrderId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openOrderId]);

  const handleChipClick = (e: React.MouseEvent<HTMLDivElement>, orderId: string) => {
    if (openOrderId === orderId) {
      setOpenOrderId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setOpenOrderId(orderId);
  };

  const openOrder = openOrderId ? activeOrders.find((o) => o.id === openOrderId) : null;

  return (
    <>
      <div className={styles.billQueue}>
        {activeOrders.length === 0 ? (
          <span className={styles.empty}>주문 없음</span>
        ) : (
          activeOrders.slice(0, 5).map((order) => (
            <div
              key={order.id}
              className={`${styles.orderChip} ${order.status === 'in_progress' ? styles.inProgress : ''}`}
              onClick={(e) => handleChipClick(e, order.id)}
            >
              {getRecipeName(order.recipe_id)} #{order.order_sequence}
              <span className={styles.elapsed}>{formatElapsed(order.created_at, now)}</span>
            </div>
          ))
        )}
      </div>
      {openOrderId && dropdownPos && openOrder && createPortal(
        <div
          className={styles.dropdown}
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {getRecipeNaturalText?.(openOrder.recipe_id) || '레시피 정보 없음'}
        </div>,
        document.body,
      )}
    </>
  );
}
