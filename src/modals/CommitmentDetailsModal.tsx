import { useEffect, useState } from 'react';
import {
  Activity, ArrowDown, ArrowRight, ArrowUpRight,
  CalendarDays, CheckCircle2, Clock3, Pencil, Plus, Trash2, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Commitment, EventType, Status } from '../domain/types';
import { PRIORITY_LABELS } from '../domain/types';
import { formatDate, isOverdue } from '../domain/dates';
import { Avatar } from '../components/ui/Avatar';
import { StatusBadge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';

function eventIcon(type: EventType): LucideIcon {
  if (type === 'completed') return CheckCircle2;
  if (type === 'deadline_changed') return CalendarDays;
  if (type === 'progress') return Activity;
  if (type === 'reopened') return ArrowUpRight;
  return Clock3;
}

function money(value: number | null, currency: string): string | null {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

interface Props {
  item: Commitment;
  dateFormat: 'local' | 'iso';
  onClose: () => void;
  onEdit: () => void;
  onStatus: (status: Status, note?: string) => void;
  onProgress: (note: string) => void;
  onDelete: () => void;
}

export function CommitmentDetailsModal({ item, dateFormat, onClose, onEdit, onStatus, onProgress, onDelete }: Props) {
  const [progress, setProgress] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [showCompleteNote, setShowCompleteNote] = useState(false);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  const overdue = isOverdue(item.dueDate, item.status);
  const amount = money(item.amount, item.currency);

  const handleComplete = () => {
    onStatus('Completed', completionNote);
    setShowCompleteNote(false);
  };

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail-topline">
          <span className="eyebrow">PROMISE DETAILS</span>
          <div className="detail-top-actions">
            <IconButton label="Edit commitment" onClick={onEdit}><Pencil size={16} /></IconButton>
            <IconButton label="Delete commitment" className="danger-icon-button" onClick={onDelete}><Trash2 size={16} /></IconButton>
            <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
          </div>
        </div>

        <div className="detail-title-block">
          <h2 id="detail-title">{item.title}</h2>
          <div className="detail-person">
            <Avatar name={item.customerName} />
            <span>
              <b>{item.customerName}</b>
              <small>{item.category}{item.isSample && ' · DEMO DATA'}</small>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <StatusBadge item={item} />
            {item.priority > 0 && (
              <span className={`priority-badge priority-${item.priority}`}>
                {PRIORITY_LABELS[item.priority]} Priority
              </span>
            )}
          </div>
        </div>

        {item.tags && item.tags.length > 0 && (
          <div className="detail-tags" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
            {item.tags.map((t) => (
              <span key={t} className="tag-chip">{t}</span>
            ))}
          </div>
        )}

        <div className="promise-reality">
          <div className="promise-col">
            <span className="mini-label"><span className="promise-dot" />ORIGINAL PROMISE</span>
            <b>{formatDate(item.originalDueDate, dateFormat)}</b>
          </div>
          <div className="promise-arrow"><ArrowRight size={17} /></div>
          <div className="promise-col">
            <span className="mini-label">
              <span className={`reality-dot ${item.status === 'Completed' ? 'reality-complete' : ''}`} />
              CURRENT REALITY
            </span>
            <b className={overdue ? 'date-overdue' : ''}>{formatDate(item.dueDate, dateFormat)}</b>
            {item.originalDueDate !== item.dueDate && <small>Rescheduled</small>}
          </div>
        </div>

        <div className="detail-meta-grid">
          <div>
            <span>Created</span>
            <b>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.createdAt))}</b>
          </div>
          {amount && (
            <div>
              <span>Amount</span>
              <b>{amount}</b>
            </div>
          )}
          <div>
            <span>Status</span>
            <b>{item.status}</b>
          </div>
        </div>

        {item.notes && (
          <div className="detail-notes">
            <span className="mini-label">NOTES</span>
            <p>{item.notes}</p>
          </div>
        )}

        {item.status !== 'Completed' && item.status !== 'Cancelled' && (
          <div className="progress-entry">
            <label htmlFor="progress-note">Record progress</label>
            <div>
              <input
                id="progress-note"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && progress.trim()) {
                    onProgress(progress);
                    setProgress('');
                  }
                }}
                placeholder="A small update is enough…"
              />
              <button
                type="button"
                disabled={!progress.trim()}
                onClick={() => {
                  onProgress(progress);
                  setProgress('');
                }}
              >
                <Plus size={14} />Add note
              </button>
            </div>
          </div>
        )}

        {item.status === 'Completed' && item.completionNotes && (
          <div className="completion-note">
            <CheckCircle2 size={15} />
            <div>
              <b>Completion note</b>
              <p>{item.completionNotes}</p>
            </div>
          </div>
        )}

        <div className="timeline-heading">
          <div>
            <h3>Promise timeline</h3>
            <p>Every change stays attached to the original commitment.</p>
          </div>
        </div>

        <div className="detail-timeline">
          {item.history.map((event) => {
            const Icon = eventIcon(event.type);
            return (
              <div className="timeline-item" key={event.id}>
                <span className={`timeline-icon timeline-${event.type}`}><Icon size={14} /></span>
                <div className="timeline-entry">
                  <b>{event.message}</b>
                  <time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time>
                  {event.note && <p>{event.note}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="detail-footer">
          <div className="detail-secondary-actions">
            {item.status === 'Completed' || item.status === 'Cancelled' ? (
              <button className="button button-secondary button-sm" type="button" onClick={() => onStatus('Open')}>
                <ArrowUpRight size={14} />Reopen
              </button>
            ) : (
              <>
                <button
                  className="button button-secondary button-sm"
                  type="button"
                  onClick={() => onStatus(item.status === 'In progress' ? 'Open' : 'In progress')}
                >
                  {item.status === 'In progress' ? <ArrowDown size={14} /> : <Activity size={14} />}
                  {item.status === 'In progress' ? 'Mark open' : 'In progress'}
                </button>
                <button className="button button-ghost button-sm" type="button" onClick={() => onStatus('Cancelled')}>
                  Cancel promise
                </button>
              </>
            )}
          </div>
          {item.status !== 'Completed' && item.status !== 'Cancelled' && (
            <button
              className="button button-primary button-sm"
              type="button"
              onClick={() => setShowCompleteNote(!showCompleteNote)}
            >
              <CheckCircle2 size={15} />Complete
            </button>
          )}
        </div>

        {showCompleteNote && (
          <div className="complete-inline">
            <label htmlFor="completion-note">Add a completion note (optional)</label>
            <div>
              <input
                id="completion-note"
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="What happened in the end?"
              />
              <button className="button button-primary button-sm" type="button" onClick={handleComplete}>
                Confirm completion
              </button>
            </div>
          </div>
        )}

        <p className="detail-created">
          Last updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.updatedAt))}
        </p>
      </section>
    </div>
  );
}
