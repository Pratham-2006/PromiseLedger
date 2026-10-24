import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck,
  CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, CircleHelp,
  Clock3, Download, Filter, History, LayoutDashboard, ListFilter, Menu,
  MoreHorizontal, Pencil, Plus, Search, Settings2, ShieldCheck, Sparkles, Tag,
  Trash2, UserRound, UsersRound, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createCommitment, deleteCommitment, emptyDatabase, recordProgress, setStatus, updateCommitment, updateCustomer } from './domain/commitments';
import { dateLabel, dayDistance, formatDate, isDueToday, isOverdue, localDateKey } from './domain/dates';
import { filterCommitments, type ScheduleFilter, type SortKey } from './domain/filter';
import { parseQuickEntry } from './domain/parser';
import { addSampleData, removeSampleData } from './domain/sampleData';
import { exportDatabase, validateImport } from './domain/storage';
import { CATEGORIES, EMPTY_DRAFT, STATUSES, type Category, type Commitment, type CommitmentDraft, type Customer, type Database, type EventType, type Status } from './domain/types';
import { useWorkspace } from './data/WorkspaceProvider';

type Page = 'dashboard' | 'commitments' | 'customers' | 'history' | 'settings';
type ModalState = { mode: 'create' | 'edit'; id?: string; draft: CommitmentDraft } | null;

const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'commitments', label: 'Commitments', icon: ListFilter },
  { id: 'customers', label: 'Customers', icon: UsersRound },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

const pageTitles: Record<Page, string> = {
  dashboard: 'Good morning', commitments: 'Commitments', customers: 'Customers', history: 'History', settings: 'Settings',
};

function toDraft(item: Commitment): CommitmentDraft {
  return { title: item.title, customerName: item.customerName, category: item.category, dueDate: item.dueDate ?? '', amount: item.amount === null ? '' : String(item.amount), currency: item.currency, notes: item.notes };
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function money(value: number | null, currency: string): string | null {
  if (value === null) return null;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString()}`; }
}

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

function StatusBadge({ item, today = localDateKey() }: { item: Commitment; today?: string }) {
  const overdue = isOverdue(item.dueDate, item.status, today);
  const dueToday = isDueToday(item.dueDate, item.status, today);
  if (overdue) return <span className="badge badge-overdue"><AlertTriangle size={13} /> Overdue</span>;
  if (dueToday) return <span className="badge badge-today"><Clock3 size={13} /> Due today</span>;
  const className = item.status === 'Completed' ? 'badge badge-complete' : item.status === 'Cancelled' ? 'badge badge-cancelled' : item.status === 'In progress' ? 'badge badge-progress' : 'badge badge-open';
  return <span className={className}>{item.status === 'Completed' && <Check size={13} />}{item.status}</span>;
}

function CategoryBadge({ category }: { category: Category }) {
  return <span className="category-badge"><Tag size={12} />{category}</span>;
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar avatar-${size}`} aria-hidden="true">{initials(name)}</span>;
}

