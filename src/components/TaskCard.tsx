'use client';

import type { DragEvent } from 'react';
import { Icon } from './icons';
import { checklistProgress, dueLabel, tagById, type Task } from '@/lib/types';
import type { ProjectTicket } from '@/lib/firebase/models';
import styles from './TaskCard.module.css';

interface TaskCardProps {
  task: Task;
  today: string;
  menuOpen: boolean;
  onOpen: (task: Task) => void;
  onOpenMenu: (task: Task, trigger: HTMLElement) => void;
  onCycleColumn: (task: Task) => void;
  onToggleChecklistItem: (task: Task, itemId: string) => void;
  canEdit?: boolean;
  kind?: 'bug' | 'feature' | 'change';
  initials?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function TaskCard({
  task,
  today,
  menuOpen,
  onOpen,
  onOpenMenu,
  onCycleColumn,
  canEdit = true,
  kind = 'feature',
  initials = '?',
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const progress = checklistProgress(task);
  const due = dueLabel(task, today);
  const firstTag = task.tagIds.map(tagById).find(Boolean);
  const projectTask = task as Partial<ProjectTicket>;
  const department = projectTask.department || firstTag?.label;
  const clientVisible = projectTask.clientVisible === true;

  const startDrag = (event: DragEvent<HTMLElement>) => {
    if (!canEdit) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    onDragStart?.();
  };

  return (
    <article
      className={styles.card}
      data-open={menuOpen}
      draggable={canEdit}
      onDragStart={startDrag}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(task);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${task.issueKey}: ${task.title}`}
    >
      <div className={styles.keyRow}>
        <span className={styles.typeIcon} data-kind={kind} aria-label={kind}>{kind === 'bug' ? '✣' : kind === 'change' ? '⇄' : '✦'}</span>
        <span className={styles.key}>{task.issueKey}</span>
        {clientVisible && <span className={styles.via}>via client</span>}
        <button
          type="button"
          className={styles.move}
          onClick={(e) => {
            e.stopPropagation();
            onCycleColumn(task);
          }}
          disabled={!canEdit}
          title={canEdit ? 'Move to the next column' : 'Client view is read-only'}
          aria-label={`Move ${task.issueKey} to the next column`}
        >→</button>
        {canEdit && (
          <button
            type="button"
            className={styles.menu}
            aria-label={`Actions for ${task.issueKey}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu(task, event.currentTarget);
            }}
          >···</button>
        )}
      </div>

      <div className={styles.title}>
        {task.title}
      </div>

      <footer className={styles.footer}>
        {department && <span className={styles.department}>{department}</span>}
        <span className={styles.priority} aria-label={`Priority ${task.priority}`}>{task.priority < 4 ? '▮'.repeat(4 - task.priority) : '▮'}</span>
        {progress.total > 0 && <span className={styles.meta}><Icon name="checklist" size={11} /> {progress.done}/{progress.total}</span>}
        {due.text && <span className={styles.meta} data-overdue={due.overdue}><Icon name="calendar" size={11} /> {due.text}</span>}
        {typeof task.commentCount === 'number' && task.commentCount > 0 && (
          <span className={styles.meta} title={`${task.commentCount} comments`}>
            <Icon name="comment" size={11} /> {task.commentCount}
          </span>
        )}
        <span className={styles.assignee} data-initials={initials}>{initials}</span>
      </footer>
    </article>
  );
}
