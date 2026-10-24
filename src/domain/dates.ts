export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateAtLocalMidnight(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dayDistance(from: string, to: string): number {
  const a = dateAtLocalMidnight(from);
  const b = dateAtLocalMidnight(to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function isOverdue(dueDate: string | null, status: string, today = localDateKey()): boolean {
  return Boolean(dueDate && dueDate < today && status !== 'Completed' && status !== 'Cancelled');
}

export function isDueToday(dueDate: string | null, status: string, today = localDateKey()): boolean {
  return Boolean(dueDate && dueDate === today && status !== 'Completed' && status !== 'Cancelled');
}

export function formatDate(value: string | null, format: 'local' | 'iso' = 'local'): string {
  if (!value) return 'No deadline';
  if (format === 'iso') return value;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(dateAtLocalMidnight(value));
}

export function datePhraseToKey(phrase: string, now = new Date()): string | null {
  const normalized = phrase.trim().toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (normalized === 'today') return localDateKey(base);
  if (normalized === 'tomorrow') { base.setDate(base.getDate() + 1); return localDateKey(base); }
  if (normalized === 'day after tomorrow') { base.setDate(base.getDate() + 2); return localDateKey(base); }
  const match = normalized.match(/^(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (!match) return null;
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = weekdays.indexOf(match[2]);
  let delta = (target - base.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  base.setDate(base.getDate() + delta);
  return localDateKey(base);
}

export function dateLabel(value: string | null, today = localDateKey(), format: 'local' | 'iso' = 'local'): string {
  if (!value) return 'No deadline';
  if (value === today) return 'Today';
  if (value === localDateKey(new Date(dateAtLocalMidnight(today).getTime() + 86_400_000))) return 'Tomorrow';
  return formatDate(value, format);
}
