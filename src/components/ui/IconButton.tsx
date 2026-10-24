import { type ReactNode } from 'react';

interface Props {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export function IconButton({ label, onClick, children, className = '' }: Props) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
