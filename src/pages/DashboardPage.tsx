import { useMemo, useState, type FormEvent } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BadgeCheck,
  CalendarDays, CheckCheck, Clock3, ChevronDown, Plus, ShieldCheck, Sparkles, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Commitment, CommitmentDraft, Database } from '../domain/types';
import { dateLabel, dayDistance, isDueToday, isOverdue, localDateKey } from '../domain/dates';
import { parseQuickEntry } from '../domain/parser';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';

function MetricCard({ icon: Icon, label, value, foot, tone, onClick }: { icon: LucideIcon; label: string; value: number; foot: string; tone: string; onClick: () => void }) {
  return (
    <button className="metric-card" type="button" onClick={onClick}>
      <div className="metric-top">
        <span className={`metric-icon metric-${tone}`}><Icon size={17} /></span>
        <span className="metric-trend"><ArrowUpRight size={14} /></span>
      </div>
      <span className="metric-label">{label}</span>
      <b className="metric-value">{value}</b>
      <span className="metric-foot">{foot}</span>
    </button>
  );
}

function dateAtLabelDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

export function CommitmentLine({ item, dateFormat, onClick }: { item: Commitment; dateFormat: 'local' | 'iso'; onClick: () => void }) {
  const overdue = isOverdue(item.dueDate, item.status);
  return (
    <button className={`commitment-line ${overdue ? 'line-overdue' : ''}`} type="button" onClick={onClick}>
      <span className={`line-marker ${overdue ? 'marker-overdue' : isDueToday(item.dueDate, item.status) ? 'marker-today' : ''}`} />
      <span className="line-main">
        <b>{item.title}{item.isSample && <span className="sample-inline">DEMO</span>}</b>
        <span>
          <Avatar name={item.customerName} size="sm" />
          {item.customerName}
          <span className="line-separator">·</span>
          <span className="line-category">{item.category}</span>
        </span>
      </span>
      <span className="line-end">
        <span className={overdue ? 'date-overdue' : isDueToday(item.dueDate, item.status) ? 'date-today' : ''}>
          {dateLabel(item.dueDate, localDateKey(), dateFormat)}
        </span>
        <ChevronDown size={15} className="line-chevron" />
      </span>
    </button>
  );
}

interface Props {
  db: Database;
  dateFormat: 'local' | 'iso';
  cloud: boolean;
  onCreate: (draft?: CommitmentDraft) => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  onLoadMockData?: () => void;
}

