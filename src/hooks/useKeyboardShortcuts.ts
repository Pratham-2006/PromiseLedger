import { useEffect } from 'react';

export type AppPage = 'dashboard' | 'commitments' | 'customers' | 'history' | 'analytics' | 'settings';

interface Handlers {
  onNewPromise: () => void;
  onNavigate: (page: AppPage) => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      // Skip if user is typing
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Skip if modifier is held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'n': e.preventDefault(); handlers.onNewPromise(); break;
        case '1': handlers.onNavigate('dashboard'); break;
        case '2': handlers.onNavigate('commitments'); break;
        case '3': handlers.onNavigate('customers'); break;
        case '4': handlers.onNavigate('history'); break;
        case '5': handlers.onNavigate('analytics'); break;
        case '6': handlers.onNavigate('settings'); break;
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handlers]);
}
