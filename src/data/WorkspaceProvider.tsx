import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCheck } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { createId, normalizedCustomerName } from '../domain/commitments';
import { emptyDatabase } from '../domain/commitments';
import { loadDatabase, normalizeDatabase, saveDatabase } from '../domain/storage';
import { DEFAULT_SETTINGS, type Database } from '../domain/types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Json } from '../lib/database.types';

type Phase = 'auth-loading' | 'signed-out' | 'workspace-loading' | 'migration-choice' | 'ready' | 'workspace-error';
type SyncState = 'local' | 'synced' | 'saving' | 'offline' | 'conflict';
type WorkspaceContextValue = {
  db: Database;
  apply: (change: (current: Database) => Database) => void;
  mode: 'local' | 'cloud';
  email: string | null;
  syncState: SyncState;
  error: string | null;
  dismissError: () => void;
  signOut: () => Promise<void>;
  retrySync: () => Promise<void>;
  reloadCloud: () => Promise<void>;
  overwriteCloud: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const CACHE_PREFIX = 'promiseledger.cloud-cache.';

function hasLocalRecords(database: Database): boolean {
  return database.commitments.some((item) => !item.isSample)
    || database.customers.some((item) => !item.isSample)
    || database.settings.currency !== DEFAULT_SETTINGS.currency
    || database.settings.dateFormat !== DEFAULT_SETTINGS.dateFormat;
}

function cacheKey(userId: string): string { return `${CACHE_PREFIX}${userId}`; }
function migrationKey(userId: string): string { return `promiseledger.migration-complete.${userId}`; }

function readCloudCache(userId: string): { state: Database; revision: number } | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('state' in value) || !('revision' in value) || typeof value.revision !== 'number') return null;
    return { state: normalizeDatabase(value.state), revision: value.revision };
  } catch { return null; }
}

function writeCloudCache(userId: string, state: Database, revision: number): void {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify({ state, revision })); }
  catch { /* Cloud sync remains authoritative if the browser cache is full or unavailable. */ }
}

async function fetchWorkspace(userId: string): Promise<{ state: Database; revision: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('workspace_states').select('state, revision').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? { state: normalizeDatabase(data.state), revision: data.revision } : null;
}

async function saveWorkspace(userId: string, state: Database, expectedRevision: number): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('save_workspace_state', { p_state: state as unknown as Json, p_expected_revision: expectedRevision });
  if (error) throw error;
  if (typeof data !== 'number') throw new Error('Supabase did not return a workspace revision.');
  writeCloudCache(userId, state, data);
  return data;
}

function workspaceSetupMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : 'Could not connect to the cloud workspace.';
  if (/workspace_states|save_workspace_state|schema cache|PGRST20[0-9]/i.test(message)) {
    return 'The Supabase schema is not installed yet. Run supabase/migrations/20261024000000_create_workspace_states.sql in your project’s SQL Editor, then retry.';
  }
  return message;
}

