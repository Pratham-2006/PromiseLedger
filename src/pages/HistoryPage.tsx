import { useState } from 'react';
import { Activity, CalendarDays, CheckCircle2, Clock3, History, UsersRound, ChevronDown, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Database, EventType } from '../domain/types';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';

function eventLabel(type: EventType): string {
  const labels: Record<EventType, string> = {
    created: 'Promise created', deadline_changed: 'Deadline changed', status_changed: 'Status updated',
    progress: 'Progress note', completed: 'Completed', reopened: 'Reopened', edited: 'Details edited', deleted: 'Deleted',
  };
  return labels[type];
}

function eventIcon(type: EventType): LucideIcon {
  if (type === 'completed') return CheckCircle2;
  if (type === 'deadline_changed') return CalendarDays;
  if (type === 'progress') return Activity;
  if (type === 'reopened') return ArrowUpRight;
  return Clock3;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}

interface Props { db: Database; }

export function HistoryPage({ db }: Props) {
  const [customer, setCustomer] = useState('all');
  const [type, setType] = useState<EventType | 'all'>('all');

  const events = db.commitments
    .flatMap((item) => item.history.map((event) => ({ ...event, title: item.title, customerName: item.customerName })))
    .filter((event) => (customer === 'all' || event.customerName === customer) && (type === 'all' || event.type === type))
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHeading eyebrow="THE PAPER TRAIL" title="History" description="A transparent timeline of what was promised and what changed." />
      <section className="panel history-panel">
        <div className="history-toolbar">
          <div className="history-toolbar-copy">
            <span className="section-icon history-icon"><History size={16} /></span>
            <div>
              <b>Commitment activity</b>
              <small>{events.length} recorded events</small>
            </div>
          </div>
          <div className="history-filters">
            <label className="select-wrap">
              <UsersRound size={14} />
              <select aria-label="Filter history by customer" value={customer} onChange={(event) => setCustomer(event.target.value)}>
                <option value="all">All customers</option>
                {db.customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-wrap">
              <select aria-label="Filter history by event type" value={type} onChange={(event) => setType(event.target.value as EventType | 'all')}>
                <option value="all">All events</option>
                {(['created', 'deadline_changed', 'status_changed', 'progress', 'completed', 'reopened', 'edited', 'deleted'] as EventType[]).map((item) => (
                  <option key={item} value={item}>{eventLabel(item)}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
        </div>

        {events.length
          ? (
            <div className="activity-feed">
              {events.map((event) => {
                const Icon = eventIcon(event.type);
                return (
                  <div className="activity-event" key={event.id}>
                    <span className={`activity-icon activity-${event.type}`}><Icon size={15} /></span>
                    <div className="activity-body">
                      <div>
                        <b>{eventLabel(event.type)}</b>
                        <time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time>
                      </div>
                      <p>{event.message}</p>
                      {event.note && <blockquote>{event.note}</blockquote>}
                      <span className="activity-meta">
                        <Avatar name={event.customerName} size="sm" />
                        <b>{event.customerName}</b>
                        <span>·</span>
                        {event.title}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
          : <EmptyState icon={History} title="Your timeline starts here" body={db.commitments.length ? 'No events match those filters.' : 'Create a commitment and its history will be recorded here automatically.'} />
        }
      </section>
    </>
  );
}
