import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, firebaseAdminConfigured, verifyBearer } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed.';
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (message === 'FORBIDDEN') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  if (message === 'Firebase Admin credentials are not configured.') return NextResponse.json({ error: message }, { status: 503 });
  if (message === 'Name, email, and a password of at least twelve characters are required.') return NextResponse.json({ error: message }, { status: 400 });
  if (code === 'auth/email-already-exists') return NextResponse.json({ error: 'An account already exists for this email.' }, { status: 409 });
  console.error('Admin user request failed', error);
  return NextResponse.json({ error: 'The account request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    if (!firebaseAdminConfigured) throw new Error('Firebase Admin credentials are not configured.');
    await verifyBearer(request, true);
    const page = await adminAuth().listUsers(1000);
    const profiles = await adminDb().collection('users').get();
    const roles = new Map(profiles.docs.map((item) => [item.id, item.data().role]));
    return NextResponse.json({ users: page.users.map((user) => ({
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      disabled: user.disabled,
      role: roles.get(user.uid) ?? (user.customClaims?.admin ? 'admin' : 'member'),
      createdAt: user.metadata.creationTime,
    })) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!firebaseAdminConfigured) throw new Error('Firebase Admin credentials are not configured.');
    await verifyBearer(request, true);
    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const displayName = String(body.displayName ?? '').trim();
    const password = String(body.password ?? '');
    const role = body.role === 'client' ? 'client' : 'member';
    if (!email || !displayName || password.length < 12) throw new Error('Name, email, and a password of at least twelve characters are required.');

    const user = await adminAuth().createUser({ email, displayName, password, emailVerified: false });
    await adminAuth().setCustomUserClaims(user.uid, { role });
    await adminDb().doc(`users/${user.uid}`).set({
      uid: user.uid,
      email,
      displayName,
      role,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ user: { uid: user.uid, email, displayName, role } }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
