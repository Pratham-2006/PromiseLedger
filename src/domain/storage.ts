import { DEFAULT_SETTINGS, type AppSettings, type Category, type Commitment, type Customer, type Database, type EventType, type HistoryEvent, type Priority, type Status } from './types';
import { normalizedCustomerName } from './commitments';
import { type IStorage, browserStorage } from './IStorage';

const STORAGE_KEY = 'promiseledger.data';
const LEGACY_KEY = 'promiseledger.commitments';
const categories: Category[] = ['Delivery', 'Payment', 'Follow-up', 'Service', 'Purchase', 'Other'];
const statuses: Status[] = ['Open', 'In progress', 'Completed', 'Cancelled'];
const eventTypes: EventType[] = ['created', 'deadline_changed', 'status_changed', 'progress', 'completed', 'reopened', 'edited', 'deleted'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? value : null;
}

function normalizeCommitment(value: unknown): Commitment | null {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.customerName !== 'string') return null;
  const id = typeof value.id === 'string' && value.id ? value.id : `migrated-${Math.random().toString(36).slice(2)}`;
  const customerName = value.customerName.trim().replace(/\s+/g, ' ');
  if (!customerName || !value.title.trim()) return null;
  const dueDate = cleanDate(value.dueDate ?? value.currentDueDate);
  const originalDueDate = cleanDate(value.originalDueDate) ?? dueDate;
  const createdAt = typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt)) ? value.createdAt : new Date().toISOString();
  const history: HistoryEvent[] = Array.isArray(value.history) ? value.history.flatMap((raw, index) => {
    if (!isRecord(raw) || typeof raw.message !== 'string') return [];
    const type = eventTypes.includes(raw.type as EventType) ? raw.type as EventType : 'edited';
    return [{ id: typeof raw.id === 'string' ? raw.id : `${id}-${type}-${index}`, commitmentId: id,
      customerName, type, at: typeof raw.at === 'string' && !Number.isNaN(Date.parse(raw.at)) ? raw.at : createdAt,
      message: raw.message, from: typeof raw.from === 'string' ? raw.from : null, to: typeof raw.to === 'string' ? raw.to : null,
      note: typeof raw.note === 'string' ? raw.note : undefined }];
  }) : [];
  if (!history.length) history.push({ id: `${id}-created`, commitmentId: id, customerName, type: 'created', at: createdAt, message: 'Promise recorded.' });
  const amount = typeof value.amount === 'number' ? value.amount : typeof value.amount === 'string' && value.amount.trim() ? Number(value.amount) : null;
  return {
    id, customerId: typeof value.customerId === 'string' ? value.customerId : normalizedCustomerName(customerName),
    title: value.title.trim(), customerName, category: categories.includes(value.category as Category) ? value.category as Category : 'Other',
    originalDueDate, dueDate, amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: typeof value.currency === 'string' ? value.currency : DEFAULT_SETTINGS.currency,
    notes: typeof value.notes === 'string' ? value.notes : '',
    status: statuses.includes(value.status as Status) ? value.status as Status : 'Open',
    createdAt, updatedAt: typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt)) ? value.updatedAt : createdAt,
    completedAt: typeof value.completedAt === 'string' && !Number.isNaN(Date.parse(value.completedAt)) ? value.completedAt : null,
    completionNotes: typeof value.completionNotes === 'string' ? value.completionNotes : '',
    // V2 fields — default gracefully when loading older data
    deletedAt: typeof value.deletedAt === 'string' && !Number.isNaN(Date.parse(value.deletedAt)) ? value.deletedAt : null,
    priority: ([0, 1, 2, 3] as Priority[]).includes(value.priority as Priority) ? value.priority as Priority : 0,
    tags: Array.isArray(value.tags) ? (value.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    history,
    isSample: value.isSample === true,
  };
}

/** §15 Migrate schemaVersion 1 → 2 (adds deletedAt, priority, tags). */
function migrateToV2(db: Omit<Database, 'schemaVersion'> & { schemaVersion: number }): Database {
  return {
    ...db,
    schemaVersion: 2,
    commitments: db.commitments.map((c) => ({
      ...c,
      deletedAt: c.deletedAt ?? null,
      priority: (c.priority ?? 0) as Priority,
      tags: c.tags ?? [],
    })),
    settings: {
      ...db.settings,
      theme: db.settings.theme ?? 'system',
    },
  };
}

