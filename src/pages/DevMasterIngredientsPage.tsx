import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { IngredientsMaster } from '../types/db';
import { supabase } from '../lib/supabase';
import styles from './DevMasterIngredientsPage.module.css';

const ACCESS_KEY = 'kitchenflow-dev';

const DevMasterIngredientsPage = () => {
  const [searchParams] = useSearchParams();
  const authorized = searchParams.get('key') === ACCESS_KEY;

  const [items, setItems] = useState<IngredientsMaster[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    if (!authorized) return;
    const load = async () => {
      const { data } = await supabase
        .from('ingredients_master')
        .select('*')
        .order('name');
      if (data) setItems(data as IngredientsMaster[]);
    };
    load();
  }, [authorized]);

  if (!authorized) {
    return <div className={styles.denied}>접근 권한 없음</div>;
  }

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('ingredients_master')
      .insert({ name: trimmed })
      .select()
      .single();

    if (err) {
      if (err.code === '23505') {
        setError(`'${trimmed}' 은(는) 이미 등록된 원재료입니다.`);
      } else {
        setError(err.message);
      }
      setAdding(false);
      return;
    }

    setItems((prev) =>
      [...prev, data as IngredientsMaster].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setNewName('');
    setAdding(false);
  };

  const handleDelete = async (item: IngredientsMaster) => {
    const confirmed = window.confirm(
      `'${item.name}' 원재료를 삭제하시겠습니까?\n이 원재료를 사용하는 매장 재료가 있으면 삭제할 수 없습니다.`,
    );
    if (!confirmed) return;
    setError(null);

    const { error: err } = await supabase
      .from('ingredients_master')
      .delete()
      .eq('id', item.id);

    if (err) {
      if (err.code === '23503') {
        setError(
          `'${item.name}'을(를) 삭제할 수 없습니다. 이 원재료를 참조하는 매장 재료가 존재합니다.`,
        );
      } else {
        setError(err.message);
      }
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const startEdit = (item: IngredientsMaster) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setError(null);

    const { error: err } = await supabase
      .from('ingredients_master')
      .update({ name: trimmed })
      .eq('id', editingId);

    if (err) {
      if (err.code === '23505') {
        setError(`'${trimmed}' 은(는) 이미 등록된 원재료입니다.`);
      } else {
        setError(err.message);
      }
      return;
    }

    setItems((prev) =>
      prev
        .map((i) => (i.id === editingId ? { ...i, name: trimmed } : i))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    cancelEdit();
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>원재료 관리</h2>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.addRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="새 원재료 이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleAdd}
          disabled={!newName.trim() || adding}
        >
          {adding ? '추가 중...' : '추가'}
        </button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>원재료명</th>
            <th style={{ width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {editingId === item.id ? (
                  <input
                    className={styles.input}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                  />
                ) : (
                  item.name
                )}
              </td>
              <td>
                <div className={styles.actions}>
                  {editingId === item.id ? (
                    <>
                      <button className={styles.btn} onClick={saveEdit}>
                        저장
                      </button>
                      <button className={styles.btn} onClick={cancelEdit}>
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={styles.btn}
                        onClick={() => startEdit(item)}
                      >
                        편집
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={() => handleDelete(item)}
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DevMasterIngredientsPage;
