import { describe, it, expect } from 'vitest';
import { filterCommitments } from './filter';
import type { Commitment } from './types';

const base: Commitment = {
  id: '1', customerId: 'c1', title: 'Deliver chairs', customerName: 'Alice', category: 'Delivery',
  originalDueDate: null, dueDate: null, amount: null, currency: 'INR', notes: '',
  status: 'Open', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  completedAt: null, completionNotes: '', history: [], deletedAt: null, priority: 0, tags: [],
};

describe('filterCommitments', () => {
  it('excludes soft-deleted commitments', () => {
    const deleted = { ...base, id: 'del', deletedAt: '2026-01-02T00:00:00Z' };
    const result = filterCommitments([base, deleted], {});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by query across title, customer name, and notes', () => {
    const item2 = { ...base, id: '2', title: 'Service ac', customerName: 'Bob' };
    const r1 = filterCommitments([base, item2], { query: 'alice' });
    expect(r1).toHaveLength(1);
    expect(r1[0].id).toBe('1');

    const r2 = filterCommitments([base, item2], { query: 'chairs' });
    expect(r2).toHaveLength(1);
    expect(r2[0].id).toBe('1');
  });

  it('filters by priority', () => {
    const high = { ...base, id: '2', priority: 3 as const };
    const r = filterCommitments([base, high], { priority: 3 });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('2');
  });

  it('filters by tags', () => {
    const tagged = { ...base, id: '3', tags: ['vip', 'urgent'] };
    const r = filterCommitments([base, tagged], { tags: ['vip'] });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('3');
  });

  it('sorts by priority descending', () => {
    const low = { ...base, id: 'low', priority: 1 as const };
    const high = { ...base, id: 'high', priority: 3 as const };
    const r = filterCommitments([low, high, base], { sort: 'priority' });
    expect(r[0].id).toBe('high');
    expect(r[1].id).toBe('low');
    expect(r[2].id).toBe('1');
  });
});
