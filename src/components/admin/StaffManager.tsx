import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { StoreUser } from '../../types/db';
import styles from './StaffManager.module.css';

interface Props {
  storeId: string;
  currentUserId: string;
}

type ConnectionStatus = 'connected' | 'pending' | 'no-email';

function getStatus(user: StoreUser): ConnectionStatus {
  if (user.auth_user_id) return 'connected';
  if (user.invited_email) return 'pending';
  return 'no-email';
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: '연결됨',
  pending: '대기 중',
  'no-email': '이메일 없음',
};

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  connected: styles.badgeConnected,
  pending: styles.badgePending,
  'no-email': styles.badgeNoEmail,
};

const StaffManager = ({ storeId, currentUserId }: Props) => {
  const [staff, setStaff] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<'admin' | 'staff'>('staff');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'staff'>('staff');
  const [editEmail, setEditEmail] = useState('');

  const loadStaff = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('store_users')
      .select('*')
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .order('role', { ascending: true })
      .order('name', { ascending: true });

    if (queryError) {
      setError('직원 목록을 불러오지 못했습니다.');
    } else {
      setStaff((data ?? []) as StoreUser[]);
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    let cancelled = false;

    const fetchStaff = async () => {
      const { data, error: queryError } = await supabase
        .from('store_users')
        .select('*')
        .eq('store_id', storeId)
        .is('deleted_at', null)
        .order('role', { ascending: true })
        .order('name', { ascending: true });

      if (cancelled) return;

      if (queryError) {
        setError('직원 목록을 불러오지 못했습니다.');
      } else {
        setStaff((data ?? []) as StoreUser[]);
      }
      setLoading(false);
    };

    fetchStaff();

    return () => { cancelled = true; };
  }, [storeId]);

  // ── 직원 추가 (Edge Function 호출) ──
  const handleAdd = async () => {
    const trimmedName = addName.trim();
    const trimmedEmail = addEmail.trim();
    const trimmedPassword = addPassword.trim();

    if (!trimmedName) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (!trimmedEmail) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!trimmedPassword || trimmedPassword.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setAdding(true);
    setError(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            store_id: storeId,
            name: trimmedName,
            role: addRole,
            email: trimmedEmail.toLowerCase(),
            password: trimmedPassword,
          }),
        }
      );

      const result: { success: boolean; error?: string } = await response.json();

      setAdding(false);
      if (!result.success) {
        setError(result.error ?? '직원 추가에 실패했습니다.');
        return;
      }

      setAddName('');
      setAddRole('staff');
      setAddEmail('');
      setAddPassword('');
      setShowAdd(false);
      await loadStaff();
    } catch {
      setAdding(false);
      setError('서버 요청에 실패했습니다.');
    }
  };

  // ── 편집 시작 ──
  const startEdit = (user: StoreUser) => {
    setEditId(user.id);
    setEditName(user.name);
    setEditRole(user.role);
    setEditEmail(user.invited_email ?? '');
    setError(null);
  };

  const cancelEdit = () => {
    setEditId(null);
    setError(null);
  };

  // ── 편집 저장 ──
  const handleSaveEdit = async (user: StoreUser) => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError('이름을 입력해주세요.');
      return;
    }

    // 자기 자신 role 변경 차단
    if (user.id === currentUserId && editRole !== user.role) {
      setError('자기 자신의 역할은 변경할 수 없습니다.');
      return;
    }

    setError(null);
    const updates: Partial<StoreUser> = {
      name: trimmedName,
      role: editRole,
      invited_email: editEmail.trim() ? editEmail.trim().toLowerCase() : null,
    };

    const { error: updateError } = await supabase
      .from('store_users')
      .update(updates)
      .eq('id', user.id)
      .is('deleted_at', null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditId(null);
    await loadStaff();
  };

  // ── 연결 해제 ──
  const handleDisconnect = async (user: StoreUser) => {
    if (!window.confirm(`"${user.name}"의 계정 연결을 해제하시겠습니까?`)) return;

    const { error: updateError } = await supabase
      .from('store_users')
      .update({ auth_user_id: null })
      .eq('id', user.id)
      .is('deleted_at', null);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadStaff();
  };

  // ── 직원 삭제 ──
  const handleDelete = async (user: StoreUser) => {
    if (user.id === currentUserId) {
      setError('자기 자신은 삭제할 수 없습니다.');
      return;
    }

    if (!window.confirm(`"${user.name}" 직원을 삭제하시겠습니까?`)) return;

    // game_sessions FK 체크
    const { count } = await supabase
      .from('game_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (count && count > 0) {
      if (!window.confirm(`이 직원에게 ${count}개의 게임 기록이 있습니다. 정말 삭제하시겠습니까?`)) return;
    }

    const { error: deleteError } = await supabase
      .from('store_users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', user.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadStaff();
  };

  if (loading) return <div className={styles.container}>불러오는 중...</div>;

  return (
    <div className={styles.container}>
      <h2>직원 관리</h2>

      {error && <div className={styles.error}>{error}</div>}

      {/* 추가 토글 */}
      <div className={styles.addSection}>
        <button className={styles.toggleBtn} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? '▾ 직원 추가 닫기' : '▸ 직원 추가'}
        </button>

        {showAdd && (
          <div className={styles.addFormBody}>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label>이름 *</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="직원 이름"
                />
              </div>
              <div className={styles.formField}>
                <label>역할 *</label>
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as 'admin' | 'staff')}>
                  <option value="staff">스태프</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label>이메일 *</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className={styles.formField}>
                <label>비밀번호 *</label>
                <input
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="6자 이상"
                  minLength={6}
                />
              </div>
              <div className={`${styles.formField} ${styles.full}`}>
                <span className={styles.hint}>
                  직원에게 이 이메일과 비밀번호를 전달하세요.
                </span>
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.addBtn} onClick={handleAdd} disabled={adding}>
                {adding ? '추가 중...' : '추가'}
              </button>
              <button className={styles.resetBtn} onClick={() => setShowAdd(false)}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 직원 테이블 */}
      {staff.length === 0 ? (
        <div className={styles.empty}>등록된 직원이 없습니다.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>이름</th>
              <th>역할</th>
              <th>이메일</th>
              <th>연결 상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((user) => {
              const isSelf = user.id === currentUserId;
              const status = getStatus(user);
              const isEditing = editId === user.id;

              return (
                <tr key={user.id}>
                  {/* 이름 */}
                  <td>
                    {isEditing ? (
                      <input
                        className={styles.inlineInput}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      <>
                        {user.name}
                        {isSelf && <span className={styles.selfLabel}>(나)</span>}
                      </>
                    )}
                  </td>

                  {/* 역할 */}
                  <td>
                    {isEditing ? (
                      <select
                        className={styles.inlineSelect}
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as 'admin' | 'staff')}
                        disabled={isSelf}
                      >
                        <option value="staff">스태프</option>
                        <option value="admin">관리자</option>
                      </select>
                    ) : (
                      <span className={user.role === 'admin' ? styles.roleAdmin : styles.roleStaff}>
                        {user.role === 'admin' ? '관리자' : '스태프'}
                      </span>
                    )}
                  </td>

                  {/* 이메일 */}
                  <td>
                    {isEditing ? (
                      <input
                        className={styles.inlineInput}
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    ) : (
                      <span className={styles.emailCell}>
                        {user.invited_email ?? '-'}
                      </span>
                    )}
                  </td>

                  {/* 연결 상태 */}
                  <td>
                    <span className={STATUS_CLASS[status]}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>

                  {/* 작업 */}
                  <td>
                    <div className={styles.actions}>
                      {isEditing ? (
                        <>
                          <button className={styles.saveBtn} onClick={() => handleSaveEdit(user)}>
                            저장
                          </button>
                          <button className={styles.cancelBtn} onClick={cancelEdit}>
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button className={styles.editBtn} onClick={() => startEdit(user)}>
                            편집
                          </button>
                          {status === 'connected' && !isSelf && (
                            <button className={styles.disconnectBtn} onClick={() => handleDisconnect(user)}>
                              연결해제
                            </button>
                          )}
                          {!isSelf && (
                            <button className={styles.deleteBtn} onClick={() => handleDelete(user)}>
                              삭제
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default StaffManager;
