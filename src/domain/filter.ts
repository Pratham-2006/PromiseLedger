import type { Category, Commitment, Status } from './types';
import { isDueToday, isOverdue, localDateKey } from './dates';

export type ScheduleFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'no-date';
export type SortKey = 'dueDate' | 'createdAt' | 'status';

export function filterCommitments(items: Commitment[], options: {
  query?: string; status?: Status | 'all'; category?: Category | 'all'; schedule?: ScheduleFilter;
  sort?: SortKey; today?: string;
}): Commitment[] {
  const { query = '', status = 'all', category = 'all', schedule = 'all', sort = 'dueDate', today = localDateKey() } = options;
  const needle = query.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => {
    if (needle && !`${item.title} ${item.customerName} ${item.notes}`.toLocaleLowerCase().includes(needle)) return false;
    if (status !== 'all' && item.status !== status) return false;
    if (category !== 'all' && item.category !== category) return false;
    if (schedule === 'overdue' && !isOverdue(item.dueDate, item.status, today)) return false;
    if (schedule === 'today' && !isDueToday(item.dueDate, item.status, today)) return false;
    if (schedule === 'upcoming' && !(item.dueDate && item.dueDate > today && item.status !== 'Completed' && item.status !== 'Cancelled')) return false;
    if (schedule === 'no-date' && item.dueDate !== null) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    if (sort === 'createdAt') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'status') return a.status.localeCompare(b.status) || a.title.localeCompare(b.title);
    const aDate = a.dueDate ?? '9999-99-99';
    const bDate = b.dueDate ?? '9999-99-99';
    return aDate.localeCompare(bDate) || b.createdAt.localeCompare(a.createdAt);
  });
}
