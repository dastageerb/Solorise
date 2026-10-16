'use client';

import { useState } from 'react';
import { Icon } from './icons';
import { TEAM } from '@/lib/types';
import styles from './TopBar.module.css';

interface TopBarProps {
  workspace: string;
  project: string;
}

/**
 * Top bar: breadcrumb, save state, search, presence avatars.
 *
 * Search is local state and does not filter yet — there is one screen, and a
 * field that silently does nothing is worse than one that is visibly inert.
 * Wire it to the board in BoardView when filtering lands.
 */
export function TopBar({ workspace, project }: TopBarProps) {
  const [search, setSearch] = useState('');

  return (
    <header className={styles.head}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <span>{workspace}</span>
        <span className="sep" aria-hidden="true">
          /
        </span>
        <span className="current">{project}</span>
        <span className={styles.crumbChevron} aria-hidden="true">
          <Icon name="chevron" size={14} />
        </span>
      </nav>

      <p className={styles.saved}>
        <span className={styles.savedDot} aria-hidden="true" />
        All changes saved locally
      </p>

      <div className={`search ${styles.search}`}>
        <span className="search-icon" aria-hidden="true">
          <Icon name="search" size={16} />
        </span>
        <label className="u-sr" htmlFor="board-search">
          Search anything
        </label>
        <input
          id="board-search"
          className="input"
          type="search"
          placeholder="Search anything…"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="kbd kbd--plain" aria-hidden="true">
          ⌘K
        </span>
      </div>

      <div className={styles.presence}>
        <div className="avatar-stack">
          {TEAM.slice(0, 3).map((m) => (
            <span key={m.id} className="avatar" data-tone={m.tone} title={m.name}>
              {m.initials}
            </span>
          ))}
        </div>
        <span className={`avatar ${styles.more}`} title="More teammates">
          +1
        </span>
      </div>
    </header>
  );
}


