import { describe, it, expect } from 'vitest';
import { loadDatabase, saveDatabase, exportCommitmentsAsCSV } from './storage';
import { createMemoryStorage } from './IStorage';
import type { Database } from './types';

describe('storage & IStorage', () => {
  it('round-trips a database through memory storage', () => {
    const mem = createMemoryStorage();
    const db: Database = {
      schemaVersion: 2,
      commitments: [],
      customers: [],
      settings: { currency: 'USD', dateFormat: 'iso', theme: 'dark' },
    };
    saveDatabase(db, mem);
    const { database, warning } = loadDatabase(mem);
    expect(warning).toBeNull();
    expect(database.settings.currency).toBe('USD');
    expect(database.settings.theme).toBe('dark');
    expect(database.commitments).toHaveLength(0);
  });

  it('migrates schemaVersion 1 data to schemaVersion 2', () => {
    const mem = createMemoryStorage({
      'promiseledger.data': JSON.stringify({
        schemaVersion: 1,
        commitments: [
          {
            id: 'legacy-1',
            customerId: 'c1',
            title: 'Legacy promise',
            customerName: 'Sam',
            category: 'Delivery',
            dueDate: '2026-10-25',
            status: 'Open',
            createdAt: '2026-10-20T00:00:00Z',
          },
        ],
        customers: [{ id: 'c1', name: 'Sam', normalizedName: 'sam', contact: '', notes: '', createdAt: '2026-10-20T00:00:00Z' }],
        settings: { currency: 'INR', dateFormat: 'local' },
      }),
    });

    const { database } = loadDatabase(mem);
    expect(database.schemaVersion).toBe(2);
    expect(database.commitments).toHaveLength(1);
    expect(database.commitments[0].deletedAt).toBeNull();
    expect(database.commitments[0].priority).toBe(0);
    expect(database.commitments[0].tags).toEqual([]);
    expect(database.settings.theme).toBe('system');
  });

  it('exports commitments to CSV format', () => {
    const db: Database = {
      schemaVersion: 2,
      commitments: [
        {
          id: 'c1',
          customerId: 'cust1',
          title: 'Deliver books',
          customerName: 'Alice',
          category: 'Delivery',
          originalDueDate: '2026-10-25',
          dueDate: '2026-10-25',
          amount: 500,
          currency: 'INR',
          notes: 'Special packaging',
          status: 'Open',
          completionNotes: '',
          createdAt: '2026-10-20T00:00:00Z',
          updatedAt: '2026-10-20T00:00:00Z',
          completedAt: null,
          deletedAt: null,
          priority: 2,
          tags: ['urgent'],
          history: [],
        },
      ],
      customers: [],
      settings: { currency: 'INR', dateFormat: 'local', theme: 'system' },
    };

    const csv = exportCommitmentsAsCSV(db);
    expect(csv).toContain('"ID","Title","Customer","Category"');
    expect(csv).toContain('"c1","Deliver books","Alice","Delivery"');
    expect(csv).toContain('"500"');
    expect(csv).toContain('"urgent"');
  });
});