function IconButton({ label, onClick, children, className = '' }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function EmptyState({ icon: Icon = CircleHelp, title, body, action }: { icon?: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={23} /></span><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function App() {
  const { db, apply, mode, email, syncState, error: storageError, dismissError, signOut, retrySync, reloadCloud, overwriteCloud } = useWorkspace();
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');

  const openCreate = (draft?: CommitmentDraft, customerName?: string) => {
    const value = draft ?? EMPTY_DRAFT;
    setModal({ mode: 'create', draft: { ...EMPTY_DRAFT, ...value, currency: value.amount ? value.currency : db.settings.currency, ...(customerName ? { customerName } : {}) } });
  };
  const openEdit = (item: Commitment) => setModal({ mode: 'edit', id: item.id, draft: toDraft(item) });
  const onSaveDraft = (draft: CommitmentDraft) => {
    if (modal?.mode === 'edit' && modal.id) apply((current) => updateCommitment(current, modal.id!, draft));
    else apply((current) => createCommitment(current, draft));
    setModal(null);
    setNotice(modal?.mode === 'edit' ? 'Commitment updated.' : 'Promise recorded.');
  };
  const selectedCommitment = db.commitments.find((item) => item.id === selectedCommitmentId) ?? null;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-mobile-open' : ''}`}>
      <div className="brand-lockup"><span className="brand-mark"><CheckCheck size={19} strokeWidth={2.4} /></span><span>promise<span className="brand-ledger">ledger</span></span><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-chip"><span className="workspace-dot" /><span>My business</span><ChevronDown size={15} /></div>
      <nav className="side-nav" aria-label="Main navigation">
        {navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${page === id ? 'nav-item-active' : ''}`} onClick={() => { setPage(id); setMobileMenu(false); }}><Icon size={18} strokeWidth={page === id ? 2.3 : 1.8} /><span>{label}</span>{id === 'commitments' && db.commitments.filter((item) => item.status !== 'Completed' && item.status !== 'Cancelled').length > 0 && <span className="nav-count">{db.commitments.filter((item) => item.status !== 'Completed' && item.status !== 'Cancelled').length}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><span className="tip-icon"><Sparkles size={15} /></span><strong>A promise remembered</strong><p>is trust earned.</p></div>
        <div className="profile-row"><Avatar name={email || 'My business'} size="sm" /><span><b>{email || 'My business'}</b><small>{mode === 'cloud' ? 'Cloud workspace' : 'Local workspace'}</small></span><MoreHorizontal size={17} className="profile-more" /></div>
      </div>
    </aside>

    {mobileMenu && <button aria-label="Close navigation overlay" className="mobile-scrim" onClick={() => setMobileMenu(false)} />}
    <div className="main-area">
      <header className="topbar">
        <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div className="breadcrumb"><span>Workspace</span><span className="crumb-sep">/</span><b>{page === 'dashboard' ? 'Dashboard' : pageTitles[page]}</b></div>
        <div className="topbar-actions"><span className={`local-badge ${mode === 'cloud' ? 'cloud-badge' : ''}`} title={mode === 'cloud' && email ? `Signed in as ${email}` : 'Local workspace'}><span />{mode === 'local' ? 'Saved on this device' : syncState === 'saving' ? 'Syncing…' : syncState === 'offline' ? 'Offline changes' : syncState === 'conflict' ? 'Sync conflict' : 'Synced to cloud'}</span>{mode === 'cloud' && <button className="button button-ghost button-sm sign-out-button" onClick={() => void signOut()}>Sign out</button>}<button className="button button-primary button-sm" onClick={() => openCreate()}><Plus size={16} />New promise</button></div>
      </header>
      <main className="page-content">
        {notice && <div className="notice-banner"><CheckCircle2 size={16} />{notice}<button aria-label="Dismiss" onClick={() => setNotice(null)}><X size={15} /></button></div>}
        {storageError && <div className="notice-banner notice-error"><AlertCircle size={16} /><span>{storageError}</span>{mode === 'cloud' && syncState === 'offline' && <button className="notice-action" onClick={() => void retrySync()}>Retry sync</button>}{mode === 'cloud' && syncState === 'conflict' && <><button className="notice-action" onClick={() => void reloadCloud()}>Reload cloud</button><button className="notice-action" onClick={() => { if (window.confirm('Replace the latest cloud workspace with this device’s current copy?')) void overwriteCloud(); }}>Replace cloud</button></>}<button aria-label="Dismiss" onClick={dismissError}><X size={15} /></button></div>}
        {page === 'dashboard' && <DashboardPage db={db} dateFormat={db.settings.dateFormat} cloud={mode === 'cloud'} onCreate={openCreate} onOpen={setSelectedCommitmentId} onViewAll={() => setPage('commitments')} />}
        {page === 'commitments' && <CommitmentsPage items={db.commitments} dateFormat={db.settings.dateFormat} onCreate={openCreate} onOpen={setSelectedCommitmentId} />}
        {page === 'customers' && <CustomersPage db={db} dateFormat={db.settings.dateFormat} selectedId={selectedCustomerId} query={customerQuery} setQuery={setCustomerQuery} onSelect={setSelectedCustomerId} onCreateFor={openCreate} onEditCustomer={(id, patch) => apply((current) => updateCustomer(current, id, patch))} onOpenCommitment={setSelectedCommitmentId} />}
        {page === 'history' && <HistoryPage db={db} />}
        {page === 'settings' && <SettingsPage db={db} onSettings={(settings) => apply((current) => ({ ...current, settings: { ...current.settings, ...settings } }))} onLoadSamples={() => { apply(addSampleData); setNotice('Sample shop commitments added. They are marked as demo data.'); }} onRemoveSamples={() => { if (window.confirm('Remove only the sample commitments? Your own records will stay.')) { apply(removeSampleData); setNotice('Sample commitments removed.'); } }} onClear={() => { if (window.confirm(`Clear all PromiseLedger records from this ${mode === 'cloud' ? 'cloud workspace' : 'browser'}? This cannot be undone.`)) { const clean = emptyDatabase(); apply(() => clean); setNotice('PromiseLedger records cleared.'); } }} onImport={(imported) => { if (window.confirm(`Replace the current ${mode === 'cloud' ? 'cloud workspace' : 'local data'} with this backup? Export a copy first if you want to keep the current records.`)) { apply(() => imported); setNotice('Backup imported.'); } }} />}
      </main>
    </div>
    {modal && <CommitmentFormModal key={modal.mode + (modal.id ?? 'new')} initial={modal.draft} mode={modal.mode} onClose={() => setModal(null)} onSave={onSaveDraft} />}
    {selectedCommitment && <CommitmentDetailsModal item={selectedCommitment} dateFormat={db.settings.dateFormat} onClose={() => setSelectedCommitmentId(null)} onEdit={() => { setSelectedCommitmentId(null); openEdit(selectedCommitment); }} onStatus={(status, note) => apply((current) => setStatus(current, selectedCommitment.id, status, note))} onProgress={(note) => apply((current) => recordProgress(current, selectedCommitment.id, note))} onDelete={() => { if (window.confirm(`Delete “${selectedCommitment.title}”? This will also remove its timeline.`)) { apply((current) => deleteCommitment(current, selectedCommitment.id)); setSelectedCommitmentId(null); setNotice('Commitment deleted.'); } }} />}
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function DashboardPage({ db, dateFormat, cloud, onCreate, onOpen, onViewAll }: { db: Database; dateFormat: 'local' | 'iso'; cloud: boolean; onCreate: (draft?: CommitmentDraft) => void; onOpen: (id: string) => void; onViewAll: () => void }) {
  const today = localDateKey();
  const open = db.commitments.filter((item) => item.status === 'Open' || item.status === 'In progress');
  const overdue = open.filter((item) => isOverdue(item.dueDate, item.status, today));
  const dueToday = open.filter((item) => isDueToday(item.dueDate, item.status, today));
  const completedRecently = db.commitments.filter((item) => item.status === 'Completed' && item.completedAt && Date.now() - new Date(item.completedAt).getTime() <= 30 * 86_400_000).length;
  const attention = open.filter((item) => item.dueDate && dayDistance(today, item.dueDate) <= 7).sort((a, b) => {
    const rank = (item: Commitment) => isOverdue(item.dueDate, item.status, today) ? 0 : isDueToday(item.dueDate, item.status, today) ? 1 : 2;
    return rank(a) - rank(b) || (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  }).slice(0, 5);
  const upcoming = open.filter((item) => item.dueDate && dayDistance(today, item.dueDate) > 7).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 4);
  const [quickText, setQuickText] = useState('');
  const [quickError, setQuickError] = useState('');
  const quickSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!quickText.trim()) { setQuickError('Write a short promise to get started.'); return; }
    const parsed = parseQuickEntry(quickText);
    const draft = parsed.draft;
    if (parsed.confidence === 'fallback') draft.title = quickText.trim().replace(/[.!?]+$/, '');
    if (parsed.confidence !== 'parsed') draft.notes = [draft.notes, `Original entry: ${quickText.trim()}`].filter(Boolean).join('\n');
    onCreate(draft);
    setQuickText(''); setQuickError('');
  };

  return <>
    <div className="welcome-strip"><div className="welcome-copy"><span className="welcome-kicker"><Zap size={14} /> YOUR COMMITMENT DESK</span><h1>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}<span className="welcome-period">.</span></h1><p>A clear view of what you’ve promised and what needs attention.</p></div><div className="welcome-date"><CalendarDays size={16} />{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div></div>
    <form className="quick-capture" onSubmit={quickSubmit}>
      <div className="capture-icon"><Sparkles size={19} /></div><div className="capture-field"><label htmlFor="quick-promise">Capture a promise in one sentence</label><input id="quick-promise" value={quickText} onChange={(event) => { setQuickText(event.target.value); setQuickError(''); }} placeholder="e.g. Deliver 12 notebooks to Rahul tomorrow" /><small>We’ll find a person, category and date when they’re clear.</small>{quickError && <span className="field-error">{quickError}</span>}</div><button className="button button-primary capture-button" type="submit"><Plus size={16} />Review promise</button>
    </form>
    <div className="metric-grid">
      <MetricCard icon={Activity} label="Open commitments" value={open.length} foot="Need follow-through" tone="green" onClick={onViewAll} />
      <MetricCard icon={Clock3} label="Due today" value={dueToday.length} foot={dueToday.length ? 'Make today count' : 'Nothing due today'} tone="blue" onClick={onViewAll} />
      <MetricCard icon={AlertTriangle} label="Overdue" value={overdue.length} foot={overdue.length ? 'Needs your attention' : 'You’re all caught up'} tone={overdue.length ? 'amber' : 'green'} onClick={onViewAll} />
      <MetricCard icon={BadgeCheck} label="Completed recently" value={completedRecently} foot="In the last 30 days" tone="slate" onClick={onViewAll} />
    </div>
    <div className="dashboard-grid">
      <section className="panel attention-panel">
        <div className="panel-heading"><div><div className="panel-title-row"><span className="section-icon attention-icon"><AlertTriangle size={16} /></span><h2>Needs your attention</h2></div><p>Closest and most urgent promises first</p></div><button className="text-button" onClick={onViewAll}>View all <ArrowRight size={14} /></button></div>
        {attention.length ? <div className="commitment-list">{attention.map((item) => <CommitmentLine key={item.id} item={item} dateFormat={dateFormat} onClick={() => onOpen(item.id)} />)}</div> : <EmptyState icon={ShieldCheck} title="Nothing urgent right now" body={open.length ? 'Open promises without deadlines are safe from false overdue flags.' : 'Add your first promise to see it here.'} action={!open.length && <button className="button button-secondary button-sm" onClick={() => onCreate()}><Plus size={14} />Add a promise</button>} />}
      </section>
      <section className="panel upcoming-panel">
        <div className="panel-heading"><div><div className="panel-title-row"><span className="section-icon upcoming-icon"><CalendarDays size={16} /></span><h2>Coming up</h2></div><p>Promises after the next seven days</p></div></div>
        {upcoming.length ? <div className="upcoming-list">{upcoming.map((item) => <button className="upcoming-row" key={item.id} onClick={() => onOpen(item.id)}><span className="upcoming-date"><b>{dateAtLabelDay(item.dueDate!)}</b><small>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${item.dueDate}T00:00:00`))}</small></span><span className="upcoming-info"><b>{item.title}</b><small>{item.customerName}</small></span><ArrowRight size={15} /></button>)}</div> : <div className="upcoming-empty"><div className="calendar-illustration"><CalendarDays size={26} /><span>—</span></div><b>Your next chapter is open</b><p>Newly added promises will land here.</p></div>}
        <button className="panel-footer-link" onClick={onViewAll}>See all commitments <ArrowRight size={14} /></button>
      </section>
    </div>
    <section className="principle-card"><span className="principle-mark"><CheckCheck size={21} /></span><div><b>What makes a promise different?</b><p>The original deadline stays in the timeline, even when plans change. That way, your promise and reality are always visible together.</p></div><span className="principle-link">Promise → reality <ArrowRight size={14} /></span></section>
    <div className="dashboard-footnote"><span><ShieldCheck size={14} />{cloud ? 'Your data syncs to your private account.' : 'Your data stays on this device.'}</span><span>Deadlines use your local calendar date.</span></div>
  </>;
}

function dateAtLabelDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function MetricCard({ icon: Icon, label, value, foot, tone, onClick }: { icon: LucideIcon; label: string; value: number; foot: string; tone: string; onClick: () => void }) {
  return <button className="metric-card" type="button" onClick={onClick}><div className="metric-top"><span className={`metric-icon metric-${tone}`}><Icon size={17} /></span><span className="metric-trend"><ArrowUpRight size={14} /></span></div><span className="metric-label">{label}</span><b className="metric-value">{value}</b><span className="metric-foot">{foot}</span></button>;
}

function CommitmentLine({ item, dateFormat, onClick }: { item: Commitment; dateFormat: 'local' | 'iso'; onClick: () => void }) {
  const overdue = isOverdue(item.dueDate, item.status);
  return <button className={`commitment-line ${overdue ? 'line-overdue' : ''}`} type="button" onClick={onClick}><span className={`line-marker ${overdue ? 'marker-overdue' : isDueToday(item.dueDate, item.status) ? 'marker-today' : ''}`} /><span className="line-main"><b>{item.title}{item.isSample && <span className="sample-inline">DEMO</span>}</b><span><Avatar name={item.customerName} size="sm" />{item.customerName}<span className="line-separator">·</span><span className="line-category">{item.category}</span></span></span><span className="line-end"><span className={overdue ? 'date-overdue' : isDueToday(item.dueDate, item.status) ? 'date-today' : ''}>{dateLabel(item.dueDate, localDateKey(), dateFormat)}</span><ChevronDown size={15} className="line-chevron" /></span></button>;
}

