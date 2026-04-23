import { useEffect, useState } from 'react';
import { useUiStore, type ActionToast } from '../../stores/uiStore';
import styles from './ActionToastStack.module.css';

const DISPLAY_MS = 2400;
const EXIT_MS = 240;

interface ToastItemProps {
  toast: ActionToast;
  onDone: (id: string) => void;
}

function ToastItem({ toast, onDone }: ToastItemProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setLeaving(true), DISPLAY_MS);
    const doneTimer = window.setTimeout(() => onDone(toast.id), DISPLAY_MS + EXIT_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [toast.id, onDone]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.severity]}`}
      data-state={leaving ? 'leaving' : 'entered'}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  );
}

export default function ActionToastStack() {
  const toasts = useUiStore((s) => s.actionToasts);
  const dismissActionToast = useUiStore((s) => s.dismissActionToast);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.stack}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDone={dismissActionToast} />
      ))}
    </div>
  );
}
