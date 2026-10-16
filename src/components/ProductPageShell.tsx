'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { SetupRequired } from './SetupRequired';
import { SoloriseLogo } from './SoloriseLogo';
import styles from './ProductPages.module.css';

export function ProductPageShell({ title, description, adminOnly = false, children }: { title: string; description: string; adminOnly?: boolean; children: React.ReactNode }) {
  const { configured, loading, user, profile, isAdmin, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { if (configured && !loading && !user) router.replace('/login'); }, [configured, loading, router, user]);
  if (!configured) return <SetupRequired />;
  if (loading || !user) return <main className={styles.loading}><SoloriseLogo /></main>;
  if (adminOnly && !isAdmin) return <main className={styles.loading}><section><h1>Admin access required.</h1><Link href="/board">Return to board</Link></section></main>;
  return <main className={styles.page}><header className={styles.header}><Link href="/"><SoloriseLogo /></Link><nav><Link data-active={pathname === '/board'} href="/board">Board</Link>{isAdmin && <Link data-active={pathname === '/team'} href="/team">Team</Link>}<Link data-active={pathname === '/settings'} href="/settings">Settings</Link></nav><button onClick={logout}><span>{profile?.displayName ?? user.email}</span>Sign out</button></header><section className={styles.hero}><span>Solorise workspace</span><h1>{title}</h1><p>{description}</p></section><section className={styles.content}>{children}</section></main>;
}
