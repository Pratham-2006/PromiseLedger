import { type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface Props {
  notice: string | null;
  error: string | null;
  errorActions?: ReactNode;
  onDismissNotice: () => void;
  onDismissError: () => void;
}

export function NoticeBar({ notice, error, errorActions, onDismissNotice, onDismissError }: Props) {
  return (
    <>
      {notice && (
        <div className="notice-banner" role="status">
          <CheckCircle2 size={16} />
          {notice}
          <button aria-label="Dismiss notice" onClick={onDismissNotice}>
            <X size={15} />
          </button>
        </div>
      )}
      {error && (
        <div className="notice-banner notice-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          {errorActions}
          <button aria-label="Dismiss error" onClick={onDismissError}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
