import { useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, ChevronDown, Filter, Plus, Search, X } from 'lucide-react';
import type { Category, Commitment, CommitmentDraft, Priority, Status } from '../domain/types';
import { CATEGORIES, PRIORITY_LABELS, STATUSES } from '../domain/types';
import { filterCommitments, type ScheduleFilter, type SortKey } from '../domain/filter';
import { formatDate, isOverdue, localDateKey } from '../domain/dates';
import { Avatar } from '../components/ui/Avatar';
import { CategoryBadge, StatusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

interface Props {
  items: Commitment[];
  dateFormat: 'local' | 'iso';
  onCreate: (draft?: CommitmentDraft) => void;
  onOpen: (id: string) => void;
}

export function CommitmentsPage({ items, dateFormat, onCreate, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [schedule, setSchedule] = useState<ScheduleFilter>('all');
  const [sort, setSort] = useState<SortKey>('dueDate');
  const [priority, setPriority] = useState<Priority | 'all'>('all');

  const filtered = useMemo(
    () => filterCommitments(items, { query, status, category, schedule, sort, priority }),
    [items, query, status, category, schedule, sort, priority],
  );
  const clear = () => { setQuery(''); setStatus('all'); setCategory('all'); setSchedule('all'); setSort('dueDate'); setPriority('all'); };

  const today = localDateKey();

  return (
    <>
      <PageHeading
        eyebrow="THE LEDGER"
        title="Commitments"
        description="Every promise, one clear place to follow through."
        action={<button className="button button-primary" onClick={() => onCreate()}><Plus size={16} />Add commitment</button>}
      />
      <section className="panel ledger-panel">
        <div className="ledger-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search commitments"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a promise or person…"
            />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
          </label>
          <div className="filter-group">
            <label className="select-wrap">
              <Filter size={14} />
              <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as Status | 'all')}>
                <option value="all">All statuses</option>
                {STATUSES.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-wrap">
              <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value as Category | 'all')}>
                <option value="all">All categories</option>
                {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-wrap">
              <select aria-label="Filter by priority" value={String(priority)} onChange={(event) => setPriority(event.target.value === 'all' ? 'all' : Number(event.target.value) as Priority)}>
                <option value="all">All priorities</option>
                {([3, 2, 1, 0] as Priority[]).map((p) => <option key={p} value={String(p)}>{PRIORITY_LABELS[p]}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
        </div>

        <div className="schedule-filters" role="group" aria-label="Filter by deadline">
          <span>Show</span>
          {(['all', 'overdue', 'today', 'upcoming', 'no-date'] as ScheduleFilter[]).map((key) => (
            <button key={key} className={`filter-chip ${schedule === key ? 'filter-chip-active' : ''}`} onClick={() => setSchedule(key)}>
              {key === 'all' ? 'All' : key === 'overdue' ? 'Overdue' : key === 'today' ? 'Due today' : key === 'upcoming' ? 'Upcoming' : 'No deadline'}
              {key === 'overdue' && <span className="filter-dot filter-dot-red" />}
            </button>
          ))}
          <label className="sort-control">
            Sort by
            <select aria-label="Sort commitments" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="dueDate">Due date</option>
              <option value="createdAt">Recently added</option>
              <option value="status">Status</option>
              <option value="priority">Priority</option>
            </select>
            <ChevronDown size={13} />
          </label>
        </div>

        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Commitment</th>
                <th>Person</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Deadline</th>
                <th>Status</th>
                <th><span className="sr-only">Open details</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="ledger-row"
                  onClick={() => onOpen(item.id)}
                  tabIndex={0}
                  onKeyDown={(event) => event.key === 'Enter' && onOpen(item.id)}
                >
                  <td>
                    <div className="table-title">
                      <b>{item.title}</b>
                      {item.isSample && <span className="sample-mini">DEMO</span>}
                      {item.originalDueDate && item.originalDueDate !== item.dueDate && <small>Was {formatDate(item.originalDueDate, dateFormat)}</small>}
                    </div>
                    {item.tags.length > 0 && (
                      <div className="table-tags">
                        {item.tags.map((tag) => <span key={tag} className="tag-chip">{tag}</span>)}
                      </div>
                    )}
                  </td>
                  <td><span className="table-person"><Avatar name={item.customerName} size="sm" />{item.customerName}</span></td>
                  <td><CategoryBadge category={item.category} /></td>
                  <td>{item.priority > 0 && <span className={`priority-badge priority-${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>}</td>
                  <td className={isOverdue(item.dueDate, item.status, today) ? 'date-overdue' : ''}>{formatDate(item.dueDate, dateFormat)}</td>
                  <td><StatusBadge item={item} /></td>
                  <td><ArrowRight size={15} className="table-arrow" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <EmptyState
            icon={query || status !== 'all' || category !== 'all' || schedule !== 'all' || priority !== 'all' ? Search : CheckCheck}
            title={items.length ? 'No matching promises' : 'Your ledger starts with one promise'}
            body={items.length ? 'Try adjusting your search or filters.' : 'Keep the details you promised, the deadline, and the person all in one place.'}
            action={items.length
              ? <button className="button button-secondary button-sm" onClick={clear}>Clear filters</button>
              : <button className="button button-primary button-sm" onClick={() => onCreate()}><Plus size={14} />Create first commitment</button>}
          />
        )}
        <div className="ledger-bottom">
          <span>{filtered.length} of {items.filter((i) => !i.deletedAt).length} commitments</span>
          <button className="text-button" onClick={clear}>Reset filters</button>
        </div>
      </section>
    </>
  );
}