function CommitmentsPage({ items, dateFormat, onCreate, onOpen }: { items: Commitment[]; dateFormat: 'local' | 'iso'; onCreate: (draft?: CommitmentDraft) => void; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [schedule, setSchedule] = useState<ScheduleFilter>('all');
  const [sort, setSort] = useState<SortKey>('dueDate');
  const filtered = useMemo(() => filterCommitments(items, { query, status, category, schedule, sort }), [items, query, status, category, schedule, sort]);
  const clear = () => { setQuery(''); setStatus('all'); setCategory('all'); setSchedule('all'); setSort('dueDate'); };
  return <>
    <PageHeading eyebrow="THE LEDGER" title="Commitments" description="Every promise, one clear place to follow through." action={<button className="button button-primary" onClick={() => onCreate()}><Plus size={16} />Add commitment</button>} />
    <section className="panel ledger-panel">
      <div className="ledger-toolbar"><label className="search-box"><Search size={17} /><input aria-label="Search commitments" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a promise or person…" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><div className="filter-group"><label className="select-wrap"><Filter size={14} /><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as Status | 'all')}><option value="all">All statuses</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><label className="select-wrap"><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value as Category | 'all')}><option value="all">All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label></div></div>
      <div className="schedule-filters" role="group" aria-label="Filter by deadline"><span>Show</span>{([['all', 'All'], ['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['no-date', 'No deadline']] as [ScheduleFilter, string][]).map(([key, label]) => <button key={key} className={`filter-chip ${schedule === key ? 'filter-chip-active' : ''}`} onClick={() => setSchedule(key)}>{label}{key === 'overdue' && <span className="filter-dot filter-dot-red" />}</button>)}<label className="sort-control">Sort by <select aria-label="Sort commitments" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="dueDate">Due date</option><option value="createdAt">Recently added</option><option value="status">Status</option></select><ChevronDown size={13} /></label></div>
      <div className="ledger-table-wrap"><table className="ledger-table"><thead><tr><th>Commitment</th><th>Person</th><th>Category</th><th>Deadline</th><th>Status</th><th><span className="sr-only">Open details</span></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="ledger-row" onClick={() => onOpen(item.id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(item.id)}><td><div className="table-title"><b>{item.title}</b>{item.isSample && <span className="sample-mini">DEMO</span>}{item.originalDueDate && item.originalDueDate !== item.dueDate && <small>Was {formatDate(item.originalDueDate, dateFormat)}</small>}</div></td><td><span className="table-person"><Avatar name={item.customerName} size="sm" />{item.customerName}</span></td><td><CategoryBadge category={item.category} /></td><td className={isOverdue(item.dueDate, item.status) ? 'date-overdue' : ''}>{formatDate(item.dueDate, dateFormat)}</td><td><StatusBadge item={item} /></td><td><ArrowRight size={15} className="table-arrow" /></td></tr>)}</tbody></table></div>
      {!filtered.length && <EmptyState icon={query || status !== 'all' || category !== 'all' || schedule !== 'all' ? Search : CheckCheck} title={items.length ? 'No matching promises' : 'Your ledger starts with one promise'} body={items.length ? 'Try adjusting your search or filters.' : 'Keep the details you promised, the deadline, and the person all in one place.'} action={items.length ? <button className="button button-secondary button-sm" onClick={clear}>Clear filters</button> : <button className="button button-primary button-sm" onClick={() => onCreate()}><Plus size={14} />Create first commitment</button>} />}
      <div className="ledger-bottom"><span>{filtered.length} of {items.length} commitments</span><button className="text-button" onClick={clear}>Reset filters</button></div>
    </section>
  </>;
}

function CustomersPage({ db, dateFormat, selectedId, query, setQuery, onSelect, onCreateFor, onEditCustomer, onOpenCommitment }: {
  db: Database; dateFormat: 'local' | 'iso'; selectedId: string | null; query: string; setQuery: (value: string) => void; onSelect: (id: string | null) => void;
  onCreateFor: (draft?: CommitmentDraft, customerName?: string) => void; onEditCustomer: (id: string, patch: Partial<Pick<Customer, 'name' | 'contact' | 'notes'>>) => void; onOpenCommitment: (id: string) => void;
}) {
  const people = db.customers.filter((customer) => customer.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const selected = db.customers.find((customer) => customer.id === selectedId) ?? null;
  const related = selected ? db.commitments.filter((item) => item.customerId === selected.id || item.customerName.toLocaleLowerCase() === selected.name.toLocaleLowerCase()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const [edit, setEdit] = useState(false);
  return <>
    <PageHeading eyebrow="PEOPLE BEHIND THE PROMISES" title="Customers" description="A simple directory shaped by the people you make commitments to." action={selected && <button className="button button-primary" onClick={() => onCreateFor(undefined, selected.name)}><Plus size={16} />New promise</button>} />
    <div className="customers-layout">
      <section className="panel customer-list-panel"><div className="customer-search"><Search size={16} /><input aria-label="Search customers" placeholder="Find someone…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="customer-list">{people.map((customer) => {
        const records = db.commitments.filter((item) => item.customerId === customer.id || item.customerName.toLocaleLowerCase() === customer.name.toLocaleLowerCase());
        const activeCount = records.filter((item) => item.status === 'Open' || item.status === 'In progress').length;
        const hasOverdue = records.some((item) => isOverdue(item.dueDate, item.status));
        return <button key={customer.id} className={`customer-list-item ${selectedId === customer.id ? 'customer-list-active' : ''}`} onClick={() => { onSelect(customer.id); setEdit(false); }}><Avatar name={customer.name} /><span className="customer-list-name"><b>{customer.name}</b><small>{records.length} {records.length === 1 ? 'commitment' : 'commitments'}</small></span><span className={`customer-open-count ${hasOverdue ? 'count-overdue' : ''}`}>{hasOverdue ? 'Late' : activeCount ? activeCount : <Check size={14} />}</span></button>;
      })}</div>{!people.length && <div className="customer-list-empty">{db.customers.length ? 'No people match this search.' : 'People you make promises to will appear here.'}</div>}<div className="customer-list-foot">{db.customers.length} people in your ledger</div></section>
      <section className="panel customer-profile-panel">{selected ? <>
        <div className="customer-profile-head"><div className="customer-profile-id"><Avatar name={selected.name} size="lg" /><div><div className="eyebrow">CUSTOMER PROFILE</div><h2>{selected.name}</h2><span>Added {formatDate(selected.createdAt.slice(0, 10), dateFormat)}</span></div></div><IconButton label={edit ? 'Close editing' : 'Edit customer'} onClick={() => setEdit(!edit)}>{edit ? <X size={16} /> : <Pencil size={16} />}</IconButton></div>
        {edit ? <div className="customer-edit-form"><Field label="Name"><input value={selected.name} onChange={(event) => onEditCustomer(selected.id, { name: event.target.value })} /></Field><Field label="Contact information"><input placeholder="Phone or email (optional)" value={selected.contact} onChange={(event) => onEditCustomer(selected.id, { contact: event.target.value })} /></Field><Field label="Notes"><textarea rows={3} placeholder="Useful details for next time" value={selected.notes} onChange={(event) => onEditCustomer(selected.id, { notes: event.target.value })} /></Field><p className="form-hint">Edits save automatically. Similar names are matched without case or extra spaces.</p></div> : <div className="customer-contact-card"><span><UserRound size={15} />{selected.contact || 'No contact information added'}</span>{selected.notes && <p>{selected.notes}</p>}</div>}
        <div className="customer-stat-grid"><div><span>Open</span><b>{related.filter((item) => item.status === 'Open' || item.status === 'In progress').length}</b></div><div><span>Overdue</span><b className="stat-red">{related.filter((item) => isOverdue(item.dueDate, item.status)).length}</b></div><div><span>Completed</span><b className="stat-green">{related.filter((item) => item.status === 'Completed').length}</b></div></div>
        <div className="subsection-heading"><div><h3>Commitment history</h3><p>Every promise made to {selected.name.split(' ')[0]}</p></div><span>{related.length}</span></div>
        {related.length ? <div className="customer-record-list">{related.map((item) => <button key={item.id} className="customer-record" onClick={() => onOpenCommitment(item.id)}><span className={`record-category-marker record-${item.category.toLowerCase().replace(/[^a-z]/g, '')}`} /><span className="record-main"><b>{item.title}</b><small>{item.category} · {formatDate(item.dueDate, dateFormat)}</small></span><StatusBadge item={item} /><ArrowRight size={14} /></button>)}</div> : <div className="customer-history-empty">No promises yet. Start the relationship with a clear commitment.</div>}
      </> : <EmptyState icon={UsersRound} title="Choose someone to see their story" body="Select a person from the directory to review open, overdue and completed promises." />}</section>
    </div>
  </>;
}

function HistoryPage({ db }: { db: Database }) {
  const [customer, setCustomer] = useState('all');
  const [type, setType] = useState<EventType | 'all'>('all');
  const events = db.commitments.flatMap((item) => item.history.map((event) => ({ ...event, title: item.title, customerName: item.customerName }))).filter((event) => (customer === 'all' || event.customerName === customer) && (type === 'all' || event.type === type)).sort((a, b) => b.at.localeCompare(a.at));
  return <>
    <PageHeading eyebrow="THE PAPER TRAIL" title="History" description="A transparent timeline of what was promised and what changed." />
    <section className="panel history-panel"><div className="history-toolbar"><div className="history-toolbar-copy"><span className="section-icon history-icon"><History size={16} /></span><div><b>Commitment activity</b><small>{events.length} recorded events</small></div></div><div className="history-filters"><label className="select-wrap"><UsersRound size={14} /><select aria-label="Filter history by customer" value={customer} onChange={(event) => setCustomer(event.target.value)}><option value="all">All customers</option>{db.customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><ChevronDown size={14} /></label><label className="select-wrap"><select aria-label="Filter history by event type" value={type} onChange={(event) => setType(event.target.value as EventType | 'all')}><option value="all">All events</option>{(['created', 'deadline_changed', 'status_changed', 'progress', 'completed', 'reopened', 'edited'] as EventType[]).map((item) => <option key={item} value={item}>{eventLabel(item)}</option>)}</select><ChevronDown size={14} /></label></div></div>
      {events.length ? <div className="activity-feed">{events.map((event) => { const Icon = eventIcon(event.type); return <div className="activity-event" key={event.id}><span className={`activity-icon activity-${event.type}`}><Icon size={15} /></span><div className="activity-body"><div><b>{eventLabel(event.type)}</b><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time></div><p>{event.message}</p>{event.note && <blockquote>{event.note}</blockquote>}<span className="activity-meta"><Avatar name={event.customerName} size="sm" /><b>{event.customerName}</b><span>·</span>{event.title}</span></div></div>; })}</div> : <EmptyState icon={History} title="Your timeline starts here" body={db.commitments.length ? 'No events match those filters.' : 'Create a commitment and its history will be recorded here automatically.'} />}
    </section>
  </>;
}

function SettingsPage({ db, onSettings, onLoadSamples, onRemoveSamples, onClear, onImport }: {
  db: Database; onSettings: (settings: Partial<Database['settings']>) => void; onLoadSamples: () => void; onRemoveSamples: () => void; onClear: () => void; onImport: (value: Database) => void;
}) {
  const sampleCount = db.commitments.filter((item) => item.isSample).length;
  const exportData = () => {
    const blob = new Blob([exportDatabase(db)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `promiseledger-backup-${localDateKey()}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const imported = validateImport(JSON.parse(await file.text())); onImport(imported); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'Could not read this backup.'); }
    event.target.value = '';
  };
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE" title="Settings" description="Small preferences for how PromiseLedger works on this device." />
    <div className="settings-layout">
      <div className="settings-main">
        <section className="panel settings-panel"><div className="settings-section-title"><span className="settings-icon"><Tag size={16} /></span><div><h2>Display preferences</h2><p>Choose how amounts and dates appear.</p></div></div><div className="settings-fields"><Field label="Default currency for new amounts" hint="Existing amounts keep their recorded currency. No conversion or payments."><select value={db.settings.currency} onChange={(event) => onSettings({ currency: event.target.value })}><option value="INR">INR — Indian Rupee (₹)</option><option value="USD">USD — US Dollar ($)</option><option value="EUR">EUR — Euro (€)</option><option value="GBP">GBP — British Pound (£)</option></select></Field><Field label="Date format"><select value={db.settings.dateFormat} onChange={(event) => onSettings({ dateFormat: event.target.value as 'local' | 'iso' })}><option value="local">Local format (24 Oct 2026)</option><option value="iso">ISO format (2026-10-24)</option></select></Field></div></section>
        <section className="panel settings-panel"><div className="settings-section-title"><span className="settings-icon settings-green"><Sparkles size={16} /></span><div><h2>Sample shop data</h2><p>Explore a fictional shop ledger. Every seeded item is labeled as demo data.</p></div></div><div className="sample-preview"><div><b>{sampleCount ? `${sampleCount} sample commitments loaded` : 'A ready-made shop ledger'}</b><small>Overdue delivery · payment due today · rescheduled promise · no-deadline order</small></div><div className="sample-actions">{sampleCount ? <button className="button button-secondary button-sm" onClick={onRemoveSamples}><Trash2 size={14} />Remove samples</button> : <button className="button button-secondary button-sm" onClick={onLoadSamples}><Plus size={14} />Load sample data</button>}</div></div></section>
        <section className="panel settings-panel"><div className="settings-section-title"><span className="settings-icon"><Download size={16} /></span><div><h2>Backup and restore</h2><p>Export a portable JSON backup or import one you saved earlier.</p></div></div><div className="data-actions"><button className="button button-secondary" onClick={exportData}><Download size={15} />Export backup</button><label className="button button-secondary file-button"><Plus size={15} />Import backup<input type="file" accept="application/json,.json" onChange={importData} /></label><span>Imports are validated before replacing any local data.</span></div></section>
      </div>
      <aside className="panel privacy-panel"><span className="privacy-icon"><ShieldCheck size={19} /></span><h3>Your ledger is yours.</h3><p>PromiseLedger stores records in this browser. No account, cloud sync, or third-party service is connected.</p><div className="privacy-divider" /><div className="privacy-facts"><span><CheckCircle2 size={14} />Saved locally</span><span><CheckCircle2 size={14} />No tracking scripts</span><span><CheckCircle2 size={14} />Export whenever you need</span></div><button className="danger-link" onClick={onClear}><Trash2 size={14} />Clear all local data</button></aside>
    </div>
  </>;
}

function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small className="form-hint">{hint}</small>}{error && <small className="field-error">{error}</small>}</label>;
}

function CommitmentFormModal({ initial, mode, onClose, onSave }: { initial: CommitmentDraft; mode: 'create' | 'edit'; onClose: () => void; onSave: (draft: CommitmentDraft) => void }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { const handle = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, [onClose]);
  const update = (field: keyof CommitmentDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Add the action you promised.';
    if (!draft.customerName.trim()) next.customerName = 'Add the person or business name.';
    if (draft.amount && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0)) next.amount = 'Enter a valid non-negative amount.';
    if (draft.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) next.dueDate = 'Choose a valid calendar date.';
    if (Object.keys(next).length) { setErrors(next); return; }
    onSave({ ...draft, title: draft.title.trim(), customerName: draft.customerName.trim(), notes: draft.notes.trim() });
  };
  return <div className="modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card form-modal" role="dialog" aria-modal="true" aria-labelledby="commitment-form-title"><div className="modal-heading"><div><span className="eyebrow">{mode === 'edit' ? 'REFINE THE PROMISE' : 'MAKE IT CLEAR'}</span><h2 id="commitment-form-title">{mode === 'edit' ? 'Edit commitment' : 'New commitment'}</h2><p>Capture what you’ll do, who it’s for, and when it’s due.</p></div><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div><form onSubmit={submit} noValidate><Field label="What did you promise?" error={errors.title}><input autoFocus placeholder="e.g. Deliver 12 notebooks" value={draft.title} onChange={(event) => update('title', event.target.value)} /></Field><Field label="Person or business" error={errors.customerName}><input placeholder="e.g. Rahul Sharma" value={draft.customerName} onChange={(event) => update('customerName', event.target.value)} /></Field><div className="form-row"><Field label="Category"><select value={draft.category} onChange={(event) => update('category', event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Deadline" hint="Leave blank if no date was promised." error={errors.dueDate}><input type="date" value={draft.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></Field></div><div className="form-row"><Field label="Amount (optional)" error={errors.amount}><div className="amount-input"><span>{draft.currency === 'INR' ? '₹' : draft.currency}</span><input inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(event) => update('amount', event.target.value)} /></div></Field><Field label="Currency"><select value={draft.currency} onChange={(event) => update('currency', event.target.value)}><option value="INR">INR — ₹</option><option value="USD">USD — $</option><option value="EUR">EUR — €</option><option value="GBP">GBP — £</option></select></Field></div><Field label="Notes" hint="Context, progress details, or anything worth remembering."><textarea rows={3} placeholder="Optional details…" value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></Field><div className="modal-footer"><span className="modal-safe-note"><ShieldCheck size={14} />Deadline can be changed later; the original stays in history.</span><div><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{mode === 'edit' ? 'Save changes' : 'Save promise'}<ArrowRight size={15} /></button></div></div></form></section></div>;
}

function CommitmentDetailsModal({ item, dateFormat, onClose, onEdit, onStatus, onProgress, onDelete }: {
  item: Commitment; dateFormat: 'local' | 'iso'; onClose: () => void; onEdit: () => void; onStatus: (status: Status, note?: string) => void; onProgress: (note: string) => void; onDelete: () => void;
}) {
  const [progress, setProgress] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [showCompleteNote, setShowCompleteNote] = useState(false);
  useEffect(() => { const handle = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, [onClose]);
  const overdue = isOverdue(item.dueDate, item.status);
  const amount = money(item.amount, item.currency);
  const handleComplete = () => { onStatus('Completed', completionNote); setShowCompleteNote(false); };
  return <div className="modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="detail-topline"><span className="eyebrow">PROMISE DETAILS</span><div className="detail-top-actions"><IconButton label="Edit commitment" onClick={onEdit}><Pencil size={16} /></IconButton><IconButton label="Delete commitment" className="danger-icon-button" onClick={onDelete}><Trash2 size={16} /></IconButton><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div></div><div className="detail-title-block"><h2 id="detail-title">{item.title}</h2><div className="detail-person"><Avatar name={item.customerName} /> <span><b>{item.customerName}</b><small>{item.category}{item.isSample && ' · DEMO DATA'}</small></span></div><StatusBadge item={item} /></div>
    <div className="promise-reality"><div className="promise-col"><span className="mini-label"><span className="promise-dot" />ORIGINAL PROMISE</span><b>{formatDate(item.originalDueDate, dateFormat)}</b></div><div className="promise-arrow"><ArrowRight size={17} /></div><div className="promise-col"><span className="mini-label"><span className={`reality-dot ${item.status === 'Completed' ? 'reality-complete' : ''}`} />CURRENT REALITY</span><b className={overdue ? 'date-overdue' : ''}>{formatDate(item.dueDate, dateFormat)}</b>{item.originalDueDate !== item.dueDate && <small>Rescheduled</small>}</div></div>
    <div className="detail-meta-grid"><div><span>Created</span><b>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.createdAt))}</b></div>{amount && <div><span>Amount</span><b>{amount}</b></div>}<div><span>Status</span><b>{item.status}</b></div></div>{item.notes && <div className="detail-notes"><span className="mini-label">NOTES</span><p>{item.notes}</p></div>}
    {item.status !== 'Completed' && item.status !== 'Cancelled' && <div className="progress-entry"><label htmlFor="progress-note">Record progress</label><div><input id="progress-note" value={progress} onChange={(event) => setProgress(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && progress.trim()) { onProgress(progress); setProgress(''); } }} placeholder="A small update is enough…" /><button disabled={!progress.trim()} onClick={() => { onProgress(progress); setProgress(''); }}><Plus size={14} />Add note</button></div></div>}
    {item.status === 'Completed' && item.completionNotes && <div className="completion-note"><CheckCircle2 size={15} /><div><b>Completion note</b><p>{item.completionNotes}</p></div></div>}
    <div className="timeline-heading"><div><h3>Promise timeline</h3><p>Every change stays attached to the original commitment.</p></div></div><div className="detail-timeline">{item.history.map((event) => { const Icon = eventIcon(event.type); return <div className="timeline-item" key={event.id}><span className={`timeline-icon timeline-${event.type}`}><Icon size={14} /></span><div className="timeline-entry"><b>{event.message}</b><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time>{event.note && <p>{event.note}</p>}</div></div>; })}</div>
    <div className="detail-footer"><div className="detail-secondary-actions">{item.status === 'Completed' ? <button className="button button-secondary button-sm" onClick={() => onStatus('Open')}><ArrowUpRight size={14} />Reopen</button> : item.status === 'Cancelled' ? <button className="button button-secondary button-sm" onClick={() => onStatus('Open')}><ArrowUpRight size={14} />Reopen</button> : <><button className="button button-secondary button-sm" onClick={() => onStatus(item.status === 'In progress' ? 'Open' : 'In progress')}>{item.status === 'In progress' ? <ArrowDown size={14} /> : <Activity size={14} />}{item.status === 'In progress' ? 'Mark open' : 'In progress'}</button><button className="button button-ghost button-sm" onClick={() => onStatus('Cancelled')}>Cancel promise</button></>}</div>{item.status !== 'Completed' && item.status !== 'Cancelled' && <button className="button button-primary button-sm" onClick={() => setShowCompleteNote(!showCompleteNote)}><CheckCircle2 size={15} />Complete</button>}</div>
    {showCompleteNote && <div className="complete-inline"><label htmlFor="completion-note">Add a completion note (optional)</label><div><input id="completion-note" value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} placeholder="What happened in the end?" /><button className="button button-primary button-sm" onClick={handleComplete}>Confirm completion</button></div></div>}
    <p className="detail-created">Last updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.updatedAt))}</p>
  </section></div>;
}

export default App;
