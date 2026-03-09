import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AreaDefinition,
  AreaType,
  EquipmentType,
  KitchenZone,
  StoreIngredient,
  Container,
} from '../../types/db';
import { supabase } from '../../lib/supabase';
import { uploadToStorage } from '../../lib/storage';
import styles from './HitboxEditorPanel.module.css';

interface Props {
  area: AreaDefinition | null;
  zones: KitchenZone[];
  ingredients: StoreIngredient[];
  containers: Container[];
  areas: AreaDefinition[];
  onAreasChange: (areas: AreaDefinition[]) => void;
  onSaved: (saved: AreaDefinition) => void;
  onDeleted: (id: string) => void;
}

const AREA_TYPES: { value: AreaType; label: string }[] = [
  { value: 'ingredient', label: '재료 (ingredient)' },
  { value: 'container', label: '용기 (container)' },
  { value: 'navigate', label: '시점이동 (navigate)' },
  { value: 'equipment', label: '장비 (equipment)' },
  { value: 'basket', label: '바구니 (basket)' },
];

const EQUIPMENT_TYPES: { value: EquipmentType; label: string }[] = [
  { value: 'wok', label: '웍 (wok)' },
  { value: 'frying_basket', label: '튀김채 (frying_basket)' },
  { value: 'microwave', label: '전자레인지 (microwave)' },
  { value: 'sink', label: '싱크 (sink)' },
];

/** Clear FK fields that don't belong to the given area_type */
function clearUnrelatedFields(draft: AreaDefinition, areaType: AreaType): AreaDefinition {
  const cleared = { ...draft, area_type: areaType };

  if (areaType !== 'ingredient') {
    cleared.ingredient_id = null;
    cleared.drag_image_url = null;
  }
  if (areaType !== 'container') {
    cleared.container_id = null;
  }
  if (areaType !== 'navigate') {
    cleared.navigate_zone_id = null;
  }
  if (areaType !== 'equipment') {
    cleared.equipment_type = null;
    cleared.equipment_index = null;
  }
  // basket은 부모 역할이므로 자신의 parent_area_id를 null로
  if (areaType === 'basket') {
    cleared.ingredient_id = null;
    cleared.drag_image_url = null;
    cleared.container_id = null;
    cleared.navigate_zone_id = null;
    cleared.equipment_type = null;
    cleared.equipment_index = null;
    cleared.parent_area_id = null;
  }

  return cleared;
}

function validate(draft: AreaDefinition): string | null {
  if (!draft.label.trim()) return 'label을 입력하세요.';

  switch (draft.area_type) {
    case 'ingredient':
      if (!draft.ingredient_id) return 'ingredient를 선택하세요.';
      break;
    case 'container':
      if (!draft.container_id) return 'container를 선택하세요.';
      break;
    case 'navigate':
      if (!draft.navigate_zone_id) return 'navigate zone을 선택하세요.';
      break;
    case 'equipment':
      if (!draft.equipment_type) return 'equipment type을 선택하세요.';
      if (!draft.equipment_index || draft.equipment_index < 1)
        return 'equipment index를 입력하세요 (1 이상).';
      break;
  }

  return null;
}