export function DashboardPage({ db, dateFormat, cloud, onCreate, onOpen, onViewAll, onLoadMockData }: Props) {
  const today = localDateKey();

  const { open, overdue, dueToday, attention, upcoming, completedRecently } = useMemo(() => {
    const open = db.commitments.filter((item) => !item.deletedAt && (item.status === 'Open' || item.status === 'In progress'));
    const overdue = open.filter((item) => isOverdue(item.dueDate, item.status, today));
    const dueToday = open.filter((item) => isDueToday(item.dueDate, item.status, today));
    const completedRecently = db.commitments.filter(
      (item) => !item.deletedAt && item.status === 'Completed' && item.completedAt && Date.now() - new Date(item.completedAt).getTime() <= 30 * 86_400_000
    ).length;
    const attention = open
      .filter((item) => item.dueDate && dayDistance(today, item.dueDate) <= 7)
      .sort((a, b) => {
        const rank = (item: Commitment) => isOverdue(item.dueDate, item.status, today) ? 0 : isDueToday(item.dueDate, item.status, today) ? 1 : 2;
        return rank(a) - rank(b) || (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
      }).slice(0, 5);
    const upcoming = open
      .filter((item) => item.dueDate && dayDistance(today, item.dueDate) > 7)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 4);
    return { open, overdue, dueToday, attention, upcoming, completedRecently };
  }, [db.commitments, today]);

  const [quickText, setQuickText] = useState('');
  const [quickError, setQuickError] = useState('');

  const quickSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!quickText.trim()) { setQuickError('Write a short promise to get started.'); return; }
    const parsed = parseQuickEntry(quickText, new Date(), db.settings.currency);
    const draft = parsed.draft;
    if (parsed.confidence === 'fallback') draft.title = quickText.trim().replace(/[.!?]+$/, '');
    if (parsed.confidence !== 'parsed') draft.notes = [draft.notes, `Original entry: ${quickText.trim()}`].filter(Boolean).join('\n');
    onCreate(draft);
    setQuickText('');
    setQuickError('');
  };

  return (
    <>
      <div className="welcome-strip">
        <div className="welcome-copy">
          <span className="welcome-kicker"><Zap size={14} /> YOUR COMMITMENT DESK</span>
          <h1>
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
            <span className="welcome-period">.</span>
          </h1>
          <p>A clear view of what you've promised and what needs attention.</p>
        </div>
        <div className="welcome-date">
          <CalendarDays size={16} />
          {new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        </div>
      </div>

      <form className="quick-capture" onSubmit={quickSubmit}>
        <div className="capture-icon"><Sparkles size={19} /></div>
        <div className="capture-field">
          <label htmlFor="quick-promise">Capture a promise in one sentence</label>
          <input
            id="quick-promise"
            value={quickText}
            onChange={(event) => { setQuickText(event.target.value); setQuickError(''); }}
            placeholder="e.g. Deliver 12 notebooks to Rahul tomorrow"
          />
          <small>We'll find a person, category and date when they're clear.</small>
          {quickError && <span className="field-error">{quickError}</span>}
        </div>
        <button className="button button-primary capture-button" type="submit">
          <Plus size={16} />Review promise
        </button>
      </form>

      {open.length === 0 && onLoadMockData && (
        <div className="mock-db-banner">
          <div className="mock-db-icon"><Sparkles size={20} /></div>
          <div className="mock-db-content">
            <b>Explore with a Mock Shop Database</b>
            <p>No active commitments? Populate realistic shop records (overdue delivery, payments due today, rescheduled orders, customer directory) with one click.</p>
          </div>
          <button className="button button-secondary button-sm" type="button" onClick={onLoadMockData}>
            <Plus size={14} />Load Mock Data
          </button>
        </div>
      )}

      <div className="metric-grid">
        <MetricCard icon={Activity} label="Open commitments" value={open.length} foot="Need follow-through" tone="green" onClick={onViewAll} />
        <MetricCard icon={Clock3} label="Due today" value={dueToday.length} foot={dueToday.length ? 'Make today count' : 'Nothing due today'} tone="blue" onClick={onViewAll} />
        <MetricCard icon={AlertTriangle} label="Overdue" value={overdue.length} foot={overdue.length ? 'Needs your attention' : 'You\'re all caught up'} tone={overdue.length ? 'amber' : 'green'} onClick={onViewAll} />
        <MetricCard icon={BadgeCheck} label="Completed recently" value={completedRecently} foot="In the last 30 days" tone="slate" onClick={onViewAll} />
      </div>

      <div className="dashboard-grid">
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title-row">
                <span className="section-icon attention-icon"><AlertTriangle size={16} /></span>
                <h2>Needs your attention</h2>
              </div>
              <p>Closest and most urgent promises first</p>
            </div>
            <button className="text-button" onClick={onViewAll}>View all <ArrowRight size={14} /></button>
          </div>
          {attention.length
            ? <div className="commitment-list">{attention.map((item) => <CommitmentLine key={item.id} item={item} dateFormat={dateFormat} onClick={() => onOpen(item.id)} />)}</div>
            : <EmptyState icon={ShieldCheck} title="Nothing urgent right now" body={open.length ? 'Open promises without deadlines are safe from false overdue flags.' : 'Add your first promise to see it here.'} action={!open.length && <button className="button button-secondary button-sm" onClick={() => onCreate()}><Plus size={14} />Add a promise</button>} />
          }
        </section>

        <section className="panel upcoming-panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title-row">
                <span className="section-icon upcoming-icon"><CalendarDays size={16} /></span>
                <h2>Coming up</h2>
              </div>
              <p>Promises after the next seven days</p>
            </div>
          </div>
          {upcoming.length
            ? (
              <div className="upcoming-list">
                {upcoming.map((item) => (
                  <button className="upcoming-row" key={item.id} onClick={() => onOpen(item.id)}>
                    <span className="upcoming-date">
                      <b>{dateAtLabelDay(item.dueDate!)}</b>
                      <small>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${item.dueDate}T00:00:00`))}</small>
                    </span>
                    <span className="upcoming-info">
                      <b>{item.title}</b>
                      <small>{item.customerName}</small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
            )
            : (
              <div className="upcoming-empty">
                <div className="calendar-illustration"><CalendarDays size={26} /><span>—</span></div>
                <b>Your next chapter is open</b>
                <p>Newly added promises will land here.</p>
              </div>
            )
          }
          <button className="panel-footer-link" onClick={onViewAll}>See all commitments <ArrowRight size={14} /></button>
        </section>
      </div>

      <section className="principle-card">
        <span className="principle-mark"><CheckCheck size={21} /></span>
        <div>
          <b>What makes a promise different?</b>
          <p>The original deadline stays in the timeline, even when plans change. That way, your promise and reality are always visible together.</p>
        </div>
        <span className="principle-link">Promise → reality <ArrowRight size={14} /></span>
      </section>

      <div className="dashboard-footnote">
        <span><ShieldCheck size={14} />{cloud ? 'Your data syncs to your private account.' : 'Your data stays on this device.'}</span>
        <span>Deadlines use your local calendar date.</span>
      </div>
    </>
  );
}
