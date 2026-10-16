'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { BoardProvider } from './BoardProvider';
import { BoardView } from './BoardView';
import { SetupRequired } from './SetupRequired';
import { SoloriseLogo } from './SoloriseLogo';

export function BoardEntry() {
  const { configured, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (configured && !loading && !user) router.replace('/login');
  }, [configured, loading, router, user]);

  if (!configured) return <SetupRequired />;
  if (loading || !user) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7f7f3' }}><SoloriseLogo /></main>;
  }

  return <BoardProvider><BoardView /></BoardProvider>;
}
