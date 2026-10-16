'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { firebaseConfigured, getFirebaseClient } from '@/lib/firebase/client';
import type { UserProfile } from '@/lib/firebase/models';

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(firebaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const { auth, db } = getFirebaseClient();
    let stopProfile: () => void = () => {};

    const stopAuth = onAuthStateChanged(auth, async (nextUser) => {
      stopProfile();
      setUser(nextUser);
      setProfile(null);
      setIsAdmin(false);

      if (!nextUser) {
        setLoading(false);
        return;
      }

      const token = await nextUser.getIdTokenResult();
      setIsAdmin(token.claims.admin === true);
      stopProfile = onSnapshot(doc(db, 'users', nextUser.uid), (snapshot) => {
        const data = snapshot.data();
        setProfile(data ? {
          uid: nextUser.uid,
          email: String(data.email ?? nextUser.email ?? ''),
          displayName: String(data.displayName ?? nextUser.displayName ?? 'User'),
          role: data.role === 'admin' || data.role === 'client' ? data.role : 'member',
          createdAt: data.createdAt?.toDate?.().toISOString?.() ?? '',
        } : null);
        setLoading(false);
      }, () => setLoading(false));
    });

    return () => {
      stopProfile();
      stopAuth();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { auth } = getFirebaseClient();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { auth } = getFirebaseClient();
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    const { auth } = getFirebaseClient();
    await signOut(auth);
  }, []);

  const getToken = useCallback(async () => {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) throw new Error('You must sign in first.');
    return auth.currentUser.getIdToken();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: firebaseConfigured,
    loading,
    user,
    profile,
    isAdmin,
    login,
    resetPassword,
    logout,
    getToken,
  }), [getToken, isAdmin, loading, login, logout, profile, resetPassword, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
