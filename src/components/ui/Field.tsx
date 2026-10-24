import { type ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}

export function Field({ label, children, hint, error }: Props) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint && <small className="form-hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
