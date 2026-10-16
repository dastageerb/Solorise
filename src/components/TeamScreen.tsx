'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { ProductPageShell } from './ProductPageShell';
import styles from './TeamScreen.module.css';

type ManagedRole = 'admin' | 'member' | 'client';

interface ManagedUser {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  role: ManagedRole;
  createdAt: string;
}

interface CreatedCredentials {
  displayName: string;
  email: string;
  password: string;
  role: string;
}

function strongTemporaryPassword(length = 18): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_+='];
  const all = groups.join('');
  const pick = (characters: string) => characters[crypto.getRandomValues(new Uint32Array(1))[0] % characters.length];
  const characters = groups.map(pick);
  while (characters.length < length) characters.push(pick(all));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join('');
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

export function TeamScreen() {
  const { getToken, isAdmin } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', role: 'member' });

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/users', { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setUsers(payload.users);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [getToken, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ displayName: '', email: '', password: strongTemporaryPassword(), role: 'member' });
    setShowForm(true);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const credentials = { ...form };
      const token = await getToken();
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setCopied(false);
      setCreatedCredentials(credentials);
      setForm({ displayName: '', email: '', password: '', role: 'member' });
      setShowForm(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create user.');
    } finally {
      setBusy(false);
    }
  };

  const copyCredentials = async () => {
    if (!createdCredentials) return;
    await copyToClipboard([
      `Solorise sign-in: ${window.location.origin}/login`,
      `Email: ${createdCredentials.email}`,
      `Temporary password: ${createdCredentials.password}`,
      'Please sign in and use “Forgot your password?” to choose a private password.',
    ].join('\n'));
    setCopied(true);
  };

  return (
    <ProductPageShell
      adminOnly
      title="People and access"
      description="Create accounts for contractors and clients, then grant access only to the projects where they belong."
    >
      <div className={styles.toolbar}>
        <div><b>{users.length} accounts</b><span>Only workspace admins can create sign-in credentials.</span></div>
        <button onClick={openCreate}>+ Add person</button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading ? <p className={styles.loading}>Loading people…</p> : (
        <div className={styles.table}>
          <div className={styles.tableHead}><span>Person</span><span>Role</span><span>Created</span><span>Status</span></div>
          {users.map((user) => (
            <article key={user.uid}>
              <span className={styles.avatar}>{user.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
              <span className={styles.identity}><b>{user.displayName || 'Unnamed user'}</b><small>{user.email}</small></span>
              <em data-role={user.role}>{user.role}</em>
              <time>{new Date(user.createdAt).toLocaleDateString()}</time>
              <strong data-disabled={user.disabled}>{user.disabled ? 'Disabled' : 'Active'}</strong>
            </article>
          ))}
        </div>
      )}

      {showForm && (
        <div className={styles.backdrop}>
          <form className={styles.form} onSubmit={create}>
            <span>Admin-created account</span>
            <h2>Add a contractor or client.</h2>
            <p>A strong temporary password is ready. After creation, copy the credential bundle and share it through a secure channel.</p>
            <label>Full name<input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
            <label>Email address<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>
              Temporary password
              <div className={styles.passwordField}>
                <input required minLength={12} type="text" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
                <button type="button" onClick={() => setForm({ ...form, password: strongTemporaryPassword() })}>Regenerate</button>
              </div>
              <small>18 characters with upper and lowercase letters, numbers, and symbols.</small>
            </label>
            <label>Workspace role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="member">Contractor / member</option><option value="client">Client</option></select></label>
            <footer><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></footer>
          </form>
        </div>
      )}

      {createdCredentials && (
        <div className={styles.backdrop}>
          <section className={`${styles.form} ${styles.credentials}`}>
            <span>Account created</span>
            <h2>Credentials ready to share.</h2>
            <p>This temporary password is shown only here. Copy it now and send it through a secure channel.</p>
            <dl>
              <div><dt>Name</dt><dd>{createdCredentials.displayName}</dd></div>
              <div><dt>Email</dt><dd>{createdCredentials.email}</dd></div>
              <div><dt>Temporary password</dt><dd><code>{createdCredentials.password}</code></dd></div>
              <div><dt>Role</dt><dd>{createdCredentials.role}</dd></div>
            </dl>
            <footer>
              <button type="button" onClick={() => setCreatedCredentials(null)}>Done</button>
              <button type="button" onClick={() => void copyCredentials()}>{copied ? 'Copied ✓' : 'Copy credentials'}</button>
            </footer>
          </section>
        </div>
      )}
    </ProductPageShell>
  );
}
