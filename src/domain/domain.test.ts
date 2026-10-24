import { describe, expect, it } from 'vitest';
import { createCommitment, emptyDatabase, setStatus, upsertCustomer, updateCommitment } from './commitments';
import { datePhraseToKey, isDueToday, isOverdue, localDateKey } from './dates';
import { filterCommitments } from './filter';
import { parseQuickEntry } from './parser';
import { loadDatabase, normalizeDatabase, saveDatabase, STORAGE_KEY_FOR_TESTS } from './storage';
import type { CommitmentDraft } from './types';

const sampleDraft = (overrides: Partial<CommitmentDraft> = {}): CommitmentDraft => ({
  title: 'Deliver notebooks', customerName: 'Rahul Sharma', category: 'Delivery', dueDate: '2026-10-24', amount: '', currency: 'INR', notes: '', ...overrides,
});

describe('local calendar dates and status derivation', () => {
  it('formats the local calendar date without converting it through UTC', () => {
    expect(localDateKey(new Date(2026, 9, 24, 23, 30))).toBe('2026-10-24');
  });

  it('derives overdue and due-today states only for active commitments', () => {
    expect(isOverdue('2026-10-23', 'Open', '2026-10-24')).toBe(true);
    expect(isOverdue('2026-10-23', 'Completed', '2026-10-24')).toBe(false);
    expect(isOverdue(null, 'Open', '2026-10-24')).toBe(false);
    expect(isDueToday('2026-10-24', 'In progress', '2026-10-24')).toBe(true);
    expect(isDueToday('2026-10-24', 'Cancelled', '2026-10-24')).toBe(false);
  });

  it('parses tomorrow and weekday phrases relative to the local calendar', () => {
    const saturday = new Date(2026, 9, 24, 12);
    expect(datePhraseToKey('tomorrow', saturday)).toBe('2026-10-25');
    expect(datePhraseToKey('next Friday', saturday)).toBe('2026-10-30');
    expect(datePhraseToKey('someday', saturday)).toBeNull();
  });
});

describe('one-sentence capture', () => {
  it('extracts an action, person, category and relative date', () => {
    const result = parseQuickEntry('Deliver 12 notebooks to Rahul tomorrow.', new Date(2026, 9, 24));
    expect(result.draft.title).toBe('Deliver 12 notebooks');
    expect(result.draft.customerName).toBe('Rahul');
    expect(result.draft.category).toBe('Delivery');
    expect(result.draft.dueDate).toBe('2026-10-25');
    expect(result.confidence).toBe('parsed');
  });

  it('extracts an INR amount and safely leaves unsupported dates blank', () => {
    const result = parseQuickEntry('Collect ₹2,000 from Priya when she visits', new Date(2026, 9, 24));
    expect(result.draft.amount).toBe('2000');
    expect(result.draft.customerName).toBe('Priya');
    expect(result.draft.dueDate).toBe('');
    expect(result.confidence).toBe('parsed');
  });

  it('recognizes a direct recipient and explicit ISO deadline', () => {
    const result = parseQuickEntry('Send Neha the quotation by 2026-11-02', new Date(2026, 9, 24));
    expect(result.draft.title).toBe('Send the quotation');
    expect(result.draft.customerName).toBe('Neha');
    expect(result.draft.dueDate).toBe('2026-11-02');
  });

  it('recognizes a person named directly after call', () => {
    const result = parseQuickEntry('Call Amit when the new stock arrives');
    expect(result.draft.title).toBe('Call when the new stock arrives');
    expect(result.draft.customerName).toBe('Amit');
    expect(result.draft.dueDate).toBe('');
  });

  it('keeps unsupported input available for manual completion', () => {
    const input = 'Sort out the storefront display';
    const result = parseQuickEntry(input);
    expect(result.draft.title).toBe(input);
    expect(result.draft.customerName).toBe('');
    expect(result.draft.dueDate).toBe('');
    expect(result.confidence).toBe('fallback');
  });
});

describe('commitment lifecycle and filters', () => {
  it('retains the original due date and records a deadline change', () => {
    const created = createCommitment(emptyDatabase(), sampleDraft());
    const item = created.commitments[0];
    const updated = updateCommitment(created, item.id, { dueDate: '2026-10-28' }).commitments[0];
    expect(updated.originalDueDate).toBe('2026-10-24');
    expect(updated.dueDate).toBe('2026-10-28');
    expect(updated.history[0].type).toBe('deadline_changed');
  });

  it('keeps an unspecified deadline blank when a commitment is created', () => {
    const created = createCommitment(emptyDatabase(), sampleDraft({ dueDate: '' }));
    expect(created.commitments[0].originalDueDate).toBeNull();
    expect(created.commitments[0].dueDate).toBeNull();
    expect(isOverdue(created.commitments[0].dueDate, created.commitments[0].status, '2026-10-24')).toBe(false);
  });

  it('records completion and reopening as separate events', () => {
    const created = createCommitment(emptyDatabase(), sampleDraft());
    const item = created.commitments[0];
    const completed = setStatus(created, item.id, 'Completed', 'Dropped off at the shop.').commitments[0];
    expect(completed.completedAt).toBeTruthy();
    expect(completed.history[0].type).toBe('completed');
    const reopened = setStatus({ ...created, commitments: [completed] }, item.id, 'Open').commitments[0];
    expect(reopened.status).toBe('Open');
    expect(reopened.completedAt).toBeNull();
    expect(reopened.history[0].type).toBe('reopened');
  });

  it('filters by deadline and excludes completed records from overdue lists', () => {
    let db = createCommitment(emptyDatabase(), sampleDraft({ title: 'Past due', dueDate: '2026-10-23' }));
    db = createCommitment(db, sampleDraft({ title: 'No date', dueDate: '' }));
    db = createCommitment(db, sampleDraft({ title: 'Coming up', dueDate: '2026-10-28' }));
    const overdue = filterCommitments(db.commitments, { schedule: 'overdue', today: '2026-10-24' });
    expect(overdue.map((item) => item.title)).toEqual(['Past due']);
    expect(filterCommitments(db.commitments, { schedule: 'no-date', today: '2026-10-24' }).map((item) => item.title)).toEqual(['No date']);
    expect(filterCommitments(db.commitments, { schedule: 'upcoming', today: '2026-10-24' }).map((item) => item.title)).toEqual(['Coming up']);
    expect(filterCommitments(db.commitments, { query: 'rahul', today: '2026-10-24' })).toHaveLength(3);
  });

  it('matches customer names without case or whitespace duplicates', () => {
    const first = upsertCustomer([], '  Rahul   Sharma ');
    const second = upsertCustomer(first.customers, 'rahul sharma');
    expect(second.customers).toHaveLength(1);
    expect(second.customer.id).toBe(first.customer.id);
  });

  it('recovers gracefully from malformed stored values', () => {
    expect(normalizeDatabase(null).commitments).toEqual([]);
    expect(normalizeDatabase({ schemaVersion: 1, commitments: 'broken', customers: null }).commitments).toEqual([]);
    expect(() => normalizeDatabase({ schemaVersion: 99, commitments: [], customers: [] })).toThrow('newer PromiseLedger');
  });

  it('keeps malformed local storage intact and blocks overwrites', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map<string, string>([[STORAGE_KEY_FOR_TESTS, '{broken json']]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    try {
      expect(loadDatabase().warning).toContain('left untouched');
      expect(() => saveDatabase(emptyDatabase())).toThrow('not overwritten');
      expect(values.get(STORAGE_KEY_FOR_TESTS)).toBe('{broken json');
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