function mergeLocalIntoCloud(cloud: Database, local: Database): Database {
  const merged: Database = {
    ...cloud,
    settings: cloud.commitments.length || cloud.customers.length ? cloud.settings : local.settings,
    customers: [...cloud.customers],
    commitments: [...cloud.commitments],
  };
  const cloudByName = new Map(merged.customers.map((customer) => [customer.normalizedName || normalizedCustomerName(customer.name), customer]));
  const customerIdMap = new Map<string, string>();
  for (const customer of local.customers.filter((item) => !item.isSample)) {
    const key = normalizedCustomerName(customer.name);
    if (!key) continue;
    const existing = cloudByName.get(key);
    if (existing) customerIdMap.set(customer.id, existing.id);
    else {
      const copy = { ...customer, id: createId(), normalizedName: key, isSample: false };
      merged.customers.push(copy);
      cloudByName.set(key, copy);
      customerIdMap.set(customer.id, copy.id);
    }
  }
  const existingCommitmentIds = new Set(merged.commitments.map((item) => item.id));
  for (const item of local.commitments.filter((entry) => !entry.isSample)) {
    if (existingCommitmentIds.has(item.id)) continue;
    const id = createId();
    const customerKey = normalizedCustomerName(item.customerName);
    const customer = cloudByName.get(customerKey);
    const customerId = customer?.id ?? customerIdMap.get(item.customerId) ?? createId();
    if (!customer) {
      const synthesized = { id: customerId, name: item.customerName, normalizedName: customerKey, contact: '', notes: '', createdAt: item.createdAt };
      merged.customers.push(synthesized);
      cloudByName.set(customerKey, synthesized);
    }
    merged.commitments.push({ ...item, id, customerId, customerName: customer?.name ?? item.customerName, isSample: false,
      history: item.history.map((event) => ({ ...event, id: createId(), commitmentId: id, customerName: customer?.name ?? item.customerName })) });
  }
  return merged;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [localInitial] = useState(() => loadDatabase());
  const [db, setDb] = useState<Database>(localInitial.database);
  const dbRef = useRef(db);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [phase, setPhase] = useState<Phase>(isSupabaseConfigured ? 'auth-loading' : 'ready');
  const [mode, setMode] = useState<'local' | 'cloud'>(isSupabaseConfigured ? 'cloud' : 'local');
  const [syncState, setSyncState] = useState<SyncState>(isSupabaseConfigured ? 'synced' : 'local');
  const [error, setError] = useState<string | null>(localInitial.warning);
  const [gateError, setGateError] = useState<string | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [pending, setPending] = useState<{ local: Database; cloud: Database; revision: number; cloudExists: boolean; localWarning: string | null } | null>(null);
  const revision = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (alive) { setSession(nextSession); setAuthReady(true); }
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setAuthReady(true);
    }).catch((reason: unknown) => { if (alive) { setError(reason instanceof Error ? reason.message : 'Could not restore your session.'); setAuthReady(true); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setMode('local'); setPhase('ready'); return; }
    if (!authReady) return;
    if (!userId) {
      activeUserId.current = null;
      dbRef.current = emptyDatabase(); setDb(emptyDatabase());
      setMode('cloud'); setPhase('signed-out'); setPending(null); setSyncState('synced');
      return;
    }
    activeUserId.current = userId;
    dbRef.current = emptyDatabase(); setDb(emptyDatabase()); setPhase('workspace-loading'); setError(null); setPending(null);
    let alive = true;
    fetchWorkspace(userId).then((remote) => {
      if (!alive || activeUserId.current !== userId) return;
      const local = localInitial.database;
      const cache = readCloudCache(userId);
      if (remote) {
        revision.current = remote.revision;
        const cacheHasPendingChanges = cache?.revision === remote.revision
          && JSON.stringify(normalizeDatabase(cache.state)) !== JSON.stringify(normalizeDatabase(remote.state));
        if (cacheHasPendingChanges) {
          dbRef.current = cache.state; setDb(cache.state); setPhase('ready'); setSyncState('offline');
          setError('This account has changes on this device that have not reached the cloud yet. Retry sync to save them or review a conflict.');
          return;
        }
        writeCloudCache(userId, remote.state, remote.revision);
        if (hasLocalRecords(local) && localStorage.getItem(migrationKey(userId)) !== '1') {
          setPending({ local, cloud: remote.state, revision: remote.revision, cloudExists: true, localWarning: localInitial.warning });
          setPhase('migration-choice');
        } else { dbRef.current = remote.state; setDb(remote.state); setPhase('ready'); setSyncState('synced'); if (localInitial.warning) setError(localInitial.warning); }
      } else if (cache) {
        revision.current = 0; dbRef.current = cache.state; setDb(cache.state); setPhase('ready'); setSyncState('offline');
        setError('The cloud workspace row is missing, but this account has a saved device copy. Retry sync to restore that copy or export a backup first.');
      } else if (hasLocalRecords(local)) {
        revision.current = 0;
        setPending({ local, cloud: emptyDatabase(), revision: 0, cloudExists: false, localWarning: localInitial.warning });
        setPhase('migration-choice');
      } else {
        const clean = emptyDatabase();
        saveWorkspace(userId, clean, 0).then((nextRevision) => {
          if (!alive || activeUserId.current !== userId) return;
          revision.current = nextRevision; dbRef.current = clean; setDb(clean); setPhase('ready'); setSyncState('synced'); if (localInitial.warning) setError(localInitial.warning);
        }).catch((reason: unknown) => {
          if (!alive) return;
          setGateError(workspaceSetupMessage(reason)); setPhase('workspace-error');
        });
      }
    }).catch((reason: unknown) => {
      if (!alive || activeUserId.current !== userId) return;
      const cache = readCloudCache(userId);
      if (cache) {
        revision.current = cache.revision; dbRef.current = cache.state; setDb(cache.state); setSyncState('offline'); setPhase('ready');
        setError('Cloud data could not be reached. Showing this account’s last saved copy; changes will retry when the connection returns.');
      } else { setGateError(workspaceSetupMessage(reason)); setPhase('workspace-error'); }
    });
    return () => { alive = false; };
  }, [authReady, userId]);

  const finishChoice = async (choice: 'cloud' | 'merge' | 'import' | 'empty') => {
    if (!pending || !session || migrationBusy) return;
    setMigrationBusy(true);
    setGateError(null);
    const userId = session.user.id;
    let next = pending.cloud;
    if (choice === 'merge' || choice === 'import') next = mergeLocalIntoCloud(pending.cloud, pending.local);
    if (choice === 'empty') next = emptyDatabase();
    if (choice !== 'cloud') {
      try {
        const nextRevision = await saveWorkspace(userId, next, pending.revision);
        revision.current = nextRevision;
      } catch (reason) {
        setGateError(`${workspaceSetupMessage(reason)} Your original browser data is unchanged.`);
        setMigrationBusy(false);
        return;
      }
    } else revision.current = pending.revision;
    try { localStorage.setItem(migrationKey(userId), '1'); } catch { /* A failed receipt write may prompt again, but never loses source data. */ }
    dbRef.current = next; setDb(next); setPhase('ready'); setSyncState('synced'); setPending(null); setMigrationBusy(false);
  };

  const apply = (change: (current: Database) => Database) => {
    const next = change(dbRef.current);
    dbRef.current = next; setDb(next);
    if (mode === 'local') {
      try { saveDatabase(next); setError(null); }
      catch { setError('This change is visible but could not be saved on this device. Check browser storage.'); }
      return;
    }
    const userId = activeUserId.current;
    if (!userId) return;
    writeCloudCache(userId, next, revision.current);
    setSyncState('saving'); setError(null);
    const snapshot = structuredClone(next);
    writeQueue.current = writeQueue.current.catch(() => undefined).then(async () => {
      if (activeUserId.current !== userId) return;
      const nextRevision = await saveWorkspace(userId, snapshot, revision.current);
      revision.current = nextRevision;
      setSyncState('synced'); setError(null);
    }).catch((reason: unknown) => {
      if (activeUserId.current !== userId) return;
      const message = reason instanceof Error ? reason.message : 'Cloud save failed.';
      setSyncState(message.includes('workspace_revision_conflict') ? 'conflict' : 'offline');
      setError(message.includes('workspace_revision_conflict')
        ? 'This workspace changed in another tab or device. Reload the cloud copy or explicitly replace it with this device’s changes.'
        : `Cloud save failed. Your latest changes remain in this device’s account cache. ${message}`);
    });
  };

  const reloadCloud = async () => {
    const userId = activeUserId.current;
    if (!userId) return;
    try {
      const remote = await fetchWorkspace(userId);
      if (!remote) throw new Error('Cloud workspace was not found.');
      revision.current = remote.revision; dbRef.current = remote.state; setDb(remote.state); writeCloudCache(userId, remote.state, remote.revision); setSyncState('synced'); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reload cloud data.'); }
  };

  const overwriteCloud = async () => {
    const userId = activeUserId.current;
    if (!userId) return;
    try {
      const latest = await fetchWorkspace(userId);
      const nextRevision = await saveWorkspace(userId, dbRef.current, latest?.revision ?? 0);
      revision.current = nextRevision; setSyncState('synced'); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not replace the cloud workspace.'); }
  };

  const retrySync = async () => {
    const userId = activeUserId.current;
    if (!userId) return;
    try {
      const latest = await fetchWorkspace(userId);
      if (latest && JSON.stringify(normalizeDatabase(latest.state)) === JSON.stringify(normalizeDatabase(dbRef.current))) {
        revision.current = latest.revision; writeCloudCache(userId, latest.state, latest.revision); setSyncState('synced'); setError(null); return;
      }
      if (latest && latest.revision !== revision.current) {
        setSyncState('conflict'); setError('Cloud data changed since this device last synced. Reload the cloud copy or explicitly replace it with this device’s changes.'); return;
      }
      const nextRevision = await saveWorkspace(userId, dbRef.current, latest?.revision ?? 0);
      revision.current = nextRevision; setSyncState('synced'); setError(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Cloud retry failed.';
      setSyncState(message.includes('workspace_revision_conflict') ? 'conflict' : 'offline'); setError(message);
    }
  };

  const signOut = async () => {
    try {
      await writeQueue.current;
      if (supabase) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not sign out cleanly.'); }
  };
  const dismissError = () => setError(null);

  if (phase === 'auth-loading') return <CenteredPanel title="Connecting to PromiseLedger" body="Checking your secure session…" />;
  if (recoveryMode) return <PasswordRecoveryScreen onDone={() => setRecoveryMode(false)} />;
  if (phase === 'signed-out') return <AuthScreen />;
  if (phase === 'workspace-loading') return <CenteredPanel title="Loading your workspace" body="Fetching your saved commitments…" />;
  if (phase === 'workspace-error') return <CenteredPanel title="Workspace unavailable" body={gateError ?? 'Could not connect to Supabase.'} action={<button className="button button-primary" onClick={() => window.location.reload()}>Try again</button>} />;
  if (phase === 'migration-choice' && pending) return <MigrationChoice pending={pending} error={gateError} busy={migrationBusy} onChoose={finishChoice} />;

  const value: WorkspaceContextValue = { db, apply, mode, email: session?.user.email ?? null, syncState, error, dismissError, signOut, retrySync, reloadCloud, overwriteCloud };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used within WorkspaceProvider.');
  return value;
}

function CenteredPanel({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <main className="connection-screen"><section className="connection-card"><span className="brand-mark">PL</span><h1>{title}</h1><p>{body}</p>{action}</section></main>;
}

function AuthScreen() {
  const [view, setView] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (!supabase) throw new Error('Supabase environment variables are missing.');
      if (view === 'sign-in') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else if (view === 'sign-up') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
        if (authError) throw authError;
        if (!data.session) setMessage('Check your email to confirm your account, then return here to sign in.');
        else setMessage('Account created. Loading your workspace…');
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (authError) throw authError;
        setMessage('If an account exists for this email, a password reset link will arrive shortly.');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication failed. Please try again.'); }
    finally { setBusy(false); }
  };
  const title = view === 'sign-in' ? 'Welcome back' : view === 'sign-up' ? 'Create your workspace' : 'Reset your password';
  return <main className="connection-screen"><section className="connection-card auth-card"><span className="brand-mark"><CheckCheck size={20} /></span><div className="eyebrow">PROMISELEDGER</div><h1>{title}</h1><p>{view === 'sign-in' ? 'Sign in to keep your commitments in sync.' : view === 'sign-up' ? 'Your business commitments, available across devices.' : 'We’ll send a secure recovery link if the account exists.'}</p>
    <form onSubmit={submit}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>{view !== 'reset' && <label>Password<input type="password" autoComplete={view === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
      {error && <div className="auth-error" role="alert">{error}</div>}{message && <div className="auth-message" role="status">{message}</div>}
      <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : view === 'sign-in' ? 'Sign in' : view === 'sign-up' ? 'Create account' : 'Send reset link'}</button>
    </form><div className="auth-links">{view === 'sign-in' && <button onClick={() => setView('reset')}>Forgot password?</button>}{view !== 'sign-in' && <button onClick={() => { setView('sign-in'); setMessage(''); setError(''); }}>Back to sign in</button>}{view !== 'sign-up' && <button onClick={() => { setView('sign-up'); setMessage(''); setError(''); }}>Create account</button>}</div>
    <small className="auth-privacy">Your workspace is private to your account.</small>
  </section></main>;
}

function PasswordRecoveryScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage('Password updated. Loading your workspace…');
      onDone();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update your password.'); }
    finally { setBusy(false); }
  };
  return <main className="connection-screen"><section className="connection-card auth-card"><span className="brand-mark"><CheckCheck size={20} /></span><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Choose a new password</h1><p>Use at least eight characters for your PromiseLedger account.</p><form onSubmit={submit}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <div className="auth-error" role="alert">{error}</div>}{message && <div className="auth-message" role="status">{message}</div>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form></section></main>;
}

function MigrationChoice({ pending, error, busy, onChoose }: { pending: { local: Database; cloud: Database; revision: number; cloudExists: boolean; localWarning: string | null }; error: string | null; busy: boolean; onChoose: (choice: 'cloud' | 'merge' | 'import' | 'empty') => Promise<void> }) {
  const localCount = pending.local.commitments.filter((item) => !item.isSample).length;
  const cloudCount = pending.cloud.commitments.length;
  return <main className="connection-screen"><section className="connection-card migration-card"><span className="brand-mark"><CheckCheck size={20} /></span><div className="eyebrow">DATA SETUP</div><h1>{pending.cloudExists ? 'Choose which records to keep' : 'Move your local commitments?'}</h1><p>{pending.cloudExists ? `This account has ${cloudCount} cloud commitments and this browser has ${localCount} local commitments.` : `Found ${localCount} locally saved commitments. The source browser data will stay in place until you choose to remove it.`}</p>
    {pending.localWarning && <div className="auth-message" role="status">{pending.localWarning}</div>}{error && <div className="auth-error" role="alert">{error}</div>}
    <div className="migration-actions">{pending.cloudExists && <button className="button button-secondary" disabled={busy} onClick={() => void onChoose('cloud')}>Keep cloud workspace</button>}<button className="button button-primary" disabled={busy} onClick={() => void onChoose(pending.cloudExists ? 'merge' : 'import')}>{pending.cloudExists ? 'Merge local records' : 'Import local records'}</button>{!pending.cloudExists && <button className="button button-ghost" disabled={busy} onClick={() => void onChoose('empty')}>Start cloud workspace empty</button>}</div>
    <small>Demo records are excluded from migration. Existing local records remain available as a backup.</small>
  </section></main>;
}
