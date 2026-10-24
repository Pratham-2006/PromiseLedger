import { useEffect, useState } from 'react';
import {
  BarChart2, CheckCheck, ChevronDown, History, LayoutDashboard,
  ListFilter, Menu, MoreHorizontal, Plus, Settings2, Sparkles, UsersRound, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createCommitment, deleteCommitment, emptyDatabase, recordProgress,
  setStatus, updateCommitment, updateCustomer,
} from './domain/commitments';
import { addSampleData, removeSampleData } from './domain/sampleData';
import { EMPTY_DRAFT, type Commitment, type CommitmentDraft, type Database } from './domain/types';
import { useWorkspace } from './data/WorkspaceProvider';
import { Avatar } from './components/ui/Avatar';
import { NoticeBar } from './components/ui/NoticeBar';
import { useConfirm } from './components/ui/ConfirmDialog';
import { useKeyboardShortcuts, type AppPage } from './hooks/useKeyboardShortcuts';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { CommitmentsPage } from './pages/CommitmentsPage';
import { CustomersPage } from './pages/CustomersPage';
import { HistoryPage } from './pages/HistoryPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

// Modals
import { CommitmentFormModal } from './modals/CommitmentFormModal';
import { CommitmentDetailsModal } from './modals/CommitmentDetailsModal';

type ModalState = { mode: 'create' | 'edit'; id?: string; draft: CommitmentDraft } | null;

const navigation: { id: AppPage; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'commitments', label: 'Commitments', icon: ListFilter },
  { id: 'customers', label: 'Customers', icon: UsersRound },
  { id: 'history', label: 'History', icon: History },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

const pageTitles: Record<AppPage, string> = {
  dashboard: 'Good morning',
  commitments: 'Commitments',
  customers: 'Customers',
  history: 'History',
  analytics: 'Analytics',
  settings: 'Settings',
};

function toDraft(item: Commitment): CommitmentDraft {
  return {
    title: item.title,
    customerName: item.customerName,
    category: item.category,
    dueDate: item.dueDate ?? '',
    amount: item.amount === null ? '' : String(item.amount),
    currency: item.currency,
    notes: item.notes,
    priority: item.priority ?? 0,
    tags: (item.tags ?? []).join(', '),
  };
}

