/**
 * Data contract shared by the design layer and the (future) IndexedDB layer.
 * The UI reads only these shapes — see DESIGN.md §Handoff.
 */

/** The board is a five-lane flow with QA / Agent Testing. */
export type ColumnId = 'backlog' | 'progress' | 'qa' | 'review' | 'done';

/** 1 = highest, 4 = none. Renders as text (P1/P2/P3), never as a colour. */
export type Priority = 1 | 2 | 3 | 4;

export type TagTone = 'purple' | 'amber' | 'green' | 'blue' | 'red' | 'neutral';

export interface Tag {
  id: string;
  label: string;
  tone: TagTone;
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  tone: TagTone;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface StatusHistoryEntry {
  from: ColumnId | null;
  to: ColumnId;
  timestamp: string;
  actorName: string;
  actorId?: string;
}

export interface Task {
  id: string;
  /** Human key shown on the card, e.g. `AT-241`. Derived from the board prefix. */
  issueKey: string;
  title: string;
  /** One-line description shown under the title. */
  description: string;
  column: ColumnId;
  /** 1 = highest, 4 = none. Renders as text, never as a colour. */
  priority: 1 | 2 | 3 | 4;
  /** Tag ids, resolved against TAGS. */
  tagIds: string[];
  /** Member id, or null when unassigned. */
  assigneeId: string | null;
  checklist: ChecklistItem[];
  /** Local calendar date, `YYYY-MM-DD`, or null. Never a timestamp. */
  dueDate: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  commentCount?: number;
  statusHistory?: StatusHistoryEntry[];
}

export const COLUMN_LABEL: Record<ColumnId, string> = {
  backlog: 'Backlog',
  progress: 'In progress',
  qa: 'QA / Agent Testing',
  review: 'Review',
  done: 'Done',
};

export const COLUMN_ORDER: ColumnId[] = ['backlog', 'progress', 'qa', 'review', 'done'];

/**
 * Six fixed hues. Colour is allowed here because a tag is a *classification*
 * the eye scans for — not a status. See DESIGN.md §Colour.
 */
export const TAGS: Tag[] = [
  { id: 'product', label: 'Product', tone: 'amber' },
  { id: 'research', label: 'Research', tone: 'green' },
  { id: 'engineering', label: 'Engineering', tone: 'blue' },
  { id: 'design', label: 'Design', tone: 'purple' },
  { id: 'priority', label: 'Priority', tone: 'red' },
  { id: 'growth', label: 'Growth', tone: 'green' },
  { id: 'bug', label: 'Bug', tone: 'red' },
  { id: 'docs', label: 'Docs', tone: 'neutral' },
];

export const TEAM: Member[] = [
  { id: 'ava', name: 'Ava Morgan', initials: 'AM', tone: 'purple' },
  { id: 'jordan', name: 'Jordan Silva', initials: 'JS', tone: 'blue' },
  { id: 'mina', name: 'Mina Lee', initials: 'ML', tone: 'amber' },
  { id: 'kai', name: 'Kai Rivera', initials: 'KR', tone: 'green' },
];

export function tagById(id: string): Tag | undefined {
  return TAGS.find((t) => t.id === id);
}

export function memberById(id: string | null): Member | undefined {
  return id ? TEAM.find((m) => m.id === id) : undefined;
}

export function checklistProgress(task: Task): { done: number; total: number } {
  return {
    done: task.checklist.filter((c) => c.done).length,
    total: task.checklist.length,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local calendar date for `new Date()`, as `YYYY-MM-DD`. */
export function todayISO(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function formatLongDate(d: Date = new Date()): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Due-date text. Overdue is typographic (weight + colour), never a red alarm:
 * the card already carries enough colour from its tags.
 */
export function dueLabel(task: Task, today: string): { text: string; overdue: boolean } {
  if (!task.dueDate) return { text: '', overdue: false };
  if (task.dueDate < today) {
    const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(task.dueDate)) / 86_400_000));
    return { text: `${formatShortDate(task.dueDate)} · ${days}d late`, overdue: true };
  }
  return { text: formatShortDate(task.dueDate), overdue: false };
}

/** Sort inside a lane: priority, then due date (nulls last), then manual order. */
export function sortTasks(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.order - b.order;
}
