import { Fragment, useMemo, useRef, useState } from 'react';
import type { IngredientsMaster, StoreIngredient } from '../../types/db';
import { supabase } from '../../lib/supabase';
import { uploadToStorage } from '../../lib/storage';
import styles from './StoreIngredientsManager.module.css';

type UnitType = StoreIngredient['unit'];
const UNITS: UnitType[] = ['g', 'ml', 'ea', 'spoon', 'portion', 'pinch'];

const UNIT_LABELS: Record<string, string> = {
  g: 'g (그램)',
  ml: 'ml (밀리리터)',
  ea: 'ea (개)',
  spoon: 'spoon (스푼)',
  portion: 'portion (인분)',
  pinch: 'pinch (꼬집)',
};

type SortKey = 'display_name' | 'unit' | 'default_quantity';
type SortDir = 'asc' | 'desc';
type GroupKey = 'none' | 'unit' | 'state_label';
type SearchField = 'display_name' | 'state_label' | 'all';

interface Props {
  storeId: string;
  ingredients: StoreIngredient[];
  setIngredients: React.Dispatch<React.SetStateAction<StoreIngredient[]>>;
  masterList: IngredientsMaster[];
}

const StoreIngredientsManager = ({ storeId, ingredients, setIngredients, masterList }: Props) => {
  // ── Add form state ──
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [masterId, setMasterId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stateLabel, setStateLabel] = useState('');
  const [unit, setUnit] = useState<UnitType>('g');
  const [defaultQty, setDefaultQty] = useState(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Inline edit state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({
    display_name: '',
    state_label: '',
    unit: 'g' as UnitType,
    default_quantity: 1,
  });
  const [editError, setEditError] = useState<string | null>(null);

  // ── Error state for delete ──
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('display_name');
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Sort / Group state ──
  const [sortKey, setSortKey] = useState<SortKey>('display_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [groupBy, setGroupBy] = useState<GroupKey>('none');

  const isEditing = editingId !== null;

  // ── Sorted ingredients ──
  const sortedIngredients = useMemo(() => {
    return [...ingredients].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'display_name':
          cmp = a.display_name.localeCompare(b.display_name, 'ko');
          break;
        case 'unit':
          cmp = a.unit.localeCompare(b.unit);
          break;
        case 'default_quantity':
          cmp = a.default_quantity - b.default_quantity;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [ingredients, sortKey, sortDir]);

  // ── Filtered ingredients (search) ──
  const filteredIngredients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedIngredients;
    return sortedIngredients.filter((ing) => {
      const name = ing.display_name.toLowerCase();
      const state = (ing.state_label ?? '').toLowerCase();
      switch (searchField) {
        case 'display_name':
          return name.includes(q);
        case 'state_label':
          return state.includes(q);
        default:
          return name.includes(q) || state.includes(q);
      }
    });
  }, [sortedIngredients, searchQuery, searchField]);

  // ── Grouped ingredients ──
  const groupedIngredients = useMemo(() => {
    if (groupBy === 'none') {
      return [{ label: '', items: filteredIngredients }];
    }

    const map = new Map<string, StoreIngredient[]>();
    for (const ing of filteredIngredients) {
      const key = groupBy === 'unit' ? ing.unit : (ing.state_label ?? '(없음)');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ing);
    }

    return Array.from(map.entries()).map(([key, items]) => ({
      label: groupBy === 'unit' ? (UNIT_LABELS[key] ?? key) : key,
      items,
    }));
  }, [filteredIngredients, groupBy]);

  // ── Sort helpers ──
  const handleSortClick = (key: SortKey) => {
    if (isEditing) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  // ── Add form handlers ──
  const handleMasterChange = (id: string) => {
    setMasterId(id);
    const master = masterList.find((m) => m.id === id);
    if (master) setDisplayName(master.name);
  };

  const resetAddForm = () => {
    setMasterId('');
    setDisplayName('');
    setStateLabel('');
    setUnit('g');
    setDefaultQty(1);
    setImageFile(null);
    setAddError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAdd = async () => {
    if (!masterId || !displayName.trim()) return;
    setAdding(true);
    setAddError(null);

    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadToStorage(imageFile, 'ingredients');
      }

      const { data, error } = await supabase
        .from('store_ingredients')
        .insert({
          store_id: storeId,
          master_id: masterId,
          display_name: displayName.trim(),
          state_label: stateLabel.trim() || null,
          unit,
          default_quantity: defaultQty,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) {
        setAddError(error.message);
        return;
      }

      setIngredients((prev) => [...prev, data as StoreIngredient]);
      resetAddForm();
      setAddFormOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setAdding(false);
    }
  };

  // ── Inline edit handlers ──
  const startEdit = (ing: StoreIngredient) => {
    setEditingId(ing.id);
    setEditFields({
      display_name: ing.display_name,
      state_label: ing.state_label ?? '',
      unit: ing.unit,
      default_quantity: ing.default_quantity,
    });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editFields.display_name.trim()) return;
    setEditError(null);

    const { data, error } = await supabase
      .from('store_ingredients')
      .update({
        display_name: editFields.display_name.trim(),
        state_label: editFields.state_label.trim() || null,
        unit: editFields.unit,
        default_quantity: editFields.default_quantity,
      })
      .eq('id', editingId)
      .select()
      .single();

    if (error) {
      setEditError(error.message);
      return;
    }

    setIngredients((prev) =>
      prev.map((i) => (i.id === editingId ? (data as StoreIngredient) : i)),
    );
    setEditingId(null);
  };

  // ── Delete handler ──
  const handleDelete = async (ing: StoreIngredient) => {
    const confirmed = window.confirm(
      `'${ing.display_name}'을(를) 삭제하시겠습니까?\n이 재료를 사용하는 히트박스가 있으면 삭제할 수 없습니다.`,
    );
    if (!confirmed) return;

    setDeleteError(null);
    const { error } = await supabase.from('store_ingredients').delete().eq('id', ing.id);

    if (error) {
      if (error.code === '23503') {
        setDeleteError(`'${ing.display_name}' 삭제 실패: 이 재료를 사용하는 히트박스가 있습니다.`);
      } else {
        setDeleteError(error.message);
      }
      return;
    }

    setIngredients((prev) => prev.filter((i) => i.id !== ing.id));
  };

  const canAdd = masterId !== '' && displayName.trim() !== '';

  // ── Render row ──
  const renderRow = (ing: StoreIngredient) => {
    if (editingId === ing.id) {
      return (
        <tr key={ing.id}>
          <td>
            <input
              className={styles.inlineInput}
              value={editFields.display_name}
              onChange={(e) =>
                setEditFields((f) => ({ ...f, display_name: e.target.value }))
              }
            />
          </td>
          <td>
            <input
              className={styles.inlineInput}
              value={editFields.state_label}
              onChange={(e) =>
                setEditFields((f) => ({ ...f, state_label: e.target.value }))
              }
            />
          </td>
          <td>
            <select
              className={styles.inlineSelect}
              value={editFields.unit}
              onChange={(e) =>
                setEditFields((f) => ({ ...f, unit: e.target.value as UnitType }))
              }
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </td>
          <td>
            <input
              className={styles.inlineInput}
              type="number"
              min={0}
              step="any"
              value={editFields.default_quantity}
              onChange={(e) =>
                setEditFields((f) => ({ ...f, default_quantity: Number(e.target.value) }))
              }
            />
          </td>
          <td>
            <div className={styles.actions}>
              <button className={styles.saveBtn} onClick={saveEdit}>저장</button>
              <button className={styles.cancelBtn} onClick={cancelEdit}>취소</button>
            </div>
            {editError && <div className={styles.error}>{editError}</div>}
          </td>
        </tr>
      );
    }

    return (
      <tr key={ing.id}>
        <td>{ing.display_name}</td>
        <td>{ing.state_label ?? '—'}</td>
        <td>{ing.unit}</td>
        <td>{ing.default_quantity}</td>
        <td>
          <div className={styles.actions}>
            <button className={styles.editBtn} onClick={() => startEdit(ing)}>편집</button>
            <button className={styles.deleteBtn} onClick={() => handleDelete(ing)}>삭제</button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className={styles.container}>
      <h2>매장 재료 관리</h2>

      {deleteError && <div className={styles.error}>{deleteError}</div>}

      {/* ── Collapsible Add Form (top) ── */}
      <div className={styles.addSection}>
        <button
          className={styles.toggleBtn}
          onClick={() => setAddFormOpen((prev) => !prev)}
          type="button"
        >
          {addFormOpen ? '▼' : '▶'} 새 재료 추가
        </button>

        {addFormOpen && (
          <div className={styles.addFormBody}>
            {addError && <div className={styles.error}>{addError}</div>}

            <div className={styles.formGrid}>
              <div className={`${styles.formField} ${styles.full}`}>
                <label>원재료 선택</label>
                <select value={masterId} onChange={(e) => handleMasterChange(e.target.value)}>
                  <option value="">— 선택 —</option>
                  {masterList.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label>표시명 (display_name)</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="예: 다이스양파"
                />
              </div>

              <div className={styles.formField}>
                <label>상태 라벨 (선택)</label>
                <input
                  value={stateLabel}
                  onChange={(e) => setStateLabel(e.target.value)}
                  placeholder="예: dice, chop, raw"
                />
              </div>

              <div className={styles.formField}>
                <label>단위</label>
                <select value={unit} onChange={(e) => setUnit(e.target.value as UnitType)}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label>기본 수량</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={defaultQty}
                  onChange={(e) => setDefaultQty(Number(e.target.value))}
                />
              </div>

              <div className={`${styles.formField} ${styles.full}`}>
                <label>이미지 (선택)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button className={styles.addBtn} onClick={handleAdd} disabled={!canAdd || adding}>
                {adding ? '추가 중...' : '재료 추가'}
              </button>
              <button className={styles.resetBtn} onClick={resetAddForm} disabled={adding}>
                초기화
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      <div className={styles.searchBar}>
        <select
          className={styles.searchFieldSelect}
          value={searchField}
          onChange={(e) => setSearchField(e.target.value as SearchField)}
          disabled={isEditing}
        >
          <option value="display_name">표시명</option>
          <option value="state_label">상태</option>
          <option value="all">전체</option>
        </select>
        <div className={styles.searchInputWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="13" y1="13" x2="18" y2="18" />
          </svg>
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="text"
            placeholder={searchField === 'display_name' ? '표시명으로 검색' : searchField === 'state_label' ? '상태로 검색' : '표시명, 상태로 검색'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isEditing}
          />
          {searchQuery && (
            <button
              className={styles.searchClearBtn}
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              type="button"
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>
        {searchQuery && (
          <span className={styles.searchCount}>
            {filteredIngredients.length}건 / {ingredients.length}건
          </span>
        )}
      </div>

      {/* ── Toolbar: Sort + Group ── */}
      <div className={styles.toolbar}>
        <div className={styles.sortControls}>
          <label className={styles.toolbarLabel}>정렬:</label>
          <select
            className={styles.toolbarSelect}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            disabled={isEditing}
          >
            <option value="display_name">표시명</option>
            <option value="unit">단위</option>
            <option value="default_quantity">기본량</option>
          </select>
          <button
            className={styles.sortDirBtn}
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            disabled={isEditing}
            type="button"
          >
            {sortDir === 'asc' ? '▲ 오름차순' : '▼ 내림차순'}
          </button>
        </div>

        <div className={styles.groupControls}>
          <label className={styles.toolbarLabel}>그룹:</label>
          <select
            className={styles.toolbarSelect}
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupKey)}
            disabled={isEditing}
          >
            <option value="none">없음</option>
            <option value="unit">단위별</option>
            <option value="state_label">상태별</option>
          </select>
        </div>
      </div>

      {/* ── Ingredient table ── */}
      {ingredients.length === 0 ? (
        <div className={styles.empty}>등록된 재료가 없습니다.</div>
      ) : filteredIngredients.length === 0 ? (
        <div className={styles.empty}>
          '{searchQuery}'에 대한 검색 결과가 없습니다.
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th
                className={styles.sortableTh}
                onClick={() => handleSortClick('display_name')}
              >
                표시명{sortIndicator('display_name')}
              </th>
              <th>상태</th>
              <th
                className={styles.sortableTh}
                onClick={() => handleSortClick('unit')}
              >
                단위{sortIndicator('unit')}
              </th>
              <th
                className={styles.sortableTh}
                onClick={() => handleSortClick('default_quantity')}
              >
                기본량{sortIndicator('default_quantity')}
              </th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {groupedIngredients.map((group) => (
              <Fragment key={group.label || '__all'}>
                {group.label && (
                  <tr>
                    <td colSpan={5} className={styles.groupHeaderCell}>
                      {group.label} ({group.items.length})
                    </td>
                  </tr>
                )}
                {group.items.map(renderRow)}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default StoreIngredientsManager;
