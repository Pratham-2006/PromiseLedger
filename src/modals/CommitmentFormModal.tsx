import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck, X } from 'lucide-react';
import { CATEGORIES, PRIORITY_LABELS, type CommitmentDraft, type Priority } from '../domain/types';
import { CURRENCIES, currencySymbol } from '../lib/currencies';
import { Field } from '../components/ui/Field';
import { IconButton } from '../components/ui/IconButton';

interface Props {
  initial: CommitmentDraft;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSave: (draft: CommitmentDraft) => void;
}

export function CommitmentFormModal({ initial, mode, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CommitmentDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  const update = (field: keyof CommitmentDraft, value: unknown) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Add the action you promised.';
    if (!draft.customerName.trim()) next.customerName = 'Add the person or business name.';
    if (draft.amount && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0)) {
      next.amount = 'Enter a valid non-negative amount.';
    }
    if (draft.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) {
      next.dueDate = 'Choose a valid calendar date.';
    }
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    onSave({
      ...draft,
      title: draft.title.trim(),
      customerName: draft.customerName.trim(),
      notes: draft.notes.trim(),
      tags: typeof draft.tags === 'string' ? draft.tags.trim() : '',
    });
  };

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal-card form-modal" role="dialog" aria-modal="true" aria-labelledby="commitment-form-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{mode === 'edit' ? 'REFINE THE PROMISE' : 'MAKE IT CLEAR'}</span>
            <h2 id="commitment-form-title">{mode === 'edit' ? 'Edit commitment' : 'New commitment'}</h2>
            <p>Capture what you’ll do, who it’s for, and when it’s due.</p>
          </div>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
        </div>

        <form onSubmit={submit} noValidate>
          <Field label="What did you promise?" error={errors.title}>
            <input
              autoFocus
              placeholder="e.g. Deliver 12 notebooks"
              value={draft.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </Field>

          <Field label="Person or business" error={errors.customerName}>
            <input
              placeholder="e.g. Rahul Sharma"
              value={draft.customerName}
              onChange={(e) => update('customerName', e.target.value)}
            />
          </Field>

          <div className="form-row">
            <Field label="Category">
              <select value={draft.category} onChange={(e) => update('category', e.target.value)}>
                {CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}
              </select>
            </Field>

            <Field label="Priority">
              <select value={String(draft.priority ?? 0)} onChange={(e) => update('priority', Number(e.target.value) as Priority)}>
                {([0, 1, 2, 3] as Priority[]).map((p) => (
                  <option key={p} value={String(p)}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="form-row">
            <Field label="Deadline" hint="Leave blank if no date was promised." error={errors.dueDate}>
              <input type="date" value={draft.dueDate} onChange={(e) => update('dueDate', e.target.value)} />
            </Field>

            <Field label="Tags" hint="Comma-separated (e.g. urgent, Q4, vip)">
              <input
                placeholder="urgent, project-alpha"
                value={draft.tags}
                onChange={(e) => update('tags', e.target.value)}
              />
            </Field>
          </div>

          <div className="form-row">
            <Field label="Amount (optional)" error={errors.amount}>
              <div className="amount-input">
                <span>{currencySymbol(draft.currency)}</span>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draft.amount}
                  onChange={(e) => update('amount', e.target.value)}
                />
              </div>
            </Field>

            <Field label="Currency">
              <select value={draft.currency} onChange={(e) => update('currency', e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notes" hint="Context, specifications, or anything worth remembering.">
            <textarea
              rows={3}
              placeholder="Optional details…"
              value={draft.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </Field>

          <div className="modal-footer">
            <span className="modal-safe-note">
              <ShieldCheck size={14} />Deadline changes stay visible in history.
            </span>
            <div>
              <button className="button button-ghost" type="button" onClick={onClose}>Cancel</button>
              <button className="button button-primary" type="submit">
                {mode === 'edit' ? 'Save changes' : 'Save promise'}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
