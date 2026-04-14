import type { PanelEquipmentType, LocalItem, PanelItemType } from './types';
import type { StoreIngredient, Container } from '../../../types/db';
import { EQUIPMENT_LABELS, EQUIPMENT_COLORS } from './types';
import styles from '../KitchenLayoutEditor.module.css';

const EQUIPMENT_TYPES: PanelEquipmentType[] = [
  'drawer', 'fold_fridge', 'four_box_fridge', 'basket', 'burner', 'sink', 'worktop', 'shelf',
];

interface Props {
  onAddEquipment: (type: PanelEquipmentType) => void;
  onAddItem: (type: PanelItemType) => void;
  selectedItem: LocalItem | null;
  ingredients: StoreIngredient[];
  containers: Container[];
  onItemChange: (id: string, updates: Partial<LocalItem>) => void;
}

const EquipmentPalette = ({
  onAddEquipment,
  onAddItem,
  selectedItem,
  ingredients,
  containers,
  onItemChange,
}: Props) => {
  return (
    <div className={styles.palette}>
      <h3 className={styles.paletteTitle}>장비</h3>
      {EQUIPMENT_TYPES.map((type) => (
        <button
          key={type}
          className={styles.paletteItem}
          onClick={() => onAddEquipment(type)}
        >
          <span
            className={styles.paletteIcon}
            style={{
              backgroundColor: EQUIPMENT_COLORS[type],
              border: type === 'basket' ? '2px solid #888' : 'none',
            }}
          />
          <span className={styles.paletteLabel}>{EQUIPMENT_LABELS[type]}</span>
        </button>
      ))}

      {/* 아이템 섹션 */}
      <div className={styles.paletteDivider} />
      <h3 className={styles.paletteTitle}>배치 아이템</h3>
      <button
        className={styles.paletteItem}
        onClick={() => onAddItem('ingredient')}
      >
        <span className={styles.paletteIcon} style={{ backgroundColor: '#E8F5E9' }} />
        <span className={styles.paletteLabel}>재료</span>
      </button>
      <button
        className={styles.paletteItem}
        onClick={() => onAddItem('container')}
      >
        <span className={styles.paletteIcon} style={{ backgroundColor: '#FFF3E0' }} />
        <span className={styles.paletteLabel}>그릇</span>
      </button>

      {/* FK 연결 UI */}
      {selectedItem && (
        <div className={styles.fkSection}>
          <h4 className={styles.fkTitle}>
            {selectedItem.itemType === 'ingredient' ? '재료 연결' : '그릇 연결'}
          </h4>
          {selectedItem.itemType === 'ingredient' ? (
            <select
              className={styles.fkSelect}
              value={selectedItem.ingredientId ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                onItemChange(selectedItem.id, { ingredientId: val });
              }}
            >
              <option value="">-- 선택 --</option>
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.display_name}
                </option>
              ))}
            </select>
          ) : (
            <select
              className={styles.fkSelect}
              value={selectedItem.containerId ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                onItemChange(selectedItem.id, { containerId: val });
              }}
            >
              <option value="">-- 선택 --</option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {(selectedItem.ingredientId || selectedItem.containerId) && (
            <button
              className={styles.fkUnlinkBtn}
              onClick={() => {
                if (selectedItem.itemType === 'ingredient') {
                  onItemChange(selectedItem.id, { ingredientId: null });
                } else {
                  onItemChange(selectedItem.id, { containerId: null });
                }
              }}
            >
              연결 해제
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EquipmentPalette;
