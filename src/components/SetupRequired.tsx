import Link from 'next/link';
import { SoloriseLogo } from './SoloriseLogo';
import styles from './SetupRequired.module.css';

const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL?.replace(/\/$/, '');

export function SetupRequired() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <Link href="/" aria-label="Back to the Solorise landing page"><SoloriseLogo /></Link>
          <span className={styles.status}><i /> Unconfigured deployment</span>
        </header>

        <div className={styles.copy}>
          <span className={styles.eyebrow}>Bring your own backend</span>
          <h1>This Solorise workspace is not connected yet.</h1>
          <p>
            There is no shared login or public database behind this deployment. Solorise is self-hosted:
            every owner connects a private Firebase project and, optionally, their own AI provider (Ollama, Gemini, Claude, OpenAI, Groq, etc.).
          </p>
        </div>

        <div className={styles.pathGrid}>
          <section className={styles.pathCard}>
            <span>For visitors</span>
            <h2>Run your own copy</h2>
            <p>Clone the open-source project, read the setup guide, and deploy a workspace that belongs to you.</p>
            {repositoryUrl ? (
              <div className={styles.actions}>
                <a className={styles.primary} href={repositoryUrl} target="_blank" rel="noreferrer">Clone the repository ↗</a>
                <a className={styles.secondary} href={`${repositoryUrl}#readme`} target="_blank" rel="noreferrer">Read setup guide</a>
              </div>
            ) : (
              <div className={styles.command}>
                <code>git clone &lt;repository-url&gt;</code>
                <small>The deployer can set <code>NEXT_PUBLIC_REPOSITORY_URL</code> to add a direct GitHub link here.</small>
              </div>
            )}
          </section>

          <section className={styles.pathCard}>
            <span>For the deployer</span>
            <h2>Finish the connection</h2>
            <ol>
              <li><b>1</b><p>Copy <code>.env.example</code> to <code>.env.local</code> and add Firebase values.</p></li>
              <li><b>2</b><p>Enable Email/Password authentication and deploy <code>firestore.rules</code>.</p></li>
              <li><b>3</b><p>Run <code>npm run bootstrap:admin</code>, then restart or redeploy.</p></li>
            </ol>
          </section>
        </div>

        <footer className={styles.footer}>
          <p>Do not upload <code>.env.local</code> or a service-account JSON file.</p>
          <a href="https://firebase.google.com/docs/web/setup" target="_blank" rel="noreferrer">Firebase setup reference ↗</a>
        </footer>
      </section>
    </main>
  );
}
