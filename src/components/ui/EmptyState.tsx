import { CircleHelp, type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

interface Props {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon = CircleHelp, title, body, action }: Props) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={23} /></span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
