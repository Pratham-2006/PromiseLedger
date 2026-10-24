import { describe, it, expect } from 'vitest';
import { parseQuickEntry } from './parser';

describe('parseQuickEntry', () => {
  it('extracts person, date, amount from full sentence', () => {
    const result = parseQuickEntry('Deliver 12 notebooks to Rahul tomorrow for ₹500');
    expect(result.draft.customerName).toBe('Rahul');
    expect(result.draft.amount).toBe('500');
    expect(result.draft.currency).toBe('INR');
    expect(result.draft.category).toBe('Delivery');
    expect(result.confidence).toBe('parsed');
    expect(result.draft.dueDate).not.toBe('');
  });

  it('falls back gracefully when nothing is recognized', () => {
    const result = parseQuickEntry('hello world');
    expect(result.confidence).toBe('fallback');
    expect(result.draft.title).toBe('hello world');
  });

  it('uses defaultCurrency when no currency symbol is present', () => {
    const result = parseQuickEntry('Pay 200 to John', new Date(), 'USD');
    expect(result.draft.currency).toBe('USD');
  });

  it('extracts USD from dollar sign', () => {
    const result = parseQuickEntry('Pay $300 to Alice tomorrow');
    expect(result.draft.currency).toBe('USD');
    expect(result.draft.amount).toBe('300');
  });

  it('extracts EUR from euro sign', () => {
    const result = parseQuickEntry('Transfer €150 to Marco next Friday');
    expect(result.draft.currency).toBe('EUR');
    expect(result.draft.amount).toBe('150');
  });

  it('extracts GBP from pound sign', () => {
    const result = parseQuickEntry('Send £75 to Oliver today');
    expect(result.draft.currency).toBe('GBP');
    expect(result.draft.amount).toBe('75');
  });
});
