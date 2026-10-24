import type { Category, Commitment, Priority, Status } from './types';
import { isDueToday, isOverdue, localDateKey } from './dates';

export type ScheduleFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'no-date';
export type SortKey = 'dueDate' | 'createdAt' | 'status' | 'priority';

export function filterCommitments(items: Commitment[], options: {
  query?: string; status?: Status | 'all'; category?: Category | 'all'; schedule?: ScheduleFilter;
  sort?: SortKey; today?: string; priority?: Priority | 'all'; tags?: string[];
}): Commitment[] {
  const {
    query = '', status = 'all', category = 'all', schedule = 'all', sort = 'dueDate',
    today = localDateKey(), priority = 'all', tags = [],
  } = options;
  const needle = query.trim().toLocaleLowerCase();

  const filtered = items.filter((item) => {
    // Always exclude soft-deleted items from normal views
    if (item.deletedAt) return false;
    if (needle && !`${item.title} ${item.customerName} ${item.notes}`.toLocaleLowerCase().includes(needle)) return false;
    if (status !== 'all' && item.status !== status) return false;
    if (category !== 'all' && item.category !== category) return false;
    if (priority !== 'all' && item.priority !== priority) return false;
    if (tags.length > 0 && !tags.some((tag) => item.tags.includes(tag))) return false;
    if (schedule === 'overdue' && !isOverdue(item.dueDate, item.status, today)) return false;
    if (schedule === 'today' && !isDueToday(item.dueDate, item.status, today)) return false;
    if (schedule === 'upcoming' && !(item.dueDate && item.dueDate > today && item.status !== 'Completed' && item.status !== 'Cancelled')) return false;
    if (schedule === 'no-date' && item.dueDate !== null) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (sort === 'createdAt') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'status') return a.status.localeCompare(b.status) || a.title.localeCompare(b.title);
    if (sort === 'priority') return b.priority - a.priority || (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
    const aDate = a.dueDate ?? '9999-99-99';
    const bDate = b.dueDate ?? '9999-99-99';
    return aDate.localeCompare(bDate) || b.createdAt.localeCompare(a.createdAt);
  });
}
