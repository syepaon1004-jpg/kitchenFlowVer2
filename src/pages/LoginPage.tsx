import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import styles from './LoginPage.module.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);

    if (authError) {
      setError(authError.message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Kitchen Simulator</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            이메일
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className={styles.label}>
            비밀번호
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting
              ? '처리 중...'
              : isSignUp
                ? '회원가입'
                : '로그인'}
          </button>
        </form>

        <button
          type="button"
          className={styles.toggleLink}
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError(null);
          }}
        >
          {isSignUp
            ? '이미 계정이 있으신가요? 로그인'
            : '계정이 없으신가요? 회원가입'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
