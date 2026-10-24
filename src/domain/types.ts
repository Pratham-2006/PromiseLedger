export const CATEGORIES = ['Delivery', 'Payment', 'Follow-up', 'Service', 'Purchase', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const STATUSES = ['Open', 'In progress', 'Completed', 'Cancelled'] as const;
export type Status = (typeof STATUSES)[number];
export type EventType = 'created' | 'deadline_changed' | 'status_changed' | 'progress' | 'completed' | 'reopened' | 'edited' | 'deleted';
export type Priority = 0 | 1 | 2 | 3; // 0=none, 1=low, 2=medium, 3=high
export const PRIORITY_LABELS: Record<Priority, string> = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' };

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
  /** ISO string when soft-deleted; null when active. Deleted items are hidden from all views. */
  deletedAt: string | null;
  /** 0=none, 1=low, 2=medium, 3=high */
  priority: Priority;
  /** Free-form user tags, e.g. ["urgent", "Q4"] */
  tags: string[];
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
  theme: 'light' | 'dark' | 'system';
}

export interface Database {
  schemaVersion: 2;
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
  priority: Priority;
  tags: string; // comma-separated string for form input
}

export const DEFAULT_SETTINGS: AppSettings = { currency: 'INR', dateFormat: 'local', theme: 'system' };
export const EMPTY_DRAFT: CommitmentDraft = {
  title: '', customerName: '', category: 'Other', dueDate: '', amount: '', currency: 'INR', notes: '', priority: 0, tags: '',
};
