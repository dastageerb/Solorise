import { NextResponse } from 'next/server';
import { verifyBearer } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

async function fetchWithTimeout(url: string, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'error', headers: { accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

function safeModelBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Enter a valid local model server URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Model server URLs must use HTTP or HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Model server URLs cannot contain credentials.');
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const allowedHosts = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '[::1]',
    ...(process.env.LOCAL_MODEL_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean),
  ]);
  if (!allowedHosts.has(hostname)) {
    throw new Error('Model server host is not allowed. Use localhost or add the exact host to LOCAL_MODEL_ALLOWED_HOSTS.');
  }
  return parsed.toString().replace(/\/$/, '');
}

export async function GET(request: Request) {
  try {
    await verifyBearer(request, true);
    const url = new URL(request.url);
    const requestedUrl = safeModelBaseUrl((url.searchParams.get('baseUrl') || 'http://localhost:11434').trim());

    // List of candidate endpoints to probe (e.g., probe localhost and fallback to 127.0.0.1 on Windows)
    const candidateBases = [requestedUrl];
    if (requestedUrl.includes('localhost')) {
      candidateBases.push(requestedUrl.replace('localhost', '127.0.0.1'));
    } else if (requestedUrl.includes('127.0.0.1')) {
      candidateBases.push(requestedUrl.replace('127.0.0.1', 'localhost'));
    }

    for (const base of candidateBases) {
      // 1. Probe Ollama native /api/tags
      try {
        const res = await fetchWithTimeout(`${base}/api/tags`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.models) && data.models.length > 0) {
            const models = data.models.map((m: Record<string, unknown>) => {
              const name = String(m.name || m.model || '');
              const sizeBytes = Number(m.size) || 0;
              const sizeGb = sizeBytes ? `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)}GB` : '';
              const details = (m.details && typeof m.details === 'object') ? (m.details as Record<string, unknown>) : null;
              const paramSize = details?.parameter_size ? String(details.parameter_size) : '';
              const capabilities = Array.isArray(m.capabilities) ? m.capabilities : [];
              const isEmbeddingOnly = capabilities.length === 1 && capabilities[0] === 'embedding';

              const metaParts: string[] = [];
              if (paramSize) metaParts.push(paramSize);
              if (sizeGb) metaParts.push(sizeGb);
              if (isEmbeddingOnly) metaParts.push('embedding only');

              const label = metaParts.length > 0 ? `${name} (${metaParts.join(' · ')})` : name;

              return {
                name,
                label,
                parameterSize: paramSize,
                size: sizeGb,
                isEmbeddingOnly,
              };
            });

            return NextResponse.json({
              success: true,
              endpoint: base,
              provider: 'ollama',
              models,
            });
          }
        }
      } catch {
        // continue to OpenAI-compatible probe
      }

      // 2. Probe OpenAI-compatible /v1/models (supported by Ollama, LM Studio, vLLM, LocalAI)
      try {
        const probeUrl = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
        const res = await fetchWithTimeout(probeUrl);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data) && data.data.length > 0) {
            const models = data.data.map((m: Record<string, unknown>) => {
              const name = String(m.id || '');
              const isEmbeddingOnly = name.toLowerCase().includes('embed');
              return {
                name,
                label: isEmbeddingOnly ? `${name} (embedding only)` : name,
                parameterSize: '',
                size: '',
                isEmbeddingOnly,
              };
            });

            return NextResponse.json({
              success: true,
              endpoint: base,
              provider: 'openai-compatible',
              models,
            });
          }
        }
      } catch {
        // continue
      }
    }

    return NextResponse.json(
      {
        success: false,
        models: [],
        error: `Could not detect models at ${requestedUrl}. Ensure Ollama is running ('ollama serve') or your local model server is online.`,
      },
      { status: 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query local models.';
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }
    if (message.includes('URL') || message.includes('HTTP') || message.includes('Model server')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
