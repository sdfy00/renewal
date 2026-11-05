import { useState } from 'react';
import type { Resource } from '@/entities/resource/model/types';
import { fmt, fmtDate } from '@/shared/lib/format';
import Modal from '@/shared/ui/Modal';
import Button from '@/shared/ui/Button';

interface Props {
  freeResources: Resource[];
  onCreate: (resourceId: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateRequestModal({ freeResources, onCreate, onClose }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleCreate(resourceId: string) {
    if (loadingId) return;
    setLoadingId(resourceId);
    try {
      await onCreate(resourceId);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Modal title="Создать заявку" onClose={onClose}>
      {freeResources.length === 0 ? (
        <p className="text-secondary text-sm">Нет ресурсов, доступных для создания заявки.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-secondary text-sm mb-4">Выберите ресурс для продления:</p>
          {freeResources.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
              <div>
                <div className="font-medium text-text text-sm">{r.name}</div>
                <div className="text-xs text-secondary mt-0.5">
                  Срок: {fmtDate(r.expiresOn)} · {fmt(r.amountMinor, r.currency)}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={!!loadingId}
                onClick={() => void handleCreate(r.id)}
              >
                {loadingId === r.id ? '…' : 'Создать'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
