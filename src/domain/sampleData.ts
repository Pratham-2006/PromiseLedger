import { createCommitment, setStatus, updateCommitment } from './commitments';
import { localDateKey } from './dates';
import type { CommitmentDraft, Database } from './types';

function shiftDate(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

const draft = (values: Partial<CommitmentDraft>): CommitmentDraft => ({
  title: '', customerName: '', category: 'Other', dueDate: '', amount: '', currency: 'INR', notes: '', ...values,
});

export function addSampleData(db: Database): Database {
  const samples: CommitmentDraft[] = [
    draft({ title: 'Deliver 12 notebooks', customerName: 'Rahul Sharma', category: 'Delivery', dueDate: shiftDate(-2), notes: 'Blue covers requested.' }),
    draft({ title: 'Collect balance for order', customerName: 'Priya Patel', category: 'Payment', dueDate: shiftDate(0), amount: '2000' }),
    draft({ title: 'Call when the new stock arrives', customerName: 'Amit Verma', category: 'Follow-up', dueDate: shiftDate(4) }),
    draft({ title: 'Repair mixer grinder', customerName: 'Neha Joshi', category: 'Service', dueDate: shiftDate(-5), notes: 'Completed; customer collected it.' }),
    draft({ title: 'Send revised quotation', customerName: 'Rahul Sharma', category: 'Follow-up', dueDate: shiftDate(2) }),
    draft({ title: 'Order printer paper', customerName: 'Corner Office', category: 'Purchase', dueDate: '' }),
    draft({ title: 'Deliver display stands', customerName: 'Priya Patel', category: 'Delivery', dueDate: shiftDate(3) }),
  ];
  let next = db;
  for (const item of samples) next = createCommitment(next, item, true);
  const completed = next.commitments.find((item) => item.isSample && item.title === 'Repair mixer grinder');
  if (completed) next = setStatus(next, completed.id, 'Completed', 'Repaired and collected on time.');
  const rescheduled = next.commitments.find((item) => item.isSample && item.title === 'Deliver display stands');
  if (rescheduled) {
    const original = rescheduled.dueDate;
    next = updateCommitment(next, rescheduled.id, { dueDate: shiftDate(6) });
    next = { ...next, commitments: next.commitments.map((item) => item.id === rescheduled.id
      ? { ...item, originalDueDate: original, history: item.history.map((event) => event.type === 'deadline_changed' ? { ...event, message: 'Delivery rescheduled after the customer requested a later date.' } : event) }
      : item) };
  }
  return next;
}

export function removeSampleData(db: Database): Database {
  const commitments = db.commitments.filter((item) => !item.isSample);
  const remainingCustomerIds = new Set(commitments.map((item) => item.customerId));
  return {
    ...db,
    commitments,
    customers: db.customers.filter((item) => !item.isSample || remainingCustomerIds.has(item.id)),
  };
}
