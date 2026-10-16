'use client';

import { Icon } from './icons';
import { TEAM } from '@/lib/types';
import styles from './Rail.module.css';

interface RailProps {
  workspace: string;
  project: string;
}

/**
 * Left rail: workspace switcher, the project list, the team, then secondary
 * actions pinned to the bottom. Static chrome — none of it navigates in v1,
 * and it is deliberately not interactive-looking beyond hover.
 */
export function Rail({ workspace, project }: RailProps) {
  return (
    <aside className={styles.rail}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className={styles.brandName}>Solorise</span>
      </div>

      <div className={styles.switcher}>
        <span className={styles.switcherAvatar}>N</span>
        <span className={styles.switcherText}>
          <span className={styles.switcherTitle}>{workspace}</span>
          <span className={styles.switcherSub}>Team workspace</span>
        </span>
        <span className={styles.switcherChevron} aria-hidden="true">
          <Icon name="chevron" size={14} />
        </span>
      </div>

      <p className={styles.groupLabel}>Workspace</p>
      <nav className={styles.nav} aria-label="Projects">
        <a className={styles.navItem} href="#" aria-current="page">
          <span className={styles.navMark}>A</span>
          <span className={styles.navLabel}>{project}</span>
          <span className={styles.navDot} aria-hidden="true" />
        </a>
      </nav>

      <p className={styles.groupLabel}>
        Team
        <span className={styles.groupCount}>{TEAM.length}</span>
      </p>
      <ul className={styles.team}>
        {TEAM.map((member) => (
          <li key={member.id} className={styles.teamItem}>
            <span className="avatar avatar--sm" data-tone={member.tone} aria-hidden="true">
              {member.initials}
            </span>
            <span className={styles.teamName}>{member.name}</span>
          </li>
        ))}
      </ul>

      <div className={styles.foot}>
        <button className={styles.footItem} type="button">
          <span aria-hidden="true"><Icon name="plus" size={15} /></span>
          New issue
          <span className="kbd kbd--plain" aria-hidden="true">
            N
          </span>
        </button>
        <button className={styles.footItem} type="button">
          <span aria-hidden="true"><Icon name="command" size={15} /></span>
          Commands
          <span className="kbd kbd--plain" aria-hidden="true">
            ⌘K
          </span>
        </button>
        <p className={styles.savedNote}>
          <span className={styles.savedDot} aria-hidden="true" />
          Saved on this device
        </p>
      </div>
    </aside>
  );
}


