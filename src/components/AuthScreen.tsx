'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { SetupRequired } from './SetupRequired';
import { SoloriseLogo } from './SoloriseLogo';
import styles from './AuthScreen.module.css';

function messageFor(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('invalid-credential')) return 'That email and password do not match.';
  if (code.includes('email-already-in-use')) return 'An account already exists for this email.';
  if (code.includes('weak-password')) return 'Use at least six characters for your password.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Try again in a few minutes.';
  if (code.includes('configuration-not-found')) return 'Enable Email/Password authentication in the Firebase Console first.';
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function AuthScreen() {
  const { configured, user, login, resetPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/board');
  }, [router, user]);

  if (!configured) return <SetupRequired />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/board');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then choose reset password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPassword(email.trim());
      setNotice('Password reset email sent.');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <Link className={styles.home} href="/"><SoloriseLogo /></Link>
      <section className={styles.copy}>
        <span>For independent teams</span>
        <h1>Pick up where the work left off.</h1>
        <p>Projects stay separate. Contractors see what they own. Clients follow progress without another status meeting.</p>
      </section>
      <section className={styles.panel}>
        <div><p className={styles.kicker}>Welcome back</p><h2>Sign in to Solorise</h2></div>
        <form onSubmit={submit}>
          <label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label>Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error && <p className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}
          <button className={styles.submit} disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
        </form>
        <button className={styles.reset} type="button" disabled={busy} onClick={reset}>Forgot your password?</button>
        <p className={styles.switch}>Accounts are created by your workspace administrator.</p>
      </section>
    </main>
  );
}
