import type { Category, Commitment, CommitmentDraft, Customer, Database, EventType, HistoryEvent, Status } from './types';
import { DEFAULT_SETTINGS } from './types';

export function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizedCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function makeEvent(commitmentId: string, customerName: string, type: EventType, message: string, extra: Partial<HistoryEvent> = {}): HistoryEvent {
  return { id: createId(), commitmentId, customerName, type, at: new Date().toISOString(), message, ...extra };
}

export function upsertCustomer(customers: Customer[], name: string, sample = false): { customers: Customer[]; customer: Customer } {
  const clean = name.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizedCustomerName(clean);
  const existing = customers.find((customer) => customer.normalizedName === normalizedName);
  if (existing) return { customers, customer: existing };
  const customer: Customer = { id: createId(), name: clean, normalizedName, contact: '', notes: '', createdAt: new Date().toISOString(), isSample: sample };
  return { customers: [...customers, customer], customer };
}

export function createCommitment(db: Database, draft: CommitmentDraft, sample = false): Database {
  const { customers, customer } = upsertCustomer(db.customers, draft.customerName, sample);
  const commitmentId = createId();
  const title = draft.title.trim();
  const dueDate = draft.dueDate || null;
  const commitment: Commitment = {
    id: commitmentId, customerId: customer.id, title, customerName: customer.name,
    category: draft.category, originalDueDate: dueDate, dueDate,
    amount: draft.amount.trim() ? Number(draft.amount) : null,
    currency: draft.currency || db.settings.currency || 'INR', notes: draft.notes.trim(),
    status: 'Open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    completedAt: null, completionNotes: '', isSample: sample,
    history: [],
  };
  commitment.history.push(makeEvent(commitmentId, customer.name, 'created', `Promise recorded${dueDate ? ` for ${dueDate}` : ' without a deadline'}.`));
  return { ...db, customers, commitments: [commitment, ...db.commitments] };
}

export function updateCommitment(db: Database, id: string, patch: Partial<CommitmentDraft>): Database {
  const current = db.commitments.find((item) => item.id === id);
  if (!current) return db;
  let customers = db.customers;
  let customer = customers.find((item) => item.id === current.customerId)!;
  if (patch.customerName !== undefined && normalizedCustomerName(patch.customerName) !== customer.normalizedName) {
    ({ customers, customer } = upsertCustomer(customers, patch.customerName));
  }
  const changes: HistoryEvent[] = [];
  const nextDue = patch.dueDate === undefined ? current.dueDate : patch.dueDate || null;
  if (nextDue !== current.dueDate) {
    changes.push(makeEvent(id, customer.name, 'deadline_changed', `Deadline changed from ${current.dueDate ?? 'not set'} to ${nextDue ?? 'not set'}.`, { from: current.dueDate, to: nextDue }));
  }
  const nextCategory: Category = patch.category ?? current.category;
  const nextTitle = patch.title?.trim() ?? current.title;
  const nextNotes = patch.notes === undefined ? current.notes : patch.notes.trim();
  if (nextTitle !== current.title || nextCategory !== current.category || nextNotes !== current.notes || customer.name !== current.customerName) {
    changes.push(makeEvent(id, customer.name, 'edited', 'Commitment details updated.'));
  }
  const amount = patch.amount === undefined ? current.amount : patch.amount.trim() ? Number(patch.amount) : null;
  const updated: Commitment = {
    ...current,
    title: nextTitle, category: nextCategory, customerId: customer.id, customerName: customer.name,
    dueDate: nextDue, amount, currency: patch.currency ?? current.currency, notes: nextNotes,
    updatedAt: new Date().toISOString(), history: [...changes, ...current.history],
  };
  return { ...db, customers, commitments: db.commitments.map((item) => item.id === id ? updated : item) };
}

export function recordProgress(db: Database, id: string, note: string): Database {
  const commitment = db.commitments.find((item) => item.id === id);
  if (!commitment || !note.trim()) return db;
  const event = makeEvent(id, commitment.customerName, 'progress', 'Progress recorded.', { note: note.trim() });
  return patchCommitment(db, id, { history: [event, ...commitment.history] });
}

export function setStatus(db: Database, id: string, status: Status, note = ''): Database {
  const current = db.commitments.find((item) => item.id === id);
  if (!current || current.status === status) return db;
  const type: EventType = status === 'Completed' ? 'completed' : current.status === 'Completed' ? 'reopened' : 'status_changed';
  const message = status === 'Completed' ? 'Commitment completed.' : type === 'reopened' ? 'Commitment reopened.' : `Status changed to ${status.toLowerCase()}.`;
  const event = makeEvent(id, current.customerName, type, message, { from: current.status, to: status, note: note.trim() || undefined });
  const next: Partial<Commitment> = {
    status,
    completedAt: status === 'Completed' ? new Date().toISOString() : null,
    completionNotes: status === 'Completed' ? note.trim() : current.completionNotes,
    updatedAt: new Date().toISOString(),
    history: [event, ...current.history],
  };
  return patchCommitment(db, id, next);
}

function patchCommitment(db: Database, id: string, patch: Partial<Commitment>): Database {
  return { ...db, commitments: db.commitments.map((item) => item.id === id ? { ...item, ...patch } : item) };
}

export function deleteCommitment(db: Database, id: string): Database {
  return { ...db, commitments: db.commitments.filter((item) => item.id !== id) };
}

export function updateCustomer(db: Database, id: string, patch: Partial<Pick<Customer, 'name' | 'contact' | 'notes'>>): Database {
  const customer = db.customers.find((item) => item.id === id);
  if (!customer) return db;
  const name = patch.name?.trim().replace(/\s+/g, ' ') ?? customer.name;
  const normalizedName = normalizedCustomerName(name);
  const duplicate = db.customers.find((item) => item.id !== id && item.normalizedName === normalizedName);
  if (duplicate) {
    const merged = { ...duplicate, contact: duplicate.contact || customer.contact, notes: duplicate.notes || customer.notes,
      createdAt: duplicate.createdAt.localeCompare(customer.createdAt) <= 0 ? duplicate.createdAt : customer.createdAt };
    return {
      ...db,
      customers: db.customers.filter((item) => item.id !== id).map((item) => item.id === duplicate.id ? merged : item),
      commitments: db.commitments.map((item) => item.customerId === id ? { ...item, customerId: duplicate.id, customerName: duplicate.name } : item),
    };
  }
  const nextCustomer = { ...customer, ...patch, name, normalizedName };
  return {
    ...db,
    customers: db.customers.map((item) => item.id === id ? nextCustomer : item),
    commitments: db.commitments.map((item) => item.customerId === id ? { ...item, customerName: name } : item),
  };
}

export function emptyDatabase(): Database {
  return { schemaVersion: 1, commitments: [], customers: [], settings: { ...DEFAULT_SETTINGS } };
}
