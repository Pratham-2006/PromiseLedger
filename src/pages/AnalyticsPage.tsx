import { useMemo } from 'react';
import { BarChart2, CheckCircle2, Clock, Users, ArrowUpRight } from 'lucide-react';
import type { Database } from '../domain/types';
import { localDateKey } from '../domain/dates';

interface Props {
  db: Database;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function AnalyticsPage({ db }: Props) {
  const today = localDateKey();
  const nonSample = useMemo(() => db.commitments.filter((c) => !c.isSample && !c.deletedAt), [db.commitments]);

  // Completion rate last 90 days
  const last90 = useMemo(() => {
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    return nonSample.filter((c) => {
      const d = (c.completedAt ?? c.createdAt).slice(0, 10);
      return d >= cutoff;
    });
  }, [nonSample]);

  const completionRate = last90.length
    ? Math.round((last90.filter((c) => c.status === 'Completed').length / last90.length) * 100)
    : 0;

  // Breakdown by Category
  const byCategory = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    nonSample.forEach((c) => {
      const entry = map.get(c.category) ?? { total: 0, completed: 0 };
      entry.total++;
      if (c.status === 'Completed') entry.completed++;
      map.set(c.category, entry);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [nonSample]);

  // Average days to complete
  const avgDaysToComplete = useMemo(() => {
    const completedWithDates = nonSample.filter((c) => c.status === 'Completed' && c.completedAt && c.createdAt);
    if (!completedWithDates.length) return null;
    const totalDays = completedWithDates.reduce((sum, c) => {
      return sum + Math.max(0, (new Date(c.completedAt!).getTime() - new Date(c.createdAt).getTime()) / 86_400_000);
    }, 0);
    return Math.round(totalDays / completedWithDates.length);
  }, [nonSample]);

  // Top customers with overdue commitments
  const overdueByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    nonSample
      .filter((c) => c.status !== 'Completed' && c.status !== 'Cancelled' && c.dueDate && c.dueDate < today)
      .forEach((c) => map.set(c.customerName, (map.get(c.customerName) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [nonSample, today]);

  return (
    <>
      <PageHeading
        eyebrow="PERFORMANCE"
        title="Analytics & Insights"
        description="Trends and patterns from your real commitment history."
      />

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-icon metric-green"><CheckCircle2 size={17} /></span>
            <span className="metric-trend"><ArrowUpRight size={14} /></span>
          </div>
          <span className="metric-label">Completion rate</span>
          <b className="metric-value">{completionRate}%</b>
          <span className="metric-foot">Last 90 days</span>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-icon metric-blue"><Clock size={17} /></span>
            <span className="metric-trend"><ArrowUpRight size={14} /></span>
          </div>
          <span className="metric-label">Avg. days to fulfill</span>
          <b className="metric-value">{avgDaysToComplete !== null ? `${avgDaysToComplete}d` : '—'}</b>
          <span className="metric-foot">From promise to completion</span>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span className="metric-icon metric-slate"><Users size={17} /></span>
            <span className="metric-trend"><ArrowUpRight size={14} /></span>
          </div>
          <span className="metric-label">Total tracked promises</span>
          <b className="metric-value">{nonSample.length}</b>
          <span className="metric-foot">Excluding demo data</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title-row">
                <span className="section-icon"><BarChart2 size={16} /></span>
                <h2>Fulfillment by Category</h2>
              </div>
              <p>Completed vs total promises made per category</p>
            </div>
          </div>
          {byCategory.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              {byCategory.map(([cat, stats]) => {
                const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                return (
                  <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ fontWeight: 600 }}>{cat}</span>
                      <span style={{ color: 'var(--text-muted, #64748b)' }}>{stats.completed} of {stats.total} ({pct}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, #10b981)', borderRadius: '4px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted, #64748b)', padding: '1.5rem 0' }}>No promises recorded yet to analyze.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title-row">
                <span className="section-icon attention-icon"><Users size={16} /></span>
                <h2>Overdue Distribution</h2>
              </div>
              <p>Customers with promises needing immediate attention</p>
            </div>
          </div>
          {overdueByCustomer.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 0' }}>
              {overdueByCustomer.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <b style={{ fontSize: '0.9rem' }}>{name}</b>
                  <span className="badge badge-overdue">{count} overdue</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
              <b>All caught up!</b>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>No customers currently have overdue promises.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
