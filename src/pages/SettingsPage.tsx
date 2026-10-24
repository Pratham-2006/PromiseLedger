import { Download, Plus, Settings2, ShieldCheck, Sparkles, Tag, Trash2 } from 'lucide-react';
import type { Database } from '../domain/types';
import { CURRENCIES } from '../lib/currencies';
import { exportCommitmentsAsCSV, exportDatabase, validateImport } from '../domain/storage';
import { localDateKey } from '../domain/dates';
import { Field } from '../components/ui/Field';

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
    </div>
  );
}

interface Props {
  db: Database;
  onSettings: (settings: Partial<Database['settings']>) => void;
  onLoadSamples: () => void;
  onRemoveSamples: () => void;
  onClear: () => void;
  onImport: (value: Database) => void;
}

export function SettingsPage({ db, onSettings, onLoadSamples, onRemoveSamples, onClear, onImport }: Props) {
  const sampleCount = db.commitments.filter((item) => item.isSample).length;

  const exportJSON = () => {
    const blob = new Blob([exportDatabase(db)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `promiseledger-backup-${localDateKey()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const csv = exportCommitmentsAsCSV(db);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `promiseledger-${localDateKey()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = validateImport(JSON.parse(await file.text()));
      onImport(imported);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not read this backup.');
    }
    event.target.value = '';
  };

  return (
    <>
      <PageHeading eyebrow="YOUR WORKSPACE" title="Settings" description="Small preferences for how PromiseLedger works on this device." />
      <div className="settings-layout">
        <div className="settings-main">
          <section className="panel settings-panel">
            <div className="settings-section-title">
              <span className="settings-icon"><Tag size={16} /></span>
              <div><h2>Display preferences</h2><p>Choose how amounts and dates appear.</p></div>
            </div>
            <div className="settings-fields">
              <Field label="Default currency for new amounts" hint="Existing amounts keep their recorded currency. No conversion or payments.">
                <select value={db.settings.currency} onChange={(e) => onSettings({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Date format">
                <select value={db.settings.dateFormat} onChange={(e) => onSettings({ dateFormat: e.target.value as 'local' | 'iso' })}>
                  <option value="local">Local format (24 Oct 2026)</option>
                  <option value="iso">ISO format (2026-10-24)</option>
                </select>
              </Field>
              <Field label="Appearance">
                <select value={db.settings.theme ?? 'system'} onChange={(e) => onSettings({ theme: e.target.value as Database['settings']['theme'] })}>
                  <option value="system">System default</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="settings-section-title">
              <span className="settings-icon settings-green"><Sparkles size={16} /></span>
              <div><h2>Sample shop data</h2><p>Explore a fictional shop ledger. Every seeded item is labeled as demo data.</p></div>
            </div>
            <div className="sample-preview">
              <div>
                <b>{sampleCount ? `${sampleCount} sample commitments loaded` : 'A ready-made shop ledger'}</b>
                <small>Overdue delivery · payment due today · rescheduled promise · no-deadline order</small>
              </div>
              <div className="sample-actions">
                {sampleCount
                  ? <button className="button button-secondary button-sm" onClick={onRemoveSamples}><Trash2 size={14} />Remove samples</button>
                  : <button className="button button-secondary button-sm" onClick={onLoadSamples}><Plus size={14} />Load sample data</button>
                }
              </div>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="settings-section-title">
              <span className="settings-icon"><Download size={16} /></span>
              <div><h2>Backup and restore</h2><p>Export a portable backup or import one you saved earlier.</p></div>
            </div>
            <div className="data-actions">
              <button className="button button-secondary" onClick={exportJSON}><Download size={15} />Export JSON</button>
              <button className="button button-secondary" onClick={exportCSV}><Download size={15} />Export CSV</button>
              <label className="button button-secondary file-button">
                <Plus size={15} />Import backup
                <input type="file" accept="application/json,.json" onChange={importData} />
              </label>
              <span>Imports are validated before replacing any local data.</span>
            </div>
          </section>
        </div>

        <aside className="panel privacy-panel">
          <span className="privacy-icon"><ShieldCheck size={19} /></span>
          <h3>Your ledger is yours.</h3>
          <p>PromiseLedger stores records in this browser. No account, cloud sync, or third-party service is connected.</p>
          <div className="privacy-divider" />
          <div className="privacy-facts">
            <span><Settings2 size={14} />Saved locally</span>
            <span><ShieldCheck size={14} />No tracking scripts</span>
            <span><Download size={14} />Export whenever you need</span>
          </div>
          <button className="danger-link" onClick={onClear}><Trash2 size={14} />Clear all local data</button>
        </aside>
      </div>
    </>
  );
}
