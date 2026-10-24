export const CATEGORIES = ['Delivery', 'Payment', 'Follow-up', 'Service', 'Purchase', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const STATUSES = ['Open', 'In progress', 'Completed', 'Cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export type EventType = 'created' | 'deadline_changed' | 'status_changed' | 'progress' | 'completed' | 'reopened' | 'edited' | 'deleted';

export interface HistoryEvent {
  id: string;
  commitmentId: string;
  customerName: string;
  type: EventType;
  at: string;
  message: string;
  from?: string | null;
  to?: string | null;
  note?: string;
}

export interface Commitment {
  id: string;
  customerId: string;
  title: string;
  customerName: string;
  category: Category;
  originalDueDate: string | null;
  dueDate: string | null;
  amount: number | null;
  currency: string;
  notes: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completionNotes: string;
  history: HistoryEvent[];
  isSample?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  normalizedName: string;
  contact: string;
  notes: string;
  createdAt: string;
  isSample?: boolean;
}

export interface AppSettings {
  currency: string;
  dateFormat: 'local' | 'iso';
}

export interface Database {
  schemaVersion: 1;
  commitments: Commitment[];
  customers: Customer[];
  settings: AppSettings;
}

export interface CommitmentDraft {
  title: string;
  customerName: string;
  category: Category;
  dueDate: string;
  amount: string;
  currency: string;
  notes: string;
}

export const DEFAULT_SETTINGS: AppSettings = { currency: 'INR', dateFormat: 'local' };
export const EMPTY_DRAFT: CommitmentDraft = {
  title: '', customerName: '', category: 'Other', dueDate: '', amount: '', currency: 'INR', notes: '',
};
