import type { RenewalRequest } from '@/entities/request/model/types';
import type { Resource } from '@/entities/resource/model/types';
import StatusBadge from '@/entities/request/ui/StatusBadge';
import { fmt, fmtDate } from '@/shared/lib/format';

interface Props {
  resources: Resource[];
  latestByResource: Map<string, RenewalRequest>;
  onSelect: (req: RenewalRequest, resourceName: string) => void;
}

export default function ResourceList({ resources, latestByResource, onSelect }: Props) {
  if (resources.length === 0) {
    return <div className="text-center py-10 text-secondary text-sm">Нет ресурсов</div>;
  }

  return (
    <>
      <div className="hidden sm:block mt-5">
        <div className="grid grid-cols-[2fr_1.2fr_1.5fr_2fr] text-secondary text-sm px-6 mb-3">
          <div>Ресурс</div>
          <div>Срок</div>
          <div>Стоимость</div>
          <div>Статус</div>
        </div>
        <div className="space-y-2">
          {resources.map((r) => {
            const req = r.activeRequest ?? latestByResource.get(r.id);
            return (
              <div
                key={r.id}
                role={req ? 'button' : undefined}
                tabIndex={req ? 0 : undefined}
                className={`grid grid-cols-[2fr_1.2fr_1.5fr_2fr] items-center bg-bg rounded-xl px-6 py-5 text-sm ${req ? 'cursor-pointer hover:bg-white/4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70' : ''}`}
                onClick={() => req && onSelect(req, r.name)}
                onKeyDown={(e) => {
                  if (req && (e.key === 'Enter' || e.key === ' ')) onSelect(req, r.name);
                }}
              >
                <div className="font-medium text-text">{r.name}</div>
                <div className="text-text">{fmtDate(r.expiresOn)}</div>
                <div className="text-text">{fmt(r.amountMinor, r.currency)}</div>
                <div>
                  {req ? <StatusBadge status={req.status} /> : <span className="text-secondary/40">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sm:hidden mt-4 space-y-3">
        {resources.map((r) => {
          const req = r.activeRequest ?? latestByResource.get(r.id);
          return (
            <div
              key={r.id}
              role={req ? 'button' : undefined}
              tabIndex={req ? 0 : undefined}
              className={`bg-bg rounded-xl p-4 space-y-3 ${req ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70' : ''}`}
              onClick={() => req && onSelect(req, r.name)}
              onKeyDown={(e) => {
                if (req && (e.key === 'Enter' || e.key === ' ')) onSelect(req, r.name);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-text">{r.name}</div>
                {req && <StatusBadge status={req.status} />}
              </div>
              <div className="flex gap-6 text-sm">
                <span className="text-secondary">
                  Срок: <span className="text-text">{fmtDate(r.expiresOn)}</span>
                </span>
                <span className="text-secondary">{fmt(r.amountMinor, r.currency)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
