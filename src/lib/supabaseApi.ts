/**
 * Typed Supabase API wrapper.
 * All DB interactions can go through this file for direct relational access.
 */
import { supabase } from './supabase';
import type { DatabaseTypes } from './database.types';
import type { Commitment, Customer, Database, HistoryEvent, AppSettings, Priority } from '../domain/types';

type DBCommitment = DatabaseTypes['public']['Tables']['commitments']['Row'];
type DBCustomer = DatabaseTypes['public']['Tables']['customers']['Row'];
type DBEvent = DatabaseTypes['public']['Tables']['commitment_events']['Row'];

function mapCustomer(r: DBCustomer): Customer {
  return {
    id: r.id,
    name: r.name,
    normalizedName: r.normalized_name,
    contact: r.contact,
    notes: r.notes,
    createdAt: r.created_at,
    isSample: r.is_sample,
  };
}

function mapEvent(r: DBEvent): HistoryEvent {
  return {
    id: r.id,
    commitmentId: r.commitment_id,
    customerName: r.customer_name,
    type: r.type,
    at: r.created_at,
    message: r.message,
    from: r.from ?? null,
    to: r.to ?? null,
    note: r.note ?? undefined,
  };
}

function mapCommitment(r: DBCommitment, events: DBEvent[]): Commitment {
  return {
    id: r.id,
    customerId: r.customer_id,
    title: r.title,
    customerName: r.customer_name,
    category: r.category,
    originalDueDate: r.original_due_date,
    dueDate: r.due_date,
    amount: r.amount,
    currency: r.currency,
    notes: r.notes,
    status: r.status,
    completionNotes: r.completion_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    deletedAt: r.deleted_at,
    priority: (r.priority ?? 0) as Priority,
    tags: r.tags ?? [],
    isSample: r.is_sample,
    history: events.filter((e) => e.commitment_id === r.id).map(mapEvent),
  };
}

export async function fetchFullWorkspace(): Promise<Database> {
  if (!supabase) throw new Error('Supabase not configured.');
  const [customersRes, commitmentsRes, eventsRes, settingsRes] = await Promise.all([
    supabase.from('customers').select('*').order('created_at'),
    supabase.from('commitments').select('*').order('created_at', { ascending: false }),
    supabase.from('commitment_events').select('*').order('created_at', { ascending: false }),
    supabase.from('user_settings').select('*').maybeSingle(),
  ]);

  if (customersRes.error) throw customersRes.error;
  if (commitmentsRes.error) throw commitmentsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (settingsRes.error) throw settingsRes.error;

  const customers = (customersRes.data ?? []).map(mapCustomer);
  const events = eventsRes.data ?? [];
  const commitments = (commitmentsRes.data ?? []).map((c) => mapCommitment(c, events));
  const settings: AppSettings = settingsRes.data
    ? {
        currency: settingsRes.data.currency,
        dateFormat: settingsRes.data.date_format,
        theme: settingsRes.data.theme ?? 'system',
      }
    : { currency: 'INR', dateFormat: 'local', theme: 'system' };

  return { schemaVersion: 2, customers, commitments, settings };
}

export async function saveCustomer(customer: Customer, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { error } = await supabase.from('customers').upsert({
    id: customer.id,
    user_id: userId,
    name: customer.name,
    normalized_name: customer.normalizedName,
    contact: customer.contact,
    notes: customer.notes,
    is_sample: customer.isSample ?? false,
  });
  if (error) throw error;
}

export async function saveCommitment(commitment: Commitment, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { error } = await supabase.from('commitments').upsert({
    id: commitment.id,
    user_id: userId,
    customer_id: commitment.customerId,
    title: commitment.title,
    customer_name: commitment.customerName,
    category: commitment.category,
    original_due_date: commitment.originalDueDate,
    due_date: commitment.dueDate,
    amount: commitment.amount,
    currency: commitment.currency,
    notes: commitment.notes,
    status: commitment.status,
    completion_notes: commitment.completionNotes,
    priority: commitment.priority,
    tags: commitment.tags,
    is_sample: commitment.isSample ?? false,
    completed_at: commitment.completedAt,
    deleted_at: commitment.deletedAt,
  });
  if (error) throw error;
}

export async function appendEvent(event: HistoryEvent, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { error } = await supabase.from('commitment_events').insert({
    id: event.id,
    user_id: userId,
    commitment_id: event.commitmentId,
    customer_name: event.customerName,
    type: event.type,
    message: event.message,
    from: event.from ?? null,
    to: event.to ?? null,
    note: event.note ?? null,
  });
  if (error) throw error;
}

export async function deleteCommitmentRemote(commitmentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { error } = await supabase.rpc('soft_delete_commitment', { p_commitment_id: commitmentId });
  if (error) throw error;
}

export async function saveSettings(settings: AppSettings, _userId?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { error } = await supabase.rpc('upsert_settings', {
    p_currency: settings.currency,
    p_date_format: settings.dateFormat,
    p_theme: settings.theme,
  });
  if (error) throw error;
}

export async function getDashboardStats(): Promise<{
  open_count: number;
  overdue_count: number;
  due_today_count: number;
  completed_30d: number;
  total: number;
}> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw error;
  return data as {
    open_count: number;
    overdue_count: number;
    due_today_count: number;
    completed_30d: number;
    total: number;
  };
}

export function subscribeToWorkspace(onUpdate: () => void) {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel('workspace')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commitments' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, onUpdate)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