export function normalizeDatabase(value: unknown): Database {
  if (Array.isArray(value)) {
    const commitments = value.map(normalizeCommitment).filter((item): item is Commitment => item !== null);
    const customersByName = new Map<string, Customer>();
    commitments.forEach((item) => {
      const key = normalizedCustomerName(item.customerName);
      if (key && !customersByName.has(key)) customersByName.set(key, { id: item.customerId || key, name: item.customerName, normalizedName: key, contact: '', notes: '', createdAt: item.createdAt });
    });
    return { schemaVersion: 2, commitments, customers: [...customersByName.values()], settings: { ...DEFAULT_SETTINGS } };
  }
  if (!isRecord(value)) return { schemaVersion: 2, commitments: [], customers: [], settings: { ...DEFAULT_SETTINGS } };
  if (typeof value.schemaVersion === 'number' && value.schemaVersion > 2) throw new Error('This data was created by a newer PromiseLedger version.');
  const commitments = Array.isArray(value.commitments) ? value.commitments.map(normalizeCommitment).filter((item): item is Commitment => item !== null) : [];
  const rawCustomers = Array.isArray(value.customers) ? value.customers.filter(isRecord) : [];
  const customersByName = new Map<string, Customer>();
  rawCustomers.forEach((item) => {
    if (typeof item.name !== 'string' || !item.name.trim()) return;
    const normalizedName = normalizedCustomerName(item.name);
    const customer: Customer = {
      id: typeof item.id === 'string' ? item.id : normalizedName, name: item.name.trim().replace(/\s+/g, ' '), normalizedName,
      contact: typeof item.contact === 'string' ? item.contact : '', notes: typeof item.notes === 'string' ? item.notes : '',
      createdAt: typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString(),
      isSample: item.isSample === true,
    };
    if (!customersByName.has(normalizedName)) customersByName.set(normalizedName, customer);
  });
  commitments.forEach((item) => {
    const key = normalizedCustomerName(item.customerName);
    if (!customersByName.has(key)) customersByName.set(key, { id: item.customerId || key, name: item.customerName, normalizedName: key, contact: '', notes: '', createdAt: item.createdAt, isSample: item.isSample });
  });
  const rawSettings = isRecord(value.settings) ? value.settings : {};
  const settings: AppSettings = {
    currency: typeof rawSettings.currency === 'string' ? rawSettings.currency : DEFAULT_SETTINGS.currency,
    dateFormat: rawSettings.dateFormat === 'iso' ? 'iso' : 'local',
    theme: (['light', 'dark', 'system'] as const).includes(rawSettings.theme as AppSettings['theme']) ? rawSettings.theme as AppSettings['theme'] : 'system',
  };
  const raw: Omit<Database, 'schemaVersion'> & { schemaVersion: number } = { schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : 1, commitments, customers: [...customersByName.values()], settings };
  // Migrate older schemas to current version
  if (raw.schemaVersion < 2) return migrateToV2(raw);
  return raw as Database;
}

export function loadDatabase(storage: IStorage = browserStorage): { database: Database; warning: string | null } {
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current) {
      try {
        const parsed: unknown = JSON.parse(current);
        const database = normalizeDatabase(parsed);
        const hadUnrecognizedRecords = isRecord(parsed) && Array.isArray(parsed.commitments) && database.commitments.length !== parsed.commitments.length;
        return { database, warning: hadUnrecognizedRecords ? 'Some saved records could not be read. The original browser data was left untouched.' : null };
      }
      catch { return { database: { schemaVersion: 2, commitments: [], customers: [], settings: { ...DEFAULT_SETTINGS } }, warning: 'Saved data could not be read. Your original browser data was left untouched.' }; }
    }
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy);
      const database = normalizeDatabase(parsed);
      if (Array.isArray(parsed) && database.commitments.length !== parsed.length) return { database, warning: 'Some older records could not be migrated. The original browser data was left untouched.' };
      saveDatabase(database, storage);
      storage.removeItem(LEGACY_KEY);
      return { database, warning: 'Older saved data was migrated to the current format.' };
    }
    return { database: { schemaVersion: 2, commitments: [], customers: [], settings: { ...DEFAULT_SETTINGS } }, warning: null };
  } catch {
    return { database: { schemaVersion: 2, commitments: [], customers: [], settings: { ...DEFAULT_SETTINGS } }, warning: 'Browser storage is unavailable. Changes may not persist.' };
  }
}

export function saveDatabase(database: Database, storage: IStorage = browserStorage): void {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      const parsed: unknown = JSON.parse(existing);
      if (isRecord(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > 2) throw new Error('Saved data was created by a newer PromiseLedger version and was not overwritten.');
      if (!isRecord(parsed) || !Array.isArray(parsed.commitments)) throw new Error('Saved data is damaged and was not overwritten. Export it for recovery before replacing it.');
    } catch (error) {
      if (error instanceof Error && (error.message.includes('newer PromiseLedger') || error.message.includes('not overwritten'))) throw error;
      throw new Error('Saved data is damaged and was not overwritten. Export it for recovery before replacing it.');
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export function exportDatabase(database: Database): string {
  return JSON.stringify({ ...database, exportedAt: new Date().toISOString() }, null, 2);
}

/** §9: Export active commitments as CSV for spreadsheet import. */
export function exportCommitmentsAsCSV(db: Database): string {
  const headers = ['ID', 'Title', 'Customer', 'Category', 'Status', 'Priority', 'Tags', 'Due Date', 'Original Due Date', 'Amount', 'Currency', 'Created At', 'Completed At', 'Notes'];
  const rows = db.commitments
    .filter((c) => !c.isSample && !c.deletedAt)
    .map((c) => [
      c.id, c.title, c.customerName, c.category, c.status,
      String(c.priority ?? 0), (c.tags ?? []).join(';'),
      c.dueDate ?? '', c.originalDueDate ?? '',
      c.amount !== null ? String(c.amount) : '', c.currency,
      c.createdAt.slice(0, 10), c.completedAt?.slice(0, 10) ?? '',
      c.notes.replace(/\n/g, ' '),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`));
  return [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function validateImport(value: unknown): Database {
  if (!isRecord(value) || !Array.isArray(value.commitments) || !Array.isArray(value.customers)) throw new Error('This file is not a PromiseLedger backup.');
  const db = normalizeDatabase(value);
  if (db.commitments.length !== value.commitments.length) throw new Error('Some commitments are invalid. No data was imported.');
  return db;
}

export const STORAGE_KEY_FOR_TESTS = STORAGE_KEY;
