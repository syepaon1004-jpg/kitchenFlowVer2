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
  const user = useAuthStore((s) => s.user);
  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);
  const setSelectedUser = useAuthStore((s) => s.setSelectedUser);
  const clearAuth = useAuthStore((s) => s.clear);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/');
  };

  const [allUsers, setAllUsers] = useState<StoreUser[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAvatarKey, setNewAvatarKey] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // ── 아바타 조회 ──
  useEffect(() => {
    if (!selectedStore) return;

    const fetchUsers = async () => {
      setFetchLoading(true);
      setFetchError(null);

      const { data, error } = await supabase
        .from('store_users')
        .select('*')
        .eq('store_id', selectedStore.id)
        .is('deleted_at', null);

      setFetchLoading(false);

      if (error) {
        setFetchError(error.message);
        return;
      }

      setAllUsers((data as StoreUser[]) ?? []);
    };

    fetchUsers();
  }, [selectedStore]);

  // ── 권한 판별 + 가시성 필터링 ──
  const myAvatars = allUsers.filter((a) => a.auth_user_id === user?.id);
  const isAdmin = myAvatars.some((a) => a.role === 'admin');
  const isNewUser = myAvatars.length === 0;

  let visibleAvatars: StoreUser[];
  if (isNewUser) {
    // 신규: 미연결 아바타만
    visibleAvatars = allUsers.filter((a) => a.auth_user_id === null);
  } else if (isAdmin) {
    // admin 재방문: 전체 표시
    visibleAvatars = allUsers;
  } else {
    // staff 재방문: 본인 아바타만
    visibleAvatars = allUsers.filter((a) => a.auth_user_id === user?.id);
  }

  // ── 아바타 선택 ──
  const handleAvatarClick = async (storeUser: StoreUser) => {
    // 다른 사람 아바타 → 차단
    if (storeUser.auth_user_id && storeUser.auth_user_id !== user?.id) return;

    setSelectingId(storeUser.id);

    let finalUser = storeUser;

    // auth_user_id가 null이면 저장
    if (!storeUser.auth_user_id && user) {
      const { error } = await supabase
        .from('store_users')
        .update({ auth_user_id: user.id })
        .eq('id', storeUser.id);

      if (error) {
        setFetchError('아바타 연결에 실패했습니다.');
        setSelectingId(null);
        return;
      }

      // 로컬 상태 업데이트
      const updated = { ...storeUser, auth_user_id: user.id };
      setAllUsers((prev) =>
        prev.map((u) => (u.id === storeUser.id ? updated : u)),
      );
      finalUser = updated;
    }

    setSelectingId(null);
    setSelectedUser(finalUser);

    setShowRoleModal(true);
  };

  const handleRoleModalClose = () => {
    setShowRoleModal(false);
    setSelectedUser(null);
  };

  // ── 아바타 카드 상태 판별 ──
  const getCardState = (avatar: StoreUser): 'mine' | 'available' | 'taken' => {
    if (avatar.auth_user_id === null) return 'available';
    if (avatar.auth_user_id === user?.id) return 'mine';
    return 'taken';
  };

  const adminCount = allUsers.filter((u) => u.role === 'admin').length;
  const usedAvatarKeys = allUsers.map((u) => u.avatar_key);

  const handleCreateUser = async () => {
    if (!selectedStore || !user) return;

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
        auth_user_id: user.id,
      })
      .select()
      .single();

    setCreating(false);

    if (error) {
      setCreateError(error.message);
      return;
    }

    setAllUsers((prev) => [...prev, data as StoreUser]);
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
        ) : visibleAvatars.length === 0 ? (
          <div className={styles.emptyMessage}>
            {isNewUser
              ? '선택 가능한 아바타가 없습니다. 관리자에게 문의하세요.'
              : '등록된 아바타가 없습니다.'}
          </div>
        ) : (
          <>
            <div className={styles.avatarGrid}>
              {visibleAvatars.map((u) => {
                const state = getCardState(u);
                const isTaken = state === 'taken';
                const isMine = state === 'mine';
                const isSelecting = selectingId === u.id;

                return (
                  <button
                    key={u.id}
                    className={[
                      styles.avatarCard,
                      isMine ? styles.avatarCardMine : '',
                      isTaken ? styles.avatarCardTaken : '',
                    ].join(' ')}
                    onClick={() => handleAvatarClick(u)}
                    disabled={isTaken || isSelecting}
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
                    {isMine && (
                      <span className={styles.mineBadge}>내 아바타</span>
                    )}
                    {isTaken && (
                      <span className={styles.takenBadge}>사용 중</span>
                    )}
                    {isSelecting && (
                      <span className={styles.selectingText}>연결 중...</span>
                    )}
                  </button>
                );
              })}

              {isAdmin && !showCreateForm && (
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
              {selectedUser?.role === 'admin' && (
                <button
                  className={styles.modalButtonPrimary}
                  onClick={() => navigate('/admin')}
                >
                  관리자 페이지
                </button>
              )}
              <button
                className={styles.modalButtonSecondary}
                onClick={() => navigate('/game/setup')}
              >
                게임 시작
              </button>
              <button
                className={styles.modalButtonSecondary}
                onClick={() => navigate('/feed')}
              >
                내 피드
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
