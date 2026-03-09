import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Store } from '../types/db';
import styles from './JoinPage.module.css';

const JoinPage = () => {
  const navigate = useNavigate();
  const setSelectedStore = useAuthStore((s) => s.setSelectedStore);
  const clearAuth = useAuthStore((s) => s.clear);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmed = code.trim();
    if (!trimmed) {
      setError('매장 코드를 입력해주세요.');
      setSubmitting(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from('stores')
      .select()
      .eq('code', trimmed)
      .single();

    setSubmitting(false);

    if (queryError || !data) {
      setError('존재하지 않는 매장 코드입니다.');
      return;
    }

    setSelectedStore(data as Store);
    navigate('/join/avatar');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <button className={styles.logoutButton} onClick={handleLogout}>
          로그아웃
        </button>
        <h1 className={styles.title}>매장 코드 입력</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            매장 코드
            <input
              type="text"
              className={styles.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="매장 코드를 입력하세요"
              required
              autoFocus
            />
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? '확인 중...' : '입장하기'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinPage;
