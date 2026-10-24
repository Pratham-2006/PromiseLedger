import type { Category, CommitmentDraft } from './types';
import { datePhraseToKey } from './dates';

export interface ParseResult {
  draft: CommitmentDraft;
  recognized: { person: boolean; category: boolean; date: boolean; amount: boolean };
  confidence: 'parsed' | 'partial' | 'fallback';
}

const datePattern = /\bday after tomorrow|\btomorrow\b|\btoday\b|\b(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const isoDatePattern = /\b\d{4}-\d{2}-\d{2}\b/;

function inferCategory(text: string, hasAmount: boolean): Category {
  const lower = text.toLowerCase();
  if (/\b(deliver|drop off|ship|hand over|bring)\b/.test(lower)) return 'Delivery';
  if (/\b(collect|pay|payment|receive|refund|owe|transfer)\b/.test(lower) || hasAmount) return 'Payment';
  if (/\b(call|contact|follow.?up|send|email|message|quotation|quote|remind)\b/.test(lower)) return 'Follow-up';
  if (/\b(repair|fix|service|install|inspect|maintain)\b/.test(lower)) return 'Service';
  if (/\b(buy|purchase|procure|order|restock|stock)\b/.test(lower)) return 'Purchase';
  return 'Other';
}

export function parseQuickEntry(input: string, now = new Date()): ParseResult {
  const source = input.trim();
  let working = source;
  const money = working.match(/(?:₹|INR\s*|Rs\.?\s*)(\d[\d,]*(?:\.\d{1,2})?)/i);
  const amount = money ? Number(money[1].replaceAll(',', '')) : null;
  if (money) working = working.replace(money[0], ' ');

  const dateMatch = working.match(datePattern) ?? working.match(isoDatePattern);
  const explicitDate = dateMatch?.[0] ?? '';
  const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(explicitDate);
  const parsedIso = isIsoDate ? new Date(`${explicitDate}T00:00:00`) : null;
  const [year, month, day] = explicitDate.split('-').map(Number);
  const validIso = isIsoDate && parsedIso && !Number.isNaN(parsedIso.getTime()) && parsedIso.getFullYear() === year && parsedIso.getMonth() + 1 === month && parsedIso.getDate() === day;
  const dueDate = dateMatch ? (isIsoDate && validIso ? explicitDate : isIsoDate ? null : datePhraseToKey(explicitDate, now)) : null;
  if (dateMatch) working = working.replace(dateMatch[0], ' ').replace(/\b(?:on|by|at)\s*$/i, ' ');

  const prepositionPerson = working.match(/\b(?:to|for|from)\s+([A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*){0,2})/u);
  const directPerson = working.match(/^\s*(?:[Cc]all|[Cc]ontact|[Ee]mail|[Mm]essage|[Ss]end)\s+([A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*){0,2})(?=\s+(?:the|a|an|when|if|by|on|next|tomorrow|today|day)\b|[.,!?]|$)/u);
  const personMatch = prepositionPerson ?? directPerson;
  const customerName = personMatch?.[1]?.trim() ?? '';
  if (prepositionPerson) working = working.replace(prepositionPerson[0], ' ');
  else if (directPerson) working = working.replace(directPerson[1], ' ');

  const title = working.replace(/[.,!?;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const category = inferCategory(source, amount !== null);
  const recognized = {
    person: customerName.length > 0,
    category: category !== 'Other',
    date: dueDate !== null,
    amount: amount !== null,
  };
  const extracted = Object.values(recognized).filter(Boolean).length;
  return {
    draft: {
      title: title || source,
      customerName,
      category,
      dueDate: dueDate ?? '',
      amount: amount === null ? '' : String(amount),
      currency: 'INR',
      notes: '',
    },
    recognized,
    confidence: extracted >= 2 && title ? 'parsed' : extracted > 0 ? 'partial' : 'fallback',
  };
}
