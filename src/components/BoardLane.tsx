'use client';

import type { DragEvent, ReactNode } from 'react';
import { Icon } from './icons';
import { COLUMN_LABEL, type ColumnId } from '@/lib/types';
import styles from './BoardLane.module.css';

interface BoardLaneProps {
  column: ColumnId;
  label: string;
  count: number;
  onAdd: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: () => void;
  activeDrop?: boolean;
  children: ReactNode;
}

export function BoardLane({
  column,
  label,
  count,
  onAdd,
  onDragOver,
  onDrop,
  activeDrop = false,
  children,
}: BoardLaneProps) {
  return (
    <section
      className={styles.lane}
      data-column={column}
      data-over={activeDrop}
      aria-label={COLUMN_LABEL[column]}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className={styles.head}>
        <span className={styles.status} data-status={column} aria-hidden="true" />
        <h2 className={styles.title}>{label}</h2>
        <span className={styles.count}>{count}</span>
        <button className={styles.add} type="button" onClick={onAdd} aria-label={`Add ticket to ${label}`}>
          <Icon name="plus" size={13} />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