function App() {
  const {
    db, apply, mode, email, syncState, error: storageError,
    dismissError, signOut, retrySync, reloadCloud, overwriteCloud,
  } = useWorkspace();

  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState<AppPage>('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');

  const { confirm, dialog: confirmDialog } = useConfirm();

  // Apply appearance theme
  useEffect(() => {
    const theme = db.settings.theme || 'system';
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [db.settings.theme]);

  // Global keyboard shortcuts (n = new promise, 1-6 = page navigation)
  useKeyboardShortcuts({
    onNewPromise: () => openCreate(),
    onNavigate: (newPage) => {
      setPage(newPage);
      setMobileMenu(false);
    },
  });

  const openCreate = (draft?: CommitmentDraft, customerName?: string) => {
    const value = draft ?? EMPTY_DRAFT;
    setModal({
      mode: 'create',
      draft: {
        ...EMPTY_DRAFT,
        ...value,
        currency: value.amount ? value.currency : db.settings.currency,
        ...(customerName ? { customerName } : {}),
      },
    });
  };

  const openEdit = (item: Commitment) => {
    setModal({ mode: 'edit', id: item.id, draft: toDraft(item) });
  };

  const onSaveDraft = (draft: CommitmentDraft) => {
    if (modal?.mode === 'edit' && modal.id) {
      apply((current) => updateCommitment(current, modal.id!, draft));
    } else {
      apply((current) => createCommitment(current, draft));
    }
    setModal(null);
    setNotice(modal?.mode === 'edit' ? 'Commitment updated.' : 'Promise recorded.');
  };

  const handleDeleteCommitment = async (item: Commitment) => {
    const ok = await confirm({
      title: `Delete “${item.title}”?`,
      body: 'This will remove the commitment from your ledger and record a deletion event in history.',
      confirmLabel: 'Delete promise',
      danger: true,
    });
    if (!ok) return;
    apply((current) => deleteCommitment(current, item.id));
    setSelectedCommitmentId(null);
    setNotice('Commitment deleted.');
  };

  const handleClearData = async () => {
    const ok = await confirm({
      title: 'Clear all records?',
      body: `Clear all PromiseLedger records from this ${mode === 'cloud' ? 'cloud workspace' : 'browser'}? This cannot be undone.`,
      confirmLabel: 'Clear all data',
      danger: true,
    });
    if (!ok) return;
    apply(() => emptyDatabase());
    setNotice('PromiseLedger records cleared.');
  };

  const handleRemoveSamples = async () => {
    const ok = await confirm({
      title: 'Remove sample data?',
      body: 'Remove only the sample commitments? Your own records will stay untouched.',
      confirmLabel: 'Remove samples',
    });
    if (!ok) return;
    apply(removeSampleData);
    setNotice('Sample commitments removed.');
  };

  const handleImportBackup = async (imported: Database) => {
    const ok = await confirm({
      title: 'Replace with backup?',
      body: `Replace current ${mode === 'cloud' ? 'cloud workspace' : 'local data'} with this backup? Be sure to export a copy first if you want to keep current records.`,
      confirmLabel: 'Import and replace',
      danger: true,
    });
    if (!ok) return;
    apply(() => imported);
    setNotice('Backup imported successfully.');
  };

  const handleOverwriteCloud = async () => {
    const ok = await confirm({
      title: 'Overwrite cloud workspace?',
      body: 'Replace the latest cloud workspace with this device’s current copy?',
      confirmLabel: 'Replace cloud',
      danger: true,
    });
    if (!ok) return;
    void overwriteCloud();
  };

  const selectedCommitment = db.commitments.find((item) => item.id === selectedCommitmentId) ?? null;
  const activeCount = db.commitments.filter((item) => !item.deletedAt && item.status !== 'Completed' && item.status !== 'Cancelled').length;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-mobile-open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark"><CheckCheck size={19} strokeWidth={2.4} /></span>
          <span>promise<span className="brand-ledger">ledger</span></span>
          <button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileMenu(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-chip">
          <span className="workspace-dot" />
          <span>My business</span>
          <ChevronDown size={15} />
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${page === id ? 'nav-item-active' : ''}`}
              onClick={() => { setPage(id); setMobileMenu(false); }}
            >
              <Icon size={18} strokeWidth={page === id ? 2.3 : 1.8} />
              <span>{label}</span>
              {id === 'commitments' && activeCount > 0 && (
                <span className="nav-count">{activeCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon"><Sparkles size={15} /></span>
            <strong>A promise remembered</strong>
            <p>is trust earned.</p>
          </div>
          <div className="profile-row">
            <Avatar name={email || 'My business'} size="sm" />
            <span>
              <b>{email || 'My business'}</b>
              <small>{mode === 'cloud' ? 'Cloud workspace' : 'Local workspace'}</small>
            </span>
            <MoreHorizontal size={17} className="profile-more" />
          </div>
        </div>
      </aside>

      {mobileMenu && <button aria-label="Close navigation overlay" className="mobile-scrim" onClick={() => setMobileMenu(false)} />}

      <div className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="crumb-sep">/</span>
            <b>{page === 'dashboard' ? 'Dashboard' : pageTitles[page]}</b>
          </div>
          <div className="topbar-actions">
            <span
              className={`local-badge ${mode === 'cloud' ? 'cloud-badge' : ''}`}
              title={mode === 'cloud' && email ? `Signed in as ${email}` : 'Local workspace'}
            >
              <span />
              {mode === 'local' ? 'Saved on this device' : syncState === 'saving' ? 'Syncing…' : syncState === 'offline' ? 'Offline changes' : syncState === 'conflict' ? 'Sync conflict' : 'Synced to cloud'}
            </span>
            {mode === 'cloud' && (
              <button className="button button-ghost button-sm sign-out-button" onClick={() => void signOut()}>
                Sign out
              </button>
            )}
            <button className="button button-primary button-sm" onClick={() => openCreate()}>
              <Plus size={16} />New promise
            </button>
          </div>
        </header>

        <main className="page-content">
          <NoticeBar
            notice={notice}
            error={storageError}
            onDismissNotice={() => setNotice(null)}
            onDismissError={dismissError}
            errorActions={
              mode === 'cloud' && (
                <>
                  {syncState === 'offline' && <button className="notice-action" onClick={() => void retrySync()}>Retry sync</button>}
                  {syncState === 'conflict' && (
                    <>
                      <button className="notice-action" onClick={() => void reloadCloud()}>Reload cloud</button>
                      <button className="notice-action" onClick={handleOverwriteCloud}>Replace cloud</button>
                    </>
                  )}
                </>
              )
            }
          />

          {page === 'dashboard' && (
            <DashboardPage
              db={db}
              dateFormat={db.settings.dateFormat}
              cloud={mode === 'cloud'}
              onCreate={openCreate}
              onOpen={setSelectedCommitmentId}
              onViewAll={() => setPage('commitments')}
            />
          )}

          {page === 'commitments' && (
            <CommitmentsPage
              items={db.commitments}
              dateFormat={db.settings.dateFormat}
              onCreate={openCreate}
              onOpen={setSelectedCommitmentId}
            />
          )}

          {page === 'customers' && (
            <CustomersPage
              db={db}
              dateFormat={db.settings.dateFormat}
              selectedId={selectedCustomerId}
              query={customerQuery}
              setQuery={setCustomerQuery}
              onSelect={setSelectedCustomerId}
              onCreateFor={openCreate}
              onEditCustomer={(id, patch) => apply((current) => updateCustomer(current, id, patch))}
              onOpenCommitment={setSelectedCommitmentId}
            />
          )}

          {page === 'history' && <HistoryPage db={db} />}

          {page === 'analytics' && <AnalyticsPage db={db} />}

          {page === 'settings' && (
            <SettingsPage
              db={db}
              onSettings={(settings) => apply((current) => ({ ...current, settings: { ...current.settings, ...settings } }))}
              onLoadSamples={() => {
                apply(addSampleData);
                setNotice('Sample shop commitments added. They are marked as demo data.');
              }}
              onRemoveSamples={handleRemoveSamples}
              onClear={handleClearData}
              onImport={handleImportBackup}
            />
          )}
        </main>
      </div>

      {modal && (
        <CommitmentFormModal
          key={modal.mode + (modal.id ?? 'new')}
          initial={modal.draft}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onSave={onSaveDraft}
        />
      )}

      {selectedCommitment && (
        <CommitmentDetailsModal
          item={selectedCommitment}
          dateFormat={db.settings.dateFormat}
          onClose={() => setSelectedCommitmentId(null)}
          onEdit={() => {
            const item = selectedCommitment;
            setSelectedCommitmentId(null);
            openEdit(item);
          }}
          onStatus={(status, note) => apply((current) => setStatus(current, selectedCommitment.id, status, note))}
          onProgress={(note) => apply((current) => recordProgress(current, selectedCommitment.id, note))}
          onDelete={() => handleDeleteCommitment(selectedCommitment)}
        />
      )}

      {confirmDialog}
    </div>
  );
}

export default App;
