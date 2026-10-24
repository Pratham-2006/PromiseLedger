export const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'INR — Indian Rupee (₹)' },
  { code: 'USD', symbol: '$', label: 'USD — US Dollar ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound (£)' },
  { code: 'AED', symbol: 'د.إ', label: 'AED — UAE Dirham' },
  { code: 'SGD', symbol: 'S$', label: 'SGD — Singapore Dollar' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
