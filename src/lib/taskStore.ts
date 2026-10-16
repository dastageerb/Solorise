import { COLUMN_ORDER, type ColumnId, type Task } from '@/lib/types';

export interface BoardStats {
  total: number;
  open: number;
  done: number;
  perColumn: Record<ColumnId, number>;
}

export function deriveStats(tasks: Task[]): BoardStats {
  const perColumn = COLUMN_ORDER.reduce((counts, column) => {
    counts[column] = tasks.filter((task) => task.column === column).length;
    return counts;
  }, {} as Record<ColumnId, number>);
  return {
    total: tasks.length,
    open: tasks.filter((task) => task.column !== 'done').length,
    done: perColumn.done,
    perColumn,
  };
}

export function issuePrefix(projectName: string): string {
  const words = projectName.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const letters = projectName.replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 2) || 'TK').toUpperCase();
}

export function nextIssueKey(tasks: Task[], prefix: string): string {
  const highest = tasks.reduce((maximum, task) => {
    if (!task.issueKey.startsWith(`${prefix}-`)) return maximum;
    const number = Number(task.issueKey.slice(prefix.length + 1));
    return Number.isFinite(number) ? Math.max(maximum, number) : maximum;
  }, 0);
  return `${prefix}-${highest + 1}`;
}
