import { useEffect, useState } from 'react';
import Modal from '@/shared/ui/Modal';
import StatusBadge from '@/entities/request/ui/StatusBadge';
import Button from '@/shared/ui/Button';
import type { HistoryEntry, RenewalRequest } from '@/entities/request/model/types';
import { fmtDate } from '@/shared/lib/format';
import { requestApi } from '../api/requestApi';

interface Props {
  request: RenewalRequest;
  resourceName: string;
  canApprove: boolean;
  onClose: () => void;
  onAction: () => Promise<void>;
}

export default function RequestDetailModal({ request, resourceName, canApprove, onClose, onAction }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const silent = entries.length > 0;
    if (!silent) setLoading(true);
    requestApi.history(request.id).then((data) => {
      if (!cancelled) setEntries(data);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.status]);

  async function act(fn: () => Promise<unknown>) {
    setError('');
    setActing(true);
    try {
      await fn();
      await onAction();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setActing(false);
    }
  }

  return (
    <Modal title={resourceName} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <StatusBadge status={request.status} />
          <span className="text-secondary text-sm">
            → {fmtDate(request.newExpiresOn)}
          </span>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {canApprove && request.status === 'pending' && (
          <div className="flex gap-3">
            <Button variant="success" disabled={acting} onClick={() => act(() => requestApi.approve(request.id))}>
              Одобрить
            </Button>
            <Button variant="danger" disabled={acting} onClick={() => act(() => requestApi.reject(request.id))}>
              Отклонить
            </Button>
          </div>
        )}
        {canApprove && request.status === 'needs_attention' && (
          <Button variant="warning" disabled={acting} onClick={() => act(() => requestApi.retry(request.id))}>
            Повторить
          </Button>
        )}

        <div className="border-t border-secondary/15 pt-4">
          <h3 className="text-sm font-semibold text-text mb-3">История заявки</h3>
          {loading ? (
            <p className="text-secondary text-sm">Загрузка…</p>
          ) : entries.length === 0 ? (
            <p className="text-secondary text-sm">История пуста.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-secondary/15 text-left text-secondary">
                  <th className="pb-3 pr-4 font-normal">Время</th>
                  <th className="pb-3 pr-4 font-normal">Актор</th>
                  <th className="pb-3 pr-4 font-normal">Из</th>
                  <th className="pb-3 font-normal">В</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-secondary/10 last:border-0">
                    <td className="py-3 pr-4 text-secondary whitespace-nowrap text-xs">
                      {new Date(e.createdAt).toLocaleString('ru-RU')}
                    </td>
                    <td className="py-3 pr-4 text-xs text-secondary whitespace-nowrap">
                      {e.actorUsername ?? <span className="text-secondary/40">система</span>}
                    </td>
                    <td className="py-3 pr-4">
                      {e.fromStatus
                        ? <StatusBadge status={e.fromStatus} />
                        : <span className="text-secondary/40">—</span>}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={e.toStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
