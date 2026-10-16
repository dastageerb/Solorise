import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, encryptSecret, firebaseAdminConfigured, getAiConfig, verifyBearer } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed.';
  if (message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (message === 'FORBIDDEN') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  if (message === 'Firebase Admin credentials are not configured.') return NextResponse.json({ error: message }, { status: 503 });
  if (message.includes('API key') || message.includes('model') || message.includes('Remove')) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error('AI key request failed', error);
  return NextResponse.json({ error: 'The AI configuration request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await verifyBearer(request, true);
    const config = await getAiConfig();
    const envKey = Boolean(process.env.AI_API_KEY || process.env.GEMINI_API_KEY);
    return NextResponse.json({
      configured: Boolean(config),
      source: envKey ? 'environment' : config ? 'encrypted-store' : null,
      provider: config?.provider ?? 'gemini',
      model: config?.model ?? (process.env.AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
      baseUrl: config?.baseUrl ?? '',
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (!firebaseAdminConfigured) throw new Error('Firebase Admin credentials are not configured.');
    const admin = await verifyBearer(request, true);
    const body = await request.json();
    const provider = String(body.provider ?? 'gemini').trim().toLowerCase();
    const model = String(body.model ?? '').trim();
    const key = String(body.key ?? '').trim();
    const baseUrl = String(body.baseUrl ?? '').trim();

    const existingConfig = await getAiConfig();
    let finalKey = key;
    if (!finalKey && existingConfig && existingConfig.key && (provider === existingConfig.provider || provider === 'ollama')) {
      finalKey = existingConfig.key;
    }

    if (provider !== 'ollama' && (!finalKey || finalKey.length < 5)) {
      throw new Error('Enter a valid API key.');
    }
    if (!model) throw new Error('Specify an AI model.');

    const encryptedKey = finalKey ? encryptSecret(finalKey) : null;
    await adminDb().doc('systemSecrets/ai').set({
      provider,
      model,
      encryptedKey,
      baseUrl: baseUrl || (provider === 'ollama' ? 'http://localhost:11434' : null),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.uid,
    });

    if (provider === 'gemini' && encryptedKey) {
      await adminDb().doc('systemSecrets/gemini').set({
        encryptedKey,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
      });
    }

    return NextResponse.json({ configured: true, source: 'encrypted-store', provider, model });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    await verifyBearer(request, true);
    if (process.env.AI_API_KEY || process.env.GEMINI_API_KEY) {
      throw new Error('Remove AI_API_KEY / GEMINI_API_KEY from the deployment environment to disable it.');
    }
    await adminDb().doc('systemSecrets/ai').delete();
    await adminDb().doc('systemSecrets/gemini').delete();
    return NextResponse.json({ configured: false, source: null });
  } catch (error) { return failure(error); }
}
