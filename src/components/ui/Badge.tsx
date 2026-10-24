import { AlertTriangle, Check, Clock3, Tag } from 'lucide-react';
import type { Category, Commitment } from '../../domain/types';
import { isDueToday, isOverdue, localDateKey } from '../../domain/dates';

export function StatusBadge({ item, today = localDateKey() }: { item: Commitment; today?: string }) {
  const overdue = isOverdue(item.dueDate, item.status, today);
  const dueToday = isDueToday(item.dueDate, item.status, today);

  if (overdue) return <span className="badge badge-overdue"><AlertTriangle size={13} /> Overdue</span>;
  if (dueToday) return <span className="badge badge-today"><Clock3 size={13} /> Due today</span>;

  const className =
    item.status === 'Completed' ? 'badge badge-complete' :
    item.status === 'Cancelled' ? 'badge badge-cancelled' :
    item.status === 'In progress' ? 'badge badge-progress' : 'badge badge-open';

  return (
    <span className={className}>
      {item.status === 'Completed' && <Check size={13} />}
      {item.status}
    </span>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="category-badge">
      <Tag size={12} />{category}
    </span>
  );
}
