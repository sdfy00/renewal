import type { RequestStatus } from '../model/types';

const config: Record<RequestStatus, { label: string; cls: string }> = {
  pending:         { label: 'На согласовании', cls: 'text-accent' },
  in_progress:     { label: 'Выполняется',     cls: 'text-warning' },
  completed:       { label: 'Завершено',        cls: 'text-success' },
  rejected:        { label: 'Отклонено',        cls: 'text-danger' },
  needs_attention: { label: 'Требует внимания', cls: 'text-warning' },
};

export default function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, cls } = config[status];
  return <span className={`text-sm font-medium ${cls}`}>{label}</span>;
}
