import { useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import styles from './QuantityInputModal.module.css';

export default function QuantityInputModal() {
  const isOpen = useUiStore((s) => s.quantityModalOpen);
  const unit = useUiStore((s) => s.quantityModalUnit);
  const defaultQty = useUiStore((s) => s.quantityModalDefaultQty);
  const callback = useUiStore((s) => s.quantityModalCallback);
  const closeModal = useUiStore((s) => s.closeQuantityModal);

  const [value, setValue] = useState('');

  if (!isOpen || !callback) return null;

  const handleConfirm = () => {
    const qty = value === '' ? defaultQty : Number(value);
    if (!qty || qty <= 0) return;
    callback(qty);
    setValue('');
    closeModal();
  };

  const handleCancel = () => {
    setValue('');
    closeModal();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>투입량 입력</h3>
        <div className={styles.inputRow}>
          <input
            type="text"
            inputMode="decimal"
            className={styles.quantityInput}
            value={value}
            placeholder={String(defaultQty)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d*$/.test(v)) setValue(v);
            }}
            onKeyDown={handleKeyDown}
            ref={(el) => {
              if (el) {
                setTimeout(() => el.focus(), 200);
              }
            }}
          />
          <span className={styles.unitLabel}>{unit}</span>
        </div>
        <button className={styles.confirmButton} onClick={handleConfirm}>
          확인
        </button>
        <button className={styles.cancelButton} onClick={handleCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
