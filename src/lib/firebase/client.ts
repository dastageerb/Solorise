import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  type Firestore,
} from 'firebase/firestore';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (typeof window !== 'undefined') {
  setLogLevel('silent');

  // In development, Next.js / Turbopack intercepts all console.error calls and displays
  // a modal overlay. Firestore multi-tab lease contention for background jobs ('Collect garbage',
  // 'Backfill Indexes') is an expected, benign internal mechanism on secondary tabs or fast reloads.
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.map((arg) => (typeof arg === 'string' ? arg : '')).join(' ');
    if (message.includes('Failed to obtain primary lease')) {
      return;
    }
    originalError.apply(console, args);
  };
}

export function getFirebaseClient(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!firebaseConfigured) {
    throw new Error('Firebase is not configured. Copy .env.example to .env.local and add your project values.');
  }

  app ??= getApps().length ? getApp() : initializeApp(config);
  const firebaseApp = app;
  auth ??= getAuth(firebaseApp);
  if (!db) {
    try {
      db = typeof window === 'undefined'
        ? getFirestore(firebaseApp)
        : initializeFirestore(firebaseApp, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
          });
    } catch {
      db = getFirestore(firebaseApp);
    }
  }
  return { app: firebaseApp, auth, db };
}
