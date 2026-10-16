import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { applicationDefault, cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function privateKey(): string | undefined {
  return process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
}

export const firebaseAdminConfigured = Boolean(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    || (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && privateKey()),
);

function adminApp(): App {
  if (getApps().length) return getApp();

  const key = privateKey();
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && key) {
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() });
  }

  throw new Error('Firebase Admin is not configured. Add server credentials to the deployment environment.');
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminDb() {
  return getFirestore(adminApp());
}

export async function verifyBearer(request: Request, requireAdmin = false) {
  const value = request.headers.get('authorization');
  if (!value?.startsWith('Bearer ')) throw new Error('UNAUTHENTICATED');
  const token = await adminAuth().verifyIdToken(value.slice(7));
  if (requireAdmin && token.admin !== true) throw new Error('FORBIDDEN');
  return token;
}

function encryptionKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) {
    throw new Error('APP_ENCRYPTION_KEY must be configured before storing secrets.');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!iv || !tag || !ciphertext) throw new Error('Stored secret is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export interface AiConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'deepseek' | 'ollama' | 'custom';
  model: string;
  key: string;
  baseUrl?: string;
}

export async function getAiConfig(): Promise<AiConfig | null> {
  // 1. Check systemSecrets/ai
  if (firebaseAdminConfigured) {
    const aiSnapshot = await adminDb().doc('systemSecrets/ai').get();
    if (aiSnapshot.exists) {
      const data = aiSnapshot.data();
      const provider = (data?.provider || 'gemini') as AiConfig['provider'];
      const encrypted = data?.encryptedKey;
      if (typeof encrypted === 'string' || provider === 'ollama') {
        const key = typeof encrypted === 'string' && encrypted ? decryptSecret(encrypted) : '';
        return {
          provider,
          model: String(data?.model || (provider === 'ollama' ? 'llama3.2' : 'gemini-2.5-flash')),
          key,
          baseUrl: typeof data?.baseUrl === 'string' && data.baseUrl ? data.baseUrl : provider === 'ollama' ? 'http://localhost:11434' : undefined,
        };
      }
    }

    // Fallback: systemSecrets/gemini
    const geminiSnapshot = await adminDb().doc('systemSecrets/gemini').get();
    if (geminiSnapshot.exists) {
      const encrypted = geminiSnapshot.data()?.encryptedKey;
      if (typeof encrypted === 'string') {
        return {
          provider: 'gemini',
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          key: decryptSecret(encrypted),
        };
      }
    }
  }

  // 2. Check environment variables
  if (process.env.AI_PROVIDER === 'ollama') {
    return {
      provider: 'ollama',
      model: process.env.AI_MODEL || 'llama3.2',
      key: process.env.AI_API_KEY || '',
      baseUrl: process.env.AI_BASE_URL || 'http://localhost:11434',
    };
  }

  if (process.env.AI_API_KEY) {
    return {
      provider: (process.env.AI_PROVIDER || 'openai') as AiConfig['provider'],
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      key: process.env.AI_API_KEY,
      baseUrl: process.env.AI_BASE_URL || undefined,
    };
  }

  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      key: process.env.GEMINI_API_KEY,
    };
  }

  return null;
}

export async function getGeminiKey(): Promise<string | null> {
  const config = await getAiConfig();
  return config?.key ?? null;
}
