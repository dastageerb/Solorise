'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { ProductPageShell } from './ProductPageShell';
import styles from './SettingsScreen.module.css';

type ProviderId = 'gemini' | 'ollama' | 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'openrouter' | 'custom';

interface AiStatus {
  configured: boolean;
  source: 'environment' | 'encrypted-store' | null;
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  hasKey?: boolean;
}

interface DetectedModel {
  name: string;
  label: string;
  parameterSize?: string;
  size?: string;
  isEmbeddingOnly?: boolean;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  ollama: 'llama3.2',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-chat',
  openrouter: 'meta-llama/llama-3.3-70b-instruct',
  custom: 'gpt-4o-mini',
};

const PROVIDER_NAMES: Record<ProviderId, string> = {
  ollama: 'Ollama (Local Models)',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  custom: 'Custom / Local (vLLM, LM Studio, etc.)',
};

export function SettingsScreen() {
  const { getToken, isAdmin } = useAuth();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [provider, setProvider] = useState<ProviderId>('ollama');
  const [model, setModel] = useState('llama3.2');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Local model auto-detection
  const [detectedModels, setDetectedModels] = useState<DetectedModel[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<{ state: 'success' | 'warning'; message: string } | null>(null);
  const [manualModelInput, setManualModelInput] = useState(false);

  const isInitialLoaded = useRef(false);

  const detectLocalModels = useCallback(async (targetUrl?: string) => {
    setDetecting(true);
    setDetectStatus(null);
    try {
      const token = await getToken();
      const queryUrl = targetUrl || 'http://localhost:11434';
      const response = await fetch(`/api/admin/local-models?baseUrl=${encodeURIComponent(queryUrl)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setDetectedModels([]);
        setDetectStatus({
          state: 'warning',
          message: data.error || `Could not find running models at ${queryUrl}. Ensure Ollama is active ('ollama serve').`,
        });
        return;
      }

      const models: DetectedModel[] = data.models || [];
      setDetectedModels(models);

      const completionModels = models.filter((m) => !m.isEmbeddingOnly);
      const availableModels = completionModels.length > 0 ? completionModels : models;

      if (availableModels.length > 0) {
        setDetectStatus({
          state: 'success',
          message: `✓ Connected to ${data.provider === 'ollama' ? 'Ollama' : 'local server'} at ${data.endpoint}. Found ${availableModels.length} model${availableModels.length > 1 ? 's' : ''}.`,
        });
        setModel(availableModels[0].name);
        setManualModelInput(false);
      } else {
        setDetectStatus({
          state: 'warning',
          message: `Connected to ${queryUrl}, but no models were found. Run 'ollama pull llama3.2' in terminal.`,
        });
      }
    } catch (caught) {
      setDetectedModels([]);
      setDetectStatus({
        state: 'warning',
        message: caught instanceof Error ? caught.message : 'Failed to query local models.',
      });
    } finally {
      setDetecting(false);
    }
  }, [getToken]);

  const load = useCallback(async (isInitial = false) => {
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/ai-key', { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setStatus(payload);

      if (isInitial) {
        if (payload.configured && payload.provider) {
          setProvider(payload.provider);
          setModel(payload.model || DEFAULT_MODELS[payload.provider as ProviderId] || 'llama3.2');
          if (payload.baseUrl) setBaseUrl(payload.baseUrl);
          if (payload.provider === 'ollama') {
            void detectLocalModels(payload.baseUrl || 'http://localhost:11434');
          }
        } else {
          // Default unconfigured: start with Ollama and probe localhost
          setProvider('ollama');
          setModel('llama3.2');
          setBaseUrl('http://localhost:11434');
          void detectLocalModels('http://localhost:11434');
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read AI status.');
    }
  }, [getToken, detectLocalModels]);

  useEffect(() => {
    if (!isInitialLoaded.current) {
      isInitialLoaded.current = true;
      void load(true);
    }
  }, [load]);

  const handleProviderChange = (newProvider: ProviderId) => {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider]);
    setDetectedModels([]);
    setDetectStatus(null);
    setManualModelInput(false);

    if (newProvider === 'ollama') {
      const targetUrl = baseUrl.trim() || 'http://localhost:11434';
      if (!baseUrl) setBaseUrl('http://localhost:11434');
      void detectLocalModels(targetUrl);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/ai-key', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider,
          model,
          key: key.trim(),
          baseUrl: provider === 'ollama' ? (baseUrl.trim() || 'http://localhost:11434') : baseUrl.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setKey('');
      setNotice(`AI configuration (${PROVIDER_NAMES[provider]}) saved.`);
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save AI configuration.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/ai-key', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setNotice('Stored AI configuration removed.');
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove configuration.');
    } finally {
      setBusy(false);
    }
  };

  const isLocalProvider = provider === 'ollama' || provider === 'custom';

  return (
    <ProductPageShell title="Workspace settings" description="Connect the services owned by this deployment. Secrets stay server-side and every clone controls its own data.">
      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span>Firebase</span>
            <strong data-ready>Connected</strong>
          </div>
          <h2>Data and authentication</h2>
          <p>Solorise is connected to <b>{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</b>. Firestore persistent cache is enabled with multi-tab synchronization.</p>
          <dl>
            <div><dt>Project</dt><dd>{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</dd></div>
            <div><dt>Local cache</dt><dd>IndexedDB · multi-tab</dd></div>
            <div><dt>Security</dt><dd>Auth + Firestore rules</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span>AI Provider</span>
            <strong data-ready={status?.configured}>{status?.configured ? 'Configured' : 'Not configured'}</strong>
          </div>
          <h2>AI ticket triage</h2>
          <p>Configure any AI provider or local Ollama model for automated ticket triage. Keys are encrypted with AES-256-GCM and never exposed to the client.</p>

          {status?.configured && (
            <dl>
              <div><dt>Provider</dt><dd>{PROVIDER_NAMES[status.provider] ?? status.provider}</dd></div>
              <div><dt>Model</dt><dd>{status.model}</dd></div>
              {status.baseUrl && <div><dt>Base URL</dt><dd>{status.baseUrl}</dd></div>}
              <div><dt>Source</dt><dd>{status.source === 'environment' ? 'Deployment environment' : 'Encrypted Firestore secret'}</dd></div>
            </dl>
          )}

          {isAdmin && status?.source !== 'environment' && (
            <form onSubmit={save}>
              <label>
                AI Provider
                <select value={provider} onChange={(event) => handleProviderChange(event.target.value as ProviderId)}>
                  <option value="ollama">Ollama (Local Models)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="groq">Groq (Ultra-fast)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="custom">Custom / Local (vLLM, LM Studio, etc.)</option>
                </select>
              </label>

              {provider === 'ollama' && (
                <label>
                  Ollama Server URL
                  <div className={styles.inputWithAction}>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="http://localhost:11434"
                    />
                    <button
                      type="button"
                      className={styles.detectButton}
                      disabled={detecting}
                      onClick={() => detectLocalModels(baseUrl.trim() || 'http://localhost:11434')}
                    >
                      {detecting ? 'Detecting…' : '↻ Auto-detect models'}
                    </button>
                  </div>
                </label>
              )}

              {provider === 'custom' && (
                <label>
                  Custom Base URL
                  <div className={styles.inputWithAction}>
                    <input
                      required
                      type="url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="http://localhost:11434/v1"
                    />
                    <button
                      type="button"
                      className={styles.detectButton}
                      disabled={detecting || !baseUrl}
                      onClick={() => detectLocalModels(baseUrl.trim())}
                    >
                      {detecting ? 'Detecting…' : '↻ Auto-detect'}
                    </button>
                  </div>
                </label>
              )}

              {isLocalProvider && detectedModels.length > 0 && !manualModelInput ? (
                <label>
                  <div className={styles.modelHeader}>
                    <span>Select local model ({detectedModels.length} detected)</span>
                    <button
                      type="button"
                      className={styles.modelToggleBtn}
                      onClick={() => setManualModelInput(true)}
                    >
                      Enter name manually
                    </button>
                  </div>
                  <select
                    value={model}
                    onChange={(event) => {
                      if (event.target.value === '__custom__') {
                        setManualModelInput(true);
                      } else {
                        setModel(event.target.value);
                      }
                    }}
                  >
                    {detectedModels.map((m) => (
                      <option key={m.name} value={m.name} disabled={m.isEmbeddingOnly}>
                        {m.label}
                      </option>
                    ))}
                    <option value="__custom__">+ Enter custom name manually…</option>
                  </select>
                </label>
              ) : (
                <label>
                  <div className={styles.modelHeader}>
                    <span>Model name</span>
                    {isLocalProvider && detectedModels.length > 0 && (
                      <button
                        type="button"
                        className={styles.modelToggleBtn}
                        onClick={() => setManualModelInput(false)}
                      >
                        Pick from detected models ({detectedModels.length})
                      </button>
                    )}
                  </div>
                  <input
                    required
                    type="text"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={DEFAULT_MODELS[provider]}
                  />
                </label>
              )}

              {isLocalProvider && detectStatus && (
                <div className={styles.modelDetectStatus} data-state={detectStatus.state}>
                  {detectStatus.message}
                </div>
              )}

              <label>
                {provider === 'ollama' ? (
                  <>API Key <em>(Optional for local Ollama)</em></>
                ) : status?.configured ? (
                  'Replace API key (leave empty to keep current)'
                ) : (
                  'API Key'
                )}
                <input
                  required={provider !== 'ollama' && !status?.configured}
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder={
                    provider === 'ollama'
                      ? 'Optional (leave blank for local Ollama)'
                      : provider === 'gemini'
                      ? 'AIza…'
                      : provider === 'anthropic'
                      ? 'sk-ant-…'
                      : 'sk-…'
                  }
                />
              </label>

              <div>
                <button disabled={busy}>
                  {busy ? 'Saving…' : status?.configured ? 'Update AI configuration' : 'Save configuration'}
                </button>
                {status?.configured && <button type="button" disabled={busy} onClick={remove}>Remove configuration</button>}
              </div>
            </form>
          )}

          {!isAdmin && <p className={styles.readonly}>Only a workspace admin can change the AI configuration.</p>}
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <div className={styles.cardHead}>
            <span>Deployment</span>
            <strong>Self-hosted</strong>
          </div>
          <h2>Safe defaults for an open-source project</h2>
          <ul>
            <li><b>Public:</b> Firebase web configuration under <code>NEXT_PUBLIC_*</code>.</li>
            <li><b>Private:</b> Firebase Admin credentials and <code>APP_ENCRYPTION_KEY</code>.</li>
            <li><b>Local Models:</b> Direct support for local Ollama without sending data to external APIs.</li>
            <li><b>Blocked:</b> direct browser access to <code>systemSecrets</code> through Firestore rules.</li>
            <li><b>Ignored:</b> all local environment files and service-account JSON files.</li>
          </ul>
        </section>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.notice}>{notice}</p>}
    </ProductPageShell>
  );
}
