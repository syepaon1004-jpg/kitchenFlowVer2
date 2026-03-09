import { Fragment, useMemo, useRef, useState } from 'react';
import type { Container } from '../../types/db';
import { supabase } from '../../lib/supabase';
import { uploadToStorage } from '../../lib/storage';
import styles from './ContainersManager.module.css';

type ContainerType = Container['container_type'];
const CONTAINER_TYPES: ContainerType[] = ['bowl', 'plate', 'pot', 'box'];

const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  bowl: 'bowl (그릇)',
  plate: 'plate (접시)',
  pot: 'pot (냄비)',
  box: 'box (박스)',
};

type SortKey = 'name' | 'container_type';
type SortDir = 'asc' | 'desc';
type GroupKey = 'none' | 'container_type';

interface Props {
  storeId: string;
  containers: Container[];
  setContainers: React.Dispatch<React.SetStateAction<Container[]>>;
}

const ContainersManager = ({ storeId, containers, setContainers }: Props) => {
  // ── Add form state ──
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [containerType, setContainerType] = useState<ContainerType>('bowl');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Inline edit state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({
    name: '',
    container_type: 'bowl' as ContainerType,
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  // ── Error state for delete ──
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Sort / Group state ──
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [groupBy, setGroupBy] = useState<GroupKey>('none');

  const isEditing = editingId !== null;

  // ── Sorted containers ──
  const sortedContainers = useMemo(() => {
    return [...containers].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'ko');
          break;
        case 'container_type':
          cmp = a.container_type.localeCompare(b.container_type);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [containers, sortKey, sortDir]);

  // ── Filtered containers (search) ──
  const filteredContainers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedContainers;
    return sortedContainers.filter((c) => c.name.toLowerCase().includes(q));
  }, [sortedContainers, searchQuery]);

  // ── Grouped containers ──
  const groupedContainers = useMemo(() => {
    if (groupBy === 'none') {
      return [{ label: '', items: filteredContainers }];
    }

    const map = new Map<string, Container[]>();
    for (const c of filteredContainers) {
      const key = c.container_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }

    return Array.from(map.entries()).map(([key, items]) => ({
      label: CONTAINER_TYPE_LABELS[key as ContainerType] ?? key,
      items,
    }));
  }, [filteredContainers, groupBy]);

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
  const resetAddForm = () => {
    setName('');
    setContainerType('bowl');
    setImageFile(null);
    setAddError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setAdding(true);
    setAddError(null);

    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadToStorage(imageFile, 'containers');
      }

      const { data, error } = await supabase
        .from('containers')
        .insert({
          store_id: storeId,
          name: name.trim(),
          container_type: containerType,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) {
        setAddError(error.message);
        return;
      }

      setContainers((prev) => [...prev, data as Container]);
      resetAddForm();
      setAddFormOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setAdding(false);
    }
  };

  // ── Inline edit handlers ──
  const startEdit = (c: Container) => {
    setEditingId(c.id);
    setEditFields({
      name: c.name,
      container_type: c.container_type,
    });
    setEditImageFile(null);
    setEditError(null);
    if (editFileRef.current) editFileRef.current.value = '';
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
    setEditImageFile(null);
    if (editFileRef.current) editFileRef.current.value = '';
  };

  const saveEdit = async () => {
    if (!editingId || !editFields.name.trim()) return;
    setEditError(null);

    try {
      const payload: Record<string, unknown> = {
        name: editFields.name.trim(),
        container_type: editFields.container_type,
      };

      if (editImageFile) {
        payload.image_url = await uploadToStorage(editImageFile, 'containers');
      }

      const { data, error } = await supabase
        .from('containers')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single();

      if (error) {
        setEditError(error.message);
        return;
      }

      setContainers((prev) =>
        prev.map((c) => (c.id === editingId ? (data as Container) : c)),
      );
      setEditingId(null);
      setEditImageFile(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '알 수 없는 오류');
    }
  };

  // ── Delete handler ──
  const handleDelete = async (c: Container) => {
    const confirmed = window.confirm(
      `'${c.name}'을(를) 삭제하시겠습니까?\n이 용기를 사용하는 레시피나 히트박스가 있으면 삭제할 수 없습니다.`,
    );
    if (!confirmed) return;

    setDeleteError(null);
    const { error } = await supabase.from('containers').delete().eq('id', c.id);

    if (error) {
      if (error.code === '23503') {
        setDeleteError(`'${c.name}' 삭제 실패: 이 용기를 참조하는 레시피 또는 히트박스가 있습니다.`);
      } else {
        setDeleteError(error.message);
      }
      return;
    }

    setContainers((prev) => prev.filter((item) => item.id !== c.id));
  };

  const canAdd = name.trim() !== '';

  // ── Render row ──
  const renderRow = (c: Container) => {
    if (editingId === c.id) {
      return (
        <tr key={c.id}>
          <td>
            {c.image_url ? (
              <img className={styles.thumbnail} src={c.image_url} alt={c.name} />
            ) : (
              <div className={styles.thumbnailPlaceholder}>—</div>
            )}
            <input
              ref={editFileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
              style={{ display: 'block', marginTop: 4, fontSize: 12, width: '100%' }}
            />
          </td>
          <td>
            <input
              className={styles.inlineInput}
              value={editFields.name}
              onChange={(e) =>
                setEditFields((f) => ({ ...f, name: e.target.value }))
              }
            />
          </td>
          <td>
            <select
              className={styles.inlineSelect}
              value={editFields.container_type}
              onChange={(e) =>
                setEditFields((f) => ({ ...f, container_type: e.target.value as ContainerType }))
              }
            >
              {CONTAINER_TYPES.map((t) => (
                <option key={t} value={t}>{CONTAINER_TYPE_LABELS[t]}</option>
              ))}
            </select>
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
      <tr key={c.id}>
        <td>
          {c.image_url ? (
            <img className={styles.thumbnail} src={c.image_url} alt={c.name} />
          ) : (
            <div className={styles.thumbnailPlaceholder}>—</div>
          )}
        </td>
        <td>{c.name}</td>
        <td>{CONTAINER_TYPE_LABELS[c.container_type]}</td>
        <td>
          <div className={styles.actions}>
            <button className={styles.editBtn} onClick={() => startEdit(c)}>편집</button>
            <button className={styles.deleteBtn} onClick={() => handleDelete(c)}>삭제</button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className={styles.container}>
      <h2>용기 관리</h2>

      {deleteError && <div className={styles.error}>{deleteError}</div>}

      {/* ── Collapsible Add Form (top) ── */}
      <div className={styles.addSection}>
        <button
          className={styles.toggleBtn}
          onClick={() => setAddFormOpen((prev) => !prev)}
          type="button"
        >
          {addFormOpen ? '▼' : '▶'} 새 용기 추가
        </button>

        {addFormOpen && (
          <div className={styles.addFormBody}>
            {addError && <div className={styles.error}>{addError}</div>}

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label>이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 스텐볼"
                />
              </div>

              <div className={styles.formField}>
                <label>용기 유형</label>
                <select
                  value={containerType}
                  onChange={(e) => setContainerType(e.target.value as ContainerType)}
                >
                  {CONTAINER_TYPES.map((t) => (
                    <option key={t} value={t}>{CONTAINER_TYPE_LABELS[t]}</option>
                  ))}
                </select>
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
                {adding ? '추가 중...' : '용기 추가'}
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
        <div className={styles.searchInputWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="13" y1="13" x2="18" y2="18" />
          </svg>
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="text"
            placeholder="이름으로 검색"
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
            {filteredContainers.length}건 / {containers.length}건
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
            <option value="name">이름</option>
            <option value="container_type">용기 유형</option>
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
            <option value="container_type">용기 유형별</option>
          </select>
        </div>
      </div>

      {/* ── Container table ── */}
      {containers.length === 0 ? (
        <div className={styles.empty}>등록된 용기가 없습니다.</div>
      ) : filteredContainers.length === 0 ? (
        <div className={styles.empty}>
          '{searchQuery}'에 대한 검색 결과가 없습니다.
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>이미지</th>
              <th
                className={styles.sortableTh}
                onClick={() => handleSortClick('name')}
              >
                이름{sortIndicator('name')}
              </th>
              <th
                className={styles.sortableTh}
                onClick={() => handleSortClick('container_type')}
              >
                용기 유형{sortIndicator('container_type')}
              </th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {groupedContainers.map((group) => (
              <Fragment key={group.label || '__all'}>
                {group.label && (
                  <tr>
                    <td colSpan={4} className={styles.groupHeaderCell}>
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

export default ContainersManager;
