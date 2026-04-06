import { useUiStore } from '../../stores/uiStore';
import styles from './QuantityInputModal.module.css';

export default function QuantityInputModal() {
  const isOpen = useUiStore((s) => s.quantityModalOpen);
  const unit = useUiStore((s) => s.quantityModalUnit);
  const presets = useUiStore((s) => s.quantityModalPresets);
  const callback = useUiStore((s) => s.quantityModalCallback);
  const closeModal = useUiStore((s) => s.closeQuantityModal);

  if (!isOpen || !callback) return null;

  const handlePreset = (qty: number) => {
    callback(qty);
    closeModal();
  };

  const handleCancel = () => {
    closeModal();
  };

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>투입량 선택</h3>
        <div className={styles.presetRow}>
          {presets.map((preset) => (
            <button
              key={preset}
              className={styles.presetButton}
              onClick={() => handlePreset(preset)}
            >
              {preset}{unit}
            </button>
          ))}
        </div>
        <button className={styles.cancelButton} onClick={handleCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
