import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const email = process.env.SOLORISE_ADMIN_EMAIL;
const password = process.env.SOLORISE_ADMIN_PASSWORD;
const displayName = process.env.SOLORISE_ADMIN_NAME || 'Workspace owner';

if (!email || !password) {
  console.error('Set SOLORISE_ADMIN_EMAIL and SOLORISE_ADMIN_PASSWORD before running this script.');
  process.exit(1);
}

const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
const credential = process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && key
  ? cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key })
  : applicationDefault();

if (!getApps().length) initializeApp({ credential });

const auth = getAuth();
let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password, displayName, disabled: false });
  console.log(`Updated existing account ${email}.`);
} catch (error) {
  if (error?.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({ email, password, displayName, emailVerified: true });
  console.log(`Created ${email}.`);
}

await auth.setCustomUserClaims(user.uid, { admin: true, role: 'admin' });
await getFirestore().doc(`users/${user.uid}`).set({
  uid: user.uid,
  email,
  displayName,
  role: 'admin',
  createdAt: FieldValue.serverTimestamp(),
}, { merge: true });

console.log('Admin claim applied. Sign out and back in if this account was already active.');
