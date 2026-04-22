import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Store, StoreUser } from '../types/db';
import '../styles/gameVariables.css';
import styles from './JoinPage.module.css';

interface StoreCard {
  store: Store;
  roles: Set<'admin' | 'staff'>;
  avatarNames: string[];
}

const JoinPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setSelectedStore = useAuthStore((s) => s.setSelectedStore);
  const setSelectedUser = useAuthStore((s) => s.setSelectedUser);
  const clearAuth = useAuthStore((s) => s.clear);

  const [storeCards, setStoreCards] = useState<StoreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 모드 선택 모달 (시뮬레이터 / 메뉴 연습)
  const [modeModalStore, setModeModalStore] = useState<Store | null>(null);

  // 생성 모드
  const [showCreate, setShowCreate] = useState(false);

  // 생성 폼
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // ── 내 매장 조회 ──
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      // 이메일 자동 연결: invited_email이 매칭되는 레코드의 auth_user_id 업데이트
      const { data: pendingInvites } = await supabase
        .from('store_users')
        .select('id')
        .ilike('invited_email', user.email!)
        .is('auth_user_id', null)
        .is('deleted_at', null);

      if (pendingInvites && pendingInvites.length > 0) {
        const ids = pendingInvites.map((r) => r.id);
        await supabase
          .from('store_users')
          .update({ auth_user_id: user.id })
          .in('id', ids);
      }

      const { data, error: queryError } = await supabase
        .from('store_users')
        .select('*, stores(*)')
        .eq('auth_user_id', user.id)
        .is('deleted_at', null);

      if (queryError) {
        setError('매장 정보를 불러오지 못했습니다.');
        setLoading(false);
        return;
      }

      // store_id 기준 그룹핑 (같은 매장에 여러 아바타 가능)
      const grouped = new Map<string, StoreCard>();
      for (const row of data ?? []) {
        const su = row as StoreUser & { stores: Store };
        const storeId = su.store_id;
        if (!grouped.has(storeId)) {
          grouped.set(storeId, {
            store: su.stores,
            roles: new Set(),
            avatarNames: [],
          });
        }
        const card = grouped.get(storeId)!;
        card.roles.add(su.role);
        card.avatarNames.push(su.name);
      }

      setStoreCards(Array.from(grouped.values()));
      setLoading(false);
    };
    load();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/sim');
  };

  const handleSelectStore = (store: Store) => {
    setSelectedStore(store);
    setSelectedUser(null);
    setModeModalStore(store);
  };

  const handleModeCancel = () => {
    setModeModalStore(null);
  };

  // ── 새 매장 만들기 ──
  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = createName.trim();
    const trimmedCode = createCode.trim();
    if (!trimmedName || !trimmedCode) {
      setError('매장 이름과 코드를 모두 입력해주세요.');
      return;
    }
    setCreateSubmitting(true);

    // 1. stores INSERT
    const { data: newStore, error: storeError } = await supabase
      .from('stores')
      .insert({ name: trimmedName, code: trimmedCode })
      .select()
      .single();

    if (storeError || !newStore) {
      setCreateSubmitting(false);
      if (storeError?.code === '23505') {
        setError('이미 사용 중인 매장 코드입니다.');
      } else {
        setError(storeError?.message ?? '매장 생성에 실패했습니다.');
      }
      return;
    }

    // 2. store_users INSERT (생성자 = admin)
    const defaultName = user?.email?.split('@')[0] ?? '관리자';
    const { error: userError } = await supabase
      .from('store_users')
      .insert({
        store_id: newStore.id,
        role: 'admin',
        auth_user_id: user!.id,
        name: defaultName,
        avatar_key: 'default',
      });

    setCreateSubmitting(false);
    if (userError) {
      setError('매장은 생성되었으나 관리자 등록에 실패했습니다.');
      return;
    }

    setSelectedStore(newStore as Store);
    setSelectedUser(null);
    setModeModalStore(newStore as Store);
    setShowCreate(false);
  };

  const hasStores = storeCards.length > 0;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <button className={styles.logoutButton} onClick={handleLogout}>
          로그아웃
        </button>

        <h1 className={styles.title}>
          {hasStores ? '내 매장' : '매장 참여'}
        </h1>

        {loading ? (
          <p className={styles.placeholder}>불러오는 중...</p>
        ) : (
          <>
            {/* 매장 카드 리스트 */}
            {hasStores && (
              <div className={styles.storeList}>
                {storeCards.map((card) => (
                  <button
                    key={card.store.id}
                    className={styles.storeCard}
                    onClick={() => handleSelectStore(card.store)}
                  >
                    <div className={styles.storeCardHeader}>
                      <span className={styles.storeName}>{card.store.name}</span>
                      <span className={styles.storeCode}>{card.store.code}</span>
                    </div>
                    <div className={styles.storeCardBody}>
                      <div className={styles.badgeGroup}>
                        {card.roles.has('admin') && (
                          <span className={styles.badgeAdmin}>관리자</span>
                        )}
                        {card.roles.has('staff') && (
                          <span className={styles.badgeStaff}>스태프</span>
                        )}
                      </div>
                      <span className={styles.avatarNames}>
                        {card.avatarNames.join(', ')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 매장 없을 때 안내 */}
            {!hasStores && (
              <p className={styles.emptyMessage}>
                연결된 매장이 없습니다. 관리자에게 문의하거나 새 매장을 만드세요.
              </p>
            )}

            {/* 하단 액션 */}
            <div className={styles.actions}>
              {!showCreate && (
                <button
                  className={styles.actionButton}
                  onClick={() => { setShowCreate(true); setError(null); }}
                >
                  새 매장 만들기
                </button>
              )}

              {showCreate && (
                <form onSubmit={handleCreateSubmit} className={styles.form}>
                  <label className={styles.label}>
                    매장 이름
                    <input
                      type="text"
                      className={styles.input}
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="매장 이름을 입력하세요"
                      autoFocus
                    />
                  </label>
                  <label className={styles.label}>
                    매장 코드
                    <input
                      type="text"
                      className={styles.input}
                      value={createCode}
                      onChange={(e) => setCreateCode(e.target.value)}
                      placeholder="고유 매장 코드 (예: mystore01)"
                    />
                  </label>
                  {error && <div className={styles.error}>{error}</div>}
                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={() => { setShowCreate(false); setError(null); }}
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className={styles.submitButton}
                      disabled={createSubmitting}
                    >
                      {createSubmitting ? '생성 중...' : '매장 만들기'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {modeModalStore && (
        <div className={styles.modeOverlay} onClick={handleModeCancel}>
          <div className={styles.modeModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modeTitle}>{modeModalStore.name}</h2>
            <p className={styles.modeSubtitle}>이동할 모드를 선택하세요</p>
            <div className={styles.modeButtons}>
              <button
                className={styles.modeButtonPrimary}
                onClick={() => navigate('/sim/join/avatar')}
              >
                시뮬레이터
              </button>
              <button
                className={styles.modeButtonSecondary}
                onClick={() => navigate('/practice')}
              >
                메뉴 연습
              </button>
            </div>
            <button className={styles.modeClose} onClick={handleModeCancel}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JoinPage;
