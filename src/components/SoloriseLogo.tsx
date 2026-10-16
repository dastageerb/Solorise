import styles from './SoloriseLogo.module.css';

export function SoloriseLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.logo} data-compact={compact}>
      <span className={styles.mark} aria-hidden="true"><i /><i /></span>
      {!compact && <b>Solorise</b>}
    </span>
  );
}
