import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { StoreUser } from '../types/db';
import styles from './AvatarSelectPage.module.css';


const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

const AVATAR_KEY_OPTIONS = [
  { value: 'chef_1', label: 'Chef 1' },
  { value: 'chef_2', label: 'Chef 2' },
  { value: 'chef_3', label: 'Chef 3' },
  { value: 'staff_1', label: 'Staff 1' },
  { value: 'staff_2', label: 'Staff 2' },
  { value: 'staff_3', label: 'Staff 3' },
];

function getAvatarColor(avatarKey: string): string {
  let hash = 0;
  for (const ch of avatarKey) hash = (hash * 31 + ch.charCodeAt(0)) & 0xff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getAvatarInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

const AvatarSelectPage = () => {
  const navigate = useNavigate();
  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);
  const setSelectedUser = useAuthStore((s) => s.setSelectedUser);
  const clearAuth = useAuthStore((s) => s.clear);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/');
  };

  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAvatarKey, setNewAvatarKey] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Fetch store users
  useEffect(() => {
    if (!selectedStore) return;

    const fetchUsers = async () => {
      setFetchLoading(true);
      setFetchError(null);

      const { data, error } = await supabase
        .from('store_users')
        .select('*')
        .eq('store_id', selectedStore.id);

      setFetchLoading(false);

      if (error) {
        setFetchError(error.message);
        return;
      }

      setStoreUsers((data as StoreUser[]) ?? []);
    };

    fetchUsers();
  }, [selectedStore]);

  const handleAvatarClick = (storeUser: StoreUser) => {
    setSelectedUser(storeUser);
    if (storeUser.role === 'admin') {
      setShowRoleModal(true);
    } else {
      navigate('/game/setup');
    }
  };

  const handleRoleModalClose = () => {
    setShowRoleModal(false);
    setSelectedUser(null);
  };

  const adminCount = storeUsers.filter((u) => u.role === 'admin').length;
  const usedAvatarKeys = storeUsers.map((u) => u.avatar_key);

  const handleCreateUser = async () => {
    if (!selectedStore) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError('이름을 입력해주세요.');
      return;
    }
    if (!newAvatarKey) {
      setCreateError('아바타를 선택해주세요.');
      return;
    }
    if (newRole === 'admin' && adminCount >= 2) {
      setCreateError('관리자는 최대 2명까지만 등록할 수 있습니다.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    const { data, error } = await supabase
      .from('store_users')
      .insert({
        store_id: selectedStore.id,
        name: trimmedName,
        avatar_key: newAvatarKey,
        role: newRole,
      })
      .select()
      .single();

    setCreating(false);

    if (error) {
      setCreateError(error.message);
      return;
    }

    setStoreUsers((prev) => [...prev, data as StoreUser]);
    setShowCreateForm(false);
    setNewName('');
    setNewAvatarKey('');
    setNewRole('staff');
    setCreateError(null);
  };

  if (!selectedStore) return null;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <button className={styles.logoutButton} onClick={handleLogout}>
          로그아웃
        </button>
        <h1 className={styles.title}>{selectedStore.name}</h1>
        <p className={styles.subtitle}>아바타를 선택하세요</p>

        {fetchLoading ? (
          <div className={styles.innerLoading}>불러오는 중...</div>
        ) : fetchError ? (
          <div className={styles.error}>{fetchError}</div>
        ) : storeUsers.length === 0 ? (
          <div className={styles.emptyMessage}>
            등록된 아바타가 없습니다. 관리자에게 문의하세요.
          </div>
        ) : (
          <>
            <div className={styles.avatarGrid}>
              {storeUsers.map((u) => (
                <button
                  key={u.id}
                  className={styles.avatarCard}
                  onClick={() => handleAvatarClick(u)}
                >
                  <div
                    className={styles.avatarCircle}
                    style={{ backgroundColor: getAvatarColor(u.avatar_key) }}
                  >
                    {getAvatarInitial(u.name)}
                  </div>
                  <span className={styles.avatarName}>{u.name}</span>
                  <span
                    className={`${styles.roleBadge} ${
                      u.role === 'admin'
                        ? styles.roleBadgeAdmin
                        : styles.roleBadgeStaff
                    }`}
                  >
                    {u.role === 'admin' ? '관리자' : '직원'}
                  </span>
                </button>
              ))}

              {selectedUser?.role === 'admin' && !showCreateForm && (
                <button
                  className={styles.addAvatarCard}
                  onClick={() => setShowCreateForm(true)}
                >
                  <div className={styles.addAvatarCircle}>+</div>
                  <span className={styles.avatarName}>아바타 추가</span>
                </button>
              )}
            </div>

            {showCreateForm && (
              <div className={styles.createForm}>
                <p className={styles.createFormTitle}>새 아바타 등록</p>

                <label className={styles.label}>
                  이름
                  <input
                    type="text"
                    className={styles.input}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="이름을 입력하세요"
                  />
                </label>

                <label className={styles.label}>
                  아바타
                  <select
                    className={styles.select}
                    value={newAvatarKey}
                    onChange={(e) => setNewAvatarKey(e.target.value)}
                  >
                    <option value="">선택하세요</option>
                    {AVATAR_KEY_OPTIONS.map((opt) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                        disabled={usedAvatarKeys.includes(opt.value)}
                      >
                        {opt.label}
                        {usedAvatarKeys.includes(opt.value) ? ' (사용 중)' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  역할
                  <select
                    className={styles.select}
                    value={newRole}
                    onChange={(e) =>
                      setNewRole(e.target.value as 'admin' | 'staff')
                    }
                  >
                    <option value="staff">직원</option>
                    <option value="admin" disabled={adminCount >= 2}>
                      관리자{adminCount >= 2 ? ' (최대 2명)' : ''}
                    </option>
                  </select>
                </label>

                {createError && <div className={styles.error}>{createError}</div>}

                <div className={styles.formActions}>
                  <button
                    className={styles.submitButton}
                    onClick={handleCreateUser}
                    disabled={creating}
                  >
                    {creating ? '등록 중...' : '등록'}
                  </button>
                  <button
                    className={styles.cancelButton}
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewName('');
                      setNewAvatarKey('');
                      setNewRole('staff');
                      setCreateError(null);
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showRoleModal && (
        <div className={styles.modalOverlay} onClick={handleRoleModalClose}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>어디로 이동하시겠습니까?</h2>
            <p className={styles.modalSubtitle}>
              {selectedUser?.name}(으)로 입장합니다
            </p>
            <div className={styles.modalButtons}>
              <button
                className={styles.modalButtonPrimary}
                onClick={() => navigate('/admin')}
              >
                관리자 페이지
              </button>
              <button
                className={styles.modalButtonSecondary}
                onClick={() => navigate('/game/setup')}
              >
                게임 시작
              </button>
            </div>
            <button className={styles.modalClose} onClick={handleRoleModalClose}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvatarSelectPage;
