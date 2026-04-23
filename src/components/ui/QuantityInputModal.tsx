import { useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import styles from './QuantityInputModal.module.css';

export default function QuantityInputModal() {
  const isOpen = useUiStore((s) => s.quantityModalOpen);
  const unit = useUiStore((s) => s.quantityModalUnit);
  const presets = useUiStore((s) => s.quantityModalPresets);
  const callback = useUiStore((s) => s.quantityModalCallback);
  const mode = useUiStore((s) => s.quantityModalMode);
  const defaultQty = useUiStore((s) => s.quantityModalDefaultQty);
  const maxQty = useUiStore((s) => s.quantityModalMaxQty);
  const closeModal = useUiStore((s) => s.closeQuantityModal);

  const [inputValue, setInputValue] = useState('');

  if (!isOpen || !callback) return null;

  const handleClose = () => {
    setInputValue('');
    closeModal();
  };

  const handlePreset = (qty: number) => {
    callback(qty);
    handleClose();
  };

  const handleConfirmDirect = () => {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    callback(parsed);
    handleClose();
  };

  const handleUseDefault = () => {
    if (defaultQty == null) return;
    callback(defaultQty);
    handleClose();
  };

  const parsed = Number(inputValue);
  const directConfirmDisabled = inputValue.trim() === '' || !Number.isFinite(parsed) || parsed <= 0;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>투입량 선택</h3>

        {mode === 'preset' && (
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
        )}

        {mode === 'direct' && (
          <div className={styles.directBlock}>
            <div className={styles.directInputRow}>
              <input
                type="number"
                step="any"
                min={0}
                max={maxQty ?? undefined}
                placeholder={defaultQty != null ? String(defaultQty) : ''}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !directConfirmDisabled) handleConfirmDirect();
                }}
                autoFocus
                className={styles.directInput}
              />
              <span className={styles.directUnit}>{unit}</span>
            </div>
            <button
              className={styles.presetButton}
              onClick={handleConfirmDirect}
              disabled={directConfirmDisabled}
            >
              확인
            </button>
            {defaultQty != null && (
              <button className={styles.defaultButton} onClick={handleUseDefault}>
                기본값({defaultQty}{unit}) 사용
              </button>
            )}
          </div>
        )}

        <button className={styles.cancelButton} onClick={handleClose}>
          취소
        </button>
      </div>
    </div>
  );
}
