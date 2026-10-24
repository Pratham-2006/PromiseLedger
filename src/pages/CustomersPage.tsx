import { useState } from 'react';
import { ArrowRight, Check, Pencil, Plus, Search, UsersRound, X } from 'lucide-react';
import type { CommitmentDraft, Customer, Database } from '../domain/types';
import { formatDate, isOverdue } from '../domain/dates';
import { Avatar } from '../components/ui/Avatar';
import { StatusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Field } from '../components/ui/Field';
import { IconButton } from '../components/ui/IconButton';
import { UserRound } from 'lucide-react';

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

interface Props {
  db: Database;
  dateFormat: 'local' | 'iso';
  selectedId: string | null;
  query: string;
  setQuery: (value: string) => void;
  onSelect: (id: string | null) => void;
  onCreateFor: (draft?: CommitmentDraft, customerName?: string) => void;
  onEditCustomer: (id: string, patch: Partial<Pick<Customer, 'name' | 'contact' | 'notes'>>) => void;
  onOpenCommitment: (id: string) => void;
}

export function CustomersPage({ db, dateFormat, selectedId, query, setQuery, onSelect, onCreateFor, onEditCustomer, onOpenCommitment }: Props) {
  const people = db.customers
    .filter((c) => c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = db.customers.find((c) => c.id === selectedId) ?? null;
  const related = selected
    ? db.commitments
        .filter((item) => !item.deletedAt && (item.customerId === selected.id || item.customerName.toLocaleLowerCase() === selected.name.toLocaleLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  const [edit, setEdit] = useState(false);

  return (
    <>
      <PageHeading
        eyebrow="PEOPLE BEHIND THE PROMISES"
        title="Customers"
        description="A simple directory shaped by the people you make commitments to."
        action={selected && <button className="button button-primary" onClick={() => onCreateFor(undefined, selected.name)}><Plus size={16} />New promise</button>}
      />
      <div className="customers-layout">
        <section className="panel customer-list-panel">
          <div className="customer-search">
            <Search size={16} />
            <input aria-label="Search customers" placeholder="Find someone…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="customer-list">
            {people.map((customer) => {
              const records = db.commitments.filter((item) => !item.deletedAt && (item.customerId === customer.id || item.customerName.toLocaleLowerCase() === customer.name.toLocaleLowerCase()));
              const activeCount = records.filter((item) => item.status === 'Open' || item.status === 'In progress').length;
              const hasOverdue = records.some((item) => isOverdue(item.dueDate, item.status));
              return (
                <button key={customer.id} className={`customer-list-item ${selectedId === customer.id ? 'customer-list-active' : ''}`} onClick={() => { onSelect(customer.id); setEdit(false); }}>
                  <Avatar name={customer.name} />
                  <span className="customer-list-name">
                    <b>{customer.name}</b>
                    <small>{records.length} {records.length === 1 ? 'commitment' : 'commitments'}</small>
                  </span>
                  <span className={`customer-open-count ${hasOverdue ? 'count-overdue' : ''}`}>
                    {hasOverdue ? 'Late' : activeCount ? activeCount : <Check size={14} />}
                  </span>
                </button>
              );
            })}
          </div>
          {!people.length && <div className="customer-list-empty">{db.customers.length ? 'No people match this search.' : 'People you make promises to will appear here.'}</div>}
          <div className="customer-list-foot">{db.customers.length} people in your ledger</div>
        </section>

        <section className="panel customer-profile-panel">
          {selected ? (
            <>
              <div className="customer-profile-head">
                <div className="customer-profile-id">
                  <Avatar name={selected.name} size="lg" />
                  <div>
                    <div className="eyebrow">CUSTOMER PROFILE</div>
                    <h2>{selected.name}</h2>
                    <span>Added {formatDate(selected.createdAt.slice(0, 10), dateFormat)}</span>
                  </div>
                </div>
                <IconButton label={edit ? 'Close editing' : 'Edit customer'} onClick={() => setEdit(!edit)}>
                  {edit ? <X size={16} /> : <Pencil size={16} />}
                </IconButton>
              </div>

              {edit ? (
                <div className="customer-edit-form">
                  <Field label="Name"><input value={selected.name} onChange={(e) => onEditCustomer(selected.id, { name: e.target.value })} /></Field>
                  <Field label="Contact information"><input placeholder="Phone or email (optional)" value={selected.contact} onChange={(e) => onEditCustomer(selected.id, { contact: e.target.value })} /></Field>
                  <Field label="Notes"><textarea rows={3} placeholder="Useful details for next time" value={selected.notes} onChange={(e) => onEditCustomer(selected.id, { notes: e.target.value })} /></Field>
                  <p className="form-hint">Edits save automatically. Similar names are matched without case or extra spaces.</p>
                </div>
              ) : (
                <div className="customer-contact-card">
                  <span><UserRound size={15} />{selected.contact || 'No contact information added'}</span>
                  {selected.notes && <p>{selected.notes}</p>}
                </div>
              )}

              <div className="customer-stat-grid">
                <div><span>Open</span><b>{related.filter((i) => i.status === 'Open' || i.status === 'In progress').length}</b></div>
                <div><span>Overdue</span><b className="stat-red">{related.filter((i) => isOverdue(i.dueDate, i.status)).length}</b></div>
                <div><span>Completed</span><b className="stat-green">{related.filter((i) => i.status === 'Completed').length}</b></div>
              </div>

              <div className="subsection-heading">
                <div>
                  <h3>Commitment history</h3>
                  <p>Every promise made to {selected.name.split(' ')[0]}</p>
                </div>
                <span>{related.length}</span>
              </div>

              {related.length ? (
                <div className="customer-record-list">
                  {related.map((item) => (
                    <button key={item.id} className="customer-record" onClick={() => onOpenCommitment(item.id)}>
                      <span className={`record-category-marker record-${item.category.toLowerCase().replace(/[^a-z]/g, '')}`} />
                      <span className="record-main">
                        <b>{item.title}</b>
                        <small>{item.category} · {formatDate(item.dueDate, dateFormat)}</small>
                      </span>
                      <StatusBadge item={item} />
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="customer-history-empty">No promises yet. Start the relationship with a clear commitment.</div>
              )}
            </>
          ) : (
            <EmptyState icon={UsersRound} title="Choose someone to see their story" body="Select a person from the directory to review open, overdue and completed promises." />
          )}
        </section>
      </div>
    </>
  );
}