export default function HitboxEditorPanel({
  area,
  zones,
  ingredients,
  containers,
  areas,
  onAreasChange,
  onSaved,
  onDeleted,
}: Props) {
  const [draft, setDraft] = useState<AreaDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ingredient search dropdown state
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [showIngredientDropdown, setShowIngredientDropdown] = useState(false);
  const ingredientDropdownRef = useRef<HTMLDivElement>(null);

  // Sync draft when selected area changes
  useEffect(() => {
    if (area) {
      setDraft({ ...area });
      // Sync ingredient search text with selected ingredient
      const selected = ingredients.find((ing) => ing.id === area.ingredient_id);
      setIngredientSearch(selected ? `${selected.display_name} (${selected.unit})` : '');
    } else {
      setDraft(null);
      setIngredientSearch('');
    }
    setShowIngredientDropdown(false);
    setError(null);
  }, [area, ingredients]);

  // Close ingredient dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        ingredientDropdownRef.current &&
        !ingredientDropdownRef.current.contains(e.target as Node)
      ) {
        setShowIngredientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateDraft = useCallback(
    (updates: Partial<AreaDefinition>) => {
      setDraft((prev) => (prev ? { ...prev, ...updates } : null));
      setError(null);
    },
    [],
  );

  const handleAreaTypeChange = useCallback(
    (newType: AreaType) => {
      setDraft((prev) => {
        if (!prev) return null;
        // Clear FK fields that don't belong to the new area_type
        return clearUnrelatedFields(prev, newType);
      });
      setError(null);
    },
    [],
  );

  const handleOverlayUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);
      try {
        const url = await uploadToStorage(file, 'overlays');
        updateDraft({ overlay_image_url: url });
      } catch (err) {
        setError(err instanceof Error ? err.message : '업로드 실패');
      } finally {
        setUploading(false);
        // reset file input so re-selecting same file triggers change
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [updateDraft],
  );

  const handleOverlayRemove = useCallback(() => {
    updateDraft({ overlay_image_url: null });
  }, [updateDraft]);

  const handleChildSortOrder = useCallback(
    async (childId: string, newSortOrder: number) => {
      // Update in DB
      const { error: dbError } = await supabase
        .from('area_definitions')
        .update({ sort_order: newSortOrder })
        .eq('id', childId);

      if (dbError) {
        setError(`sort_order 수정 실패: ${dbError.message}`);
        return;
      }

      // Update local areas array
      onAreasChange(
        areas.map((a) => (a.id === childId ? { ...a, sort_order: newSortOrder } : a)),
      );
    },
    [areas, onAreasChange],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;

    const validationError = validate(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    // If points exist, compute bounding box for x/y/w/h
    let finalDraft = draft;
    if (draft.points && draft.points.length >= 3) {
      const xs = draft.points.map((p) => p[0]);
      const ys = draft.points.map((p) => p[1]);
      finalDraft = {
        ...draft,
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    }

    // Build payload — strip temp id
    const { id, ...payload } = finalDraft;
    const isNew = id.startsWith('temp-');

    if (isNew) {
      const { data, error: dbError } = await supabase
        .from('area_definitions')
        .insert(payload)
        .select()
        .single();

      if (dbError) {
        setError(`저장 실패: ${dbError.message}`);
        setSaving(false);
        return;
      }
      onSaved(data as AreaDefinition);
    } else {
      const { data, error: dbError } = await supabase
        .from('area_definitions')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (dbError) {
        setError(`수정 실패: ${dbError.message}`);
        setSaving(false);
        return;
      }
      onSaved(data as AreaDefinition);
    }

    setSaving(false);
  }, [draft, onSaved]);

  const handleDelete = useCallback(async () => {
    if (!draft) return;

    if (draft.id.startsWith('temp-')) {
      onDeleted(draft.id);
      return;
    }

    const { error: dbError } = await supabase
      .from('area_definitions')
      .delete()
      .eq('id', draft.id);

    if (dbError) {
      setError(`삭제 실패: ${dbError.message}`);
      return;
    }

    onDeleted(draft.id);
  }, [draft, onDeleted]);

  if (!draft) {
    return <div className={styles.emptyMsg}>히트박스를 선택하거나 새로 그리세요</div>;
  }

  return (
    <div className={styles.panel}>
      <h3>{draft.id.startsWith('temp-') ? '새 히트박스' : '히트박스 편집'}</h3>

      <div className={styles.coordInfo}>
        x: {draft.x.toFixed(3)} &nbsp; y: {draft.y.toFixed(3)} &nbsp;
        w: {draft.w.toFixed(3)} &nbsp; h: {draft.h.toFixed(3)}
        {draft.points && <span> &nbsp; (polygon: {draft.points.length}pts)</span>}
      </div>

      {/* Label */}
      <div className={styles.field}>
        <label>Label</label>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => updateDraft({ label: e.target.value })}
          placeholder="히트박스 이름"
        />
      </div>

      {/* Area Type */}
      <div className={styles.field}>
        <label>Area Type</label>
        <select
          value={draft.area_type}
          onChange={(e) => handleAreaTypeChange(e.target.value as AreaType)}
        >
          {AREA_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Overlay Image (모든 area_type 공통) */}
      <div className={styles.field}>
        <label>오버레이 이미지</label>
        {draft.overlay_image_url ? (
          <div className={styles.overlayPreview}>
            <img src={draft.overlay_image_url} alt="overlay preview" />
            <button
              type="button"
              className={styles.overlayRemoveBtn}
              onClick={handleOverlayRemove}
            >
              삭제
            </button>
          </div>
        ) : (
          <div className={styles.overlayUpload}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleOverlayUpload}
              disabled={uploading}
            />
            {uploading && <span className={styles.uploadingText}>업로드 중...</span>}
          </div>
        )}
      </div>

      {/* Conditional fields based on area_type */}
      {draft.area_type === 'ingredient' && (
        <>
          <div className={styles.field} ref={ingredientDropdownRef}>
            <label>재료 (ingredient)</label>
            <div className={styles.searchDropdown}>
              <input
                type="text"
                value={ingredientSearch}
                onChange={(e) => {
                  setIngredientSearch(e.target.value);
                  setShowIngredientDropdown(true);
                  if (!e.target.value) {
                    updateDraft({ ingredient_id: null });
                  }
                }}
                onFocus={() => setShowIngredientDropdown(true)}
                placeholder="재료 검색..."
              />
              {showIngredientDropdown && (
                <ul className={styles.searchDropdownList}>
                  {ingredients
                    .filter((ing) =>
                      ing.display_name
                        .toLowerCase()
                        .includes(ingredientSearch.toLowerCase().trim()),
                    )
                    .map((ing) => (
                      <li
                        key={ing.id}
                        className={`${styles.searchDropdownItem}${
                          draft.ingredient_id === ing.id
                            ? ` ${styles.searchDropdownItemSelected}`
                            : ''
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          updateDraft({ ingredient_id: ing.id });
                          setIngredientSearch(`${ing.display_name} (${ing.unit})`);
                          setShowIngredientDropdown(false);
                        }}
                      >
                        {ing.display_name} ({ing.unit})
                      </li>
                    ))}
                  {ingredients.filter((ing) =>
                    ing.display_name
                      .toLowerCase()
                      .includes(ingredientSearch.toLowerCase().trim()),
                  ).length === 0 && (
                    <li className={styles.searchDropdownEmpty}>
                      일치하는 재료 없음
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
          <div className={styles.field}>
            <label>드래그 이미지 URL (선택)</label>
            <input
              type="text"
              value={draft.drag_image_url ?? ''}
              onChange={(e) => updateDraft({ drag_image_url: e.target.value || null })}
              placeholder="https://..."
            />
          </div>
        </>
      )}

      {draft.area_type === 'container' && (
        <div className={styles.field}>
          <label>용기 (container)</label>
          <select
            value={draft.container_id ?? ''}
            onChange={(e) => updateDraft({ container_id: e.target.value || null })}
          >
            <option value="">-- 선택 --</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.container_type})
              </option>
            ))}
          </select>
        </div>
      )}

      {draft.area_type === 'navigate' && (
        <div className={styles.field}>
          <label>이동할 Zone</label>
          <select
            value={draft.navigate_zone_id ?? ''}
            onChange={(e) => updateDraft({ navigate_zone_id: e.target.value || null })}
          >
            <option value="">-- 선택 --</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label} ({z.zone_key})
              </option>
            ))}
          </select>
        </div>
      )}

      {draft.area_type === 'equipment' && (
        <>
          <div className={styles.field}>
            <label>장비 종류</label>
            <select
              value={draft.equipment_type ?? ''}
              onChange={(e) =>
                updateDraft({ equipment_type: (e.target.value || null) as EquipmentType | null })
              }
            >
              <option value="">-- 선택 --</option>
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>장비 인덱스 (1부터)</label>
            <input
              type="number"
              min={1}
              value={draft.equipment_index ?? ''}
              onChange={(e) =>
                updateDraft({
                  equipment_index: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
            />
          </div>
        </>
      )}

      {/* basket: 자식 목록 */}
      {draft.area_type === 'basket' && (
        <div className={styles.field}>
          <label>자식 히트박스</label>
          {draft.id.startsWith('temp-') ? (
            <div className={styles.childEmptyMsg}>저장 후 자식을 연결할 수 있습니다</div>
          ) : (() => {
            const children = areas
              .filter((a) => a.parent_area_id === draft.id)
              .sort((a, b) => a.sort_order - b.sort_order);
            return children.length === 0 ? (
              <div className={styles.childEmptyMsg}>연결된 자식이 없습니다</div>
            ) : (
              <div className={styles.childList}>
                {children.map((child) => (
                  <div key={child.id} className={styles.childItem}>
                    <span className={styles.childLabel}>{child.label || '(이름 없음)'}</span>
                    <input
                      type="number"
                      min={0}
                      className={styles.childSortInput}
                      value={child.sort_order}
                      onChange={(e) =>
                        handleChildSortOrder(child.id, parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* 일반 히트박스: parent_area_id + sort_order */}
      {draft.area_type !== 'basket' && (
        <>
          <div className={styles.field}>
            <label>소속 바구니 (parent)</label>
            <select
              value={draft.parent_area_id ?? ''}
              onChange={(e) => updateDraft({ parent_area_id: e.target.value || null })}
            >
              <option value="">없음</option>
              {areas
                .filter((a) => a.area_type === 'basket' && !a.id.startsWith('temp-'))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label || '(이름 없음)'}
                  </option>
                ))}
            </select>
          </div>
          {draft.parent_area_id && (
            <div className={styles.field}>
              <label>정렬 순서 (sort_order)</label>
              <input
                type="number"
                min={0}
                value={draft.sort_order}
                onChange={(e) =>
                  updateDraft({ sort_order: parseInt(e.target.value, 10) || 0 })
                }
              />
            </div>
          )}
        </>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
        <button className={styles.deleteBtn} onClick={handleDelete}>
          삭제
        </button>
      </div>
    </div>
  );
}
