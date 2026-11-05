import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/entities/user/model/AuthContext';
import type { RenewalRequest } from '@/entities/request/model/types';
import type { Resource } from '@/entities/resource/model/types';
import { requestApi } from '@/features/request-actions/api/requestApi';
import RequestDetailModal from '@/features/request-actions/ui/RequestDetailModal';
import CreateRequestModal from '@/features/request-actions/ui/CreateRequestModal';
import ResourceList from '@/widgets/resource-list/ui/ResourceList';
import Button from '@/shared/ui/Button';

type DetailItem = { reqId: string; resourceName: string };

export default function SpacePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [allRequests, setAllRequests] = useState<RenewalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const hasActiveRef = useRef(false);
  const spaceRoles = user?.spaceRoles.filter((r) => r.spaceSlug === slug) ?? [];
  const isInitiator = spaceRoles.some((r) => r.role === 'initiator');
  const isApprover = spaceRoles.some((r) => r.role === 'approver');

  const refresh = useCallback(async (silent = false) => {
    if (!slug) return;
    if (!silent) setLoading(true);
    try {
      const [res, reqs] = await Promise.all([
        requestApi.resources(slug),
        requestApi.requests(slug),
      ]);
      setResources(res);
      setAllRequests(reqs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Keep the ref in sync after every render so the interval can read it without re-creating
  useEffect(() => {
    hasActiveRef.current = resources.some(
      (r) => r.activeRequest?.status === 'in_progress' || r.activeRequest?.status === 'needs_attention',
    );
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (hasActiveRef.current) void refresh(true);
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  async function create(resourceId: string) {
    setError('');
    try {
      await requestApi.create(slug!, resourceId);
      setShowCreateModal(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!user || spaceRoles.length === 0) {
    return (
      <div className="w-full max-w-[min(1120px,calc(100%-64px))] mx-auto py-10">
        <p className="text-danger mb-4">Нет доступа к этому пространству.</p>
        <Button variant="primary" onClick={() => navigate('/')}>← На главную</Button>
      </div>
    );
  }

  const detailReq = detailItem
    ? (allRequests.find((r) => r.id === detailItem.reqId) ?? null)
    : null;

  const latestByResource = new Map<string, RenewalRequest>();
  for (const req of allRequests) {
    const existing = latestByResource.get(req.resourceId);
    if (!existing || req.updatedAt > existing.updatedAt) {
      latestByResource.set(req.resourceId, req);
    }
  }

  const pending    = resources.filter((r) => r.activeRequest?.status === 'pending').length;
  const inProgress = resources.filter((r) => r.activeRequest?.status === 'in_progress').length;
  const needsAttn  = resources.filter((r) => r.activeRequest?.status === 'needs_attention').length;
  const freeResources = resources.filter((r) => !r.activeRequest);

  return (
    <div className="w-full max-w-[min(1120px,calc(100%-64px))] mx-auto py-10">

      {detailItem && detailReq && (
        <RequestDetailModal
          request={detailReq}
          resourceName={detailItem.resourceName}
          canApprove={isApprover && detailReq.createdBy !== user.id}
          onClose={() => setDetailItem(null)}
          onAction={refresh}
        />
      )}

      {showCreateModal && (
        <CreateRequestModal
          freeResources={freeResources}
          onCreate={create}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-[32px] font-bold text-text leading-tight">Заявки на продление</h1>
        <p className="text-secondary text-sm mt-2">
          Рабочее пространство: {slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : ''}
        </p>
      </div>

      <div className="bg-card rounded-[20px] p-6">

        {error && (
          <div className="mb-4 bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-secondary">Загрузка…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6 pb-5 border-b border-secondary/20 text-sm font-semibold">
              <span className="text-text">Всего: {resources.length}</span>
              {pending > 0    && <span className="text-accent">Ожидают: {pending}</span>}
              {inProgress > 0 && <span className="text-warning">Выполняется: {inProgress}</span>}
              {needsAttn > 0  && <span className="text-warning">Требует внимания: {needsAttn}</span>}
            </div>

            <ResourceList
              resources={resources}
              latestByResource={latestByResource}
              onSelect={(req, resourceName) => setDetailItem({ reqId: req.id, resourceName })}
            />

            {isInitiator && (
              <div className="mt-8 pt-5 border-t border-secondary/20 flex items-center gap-6">
                <Button
                  variant="solid"
                  className="px-8 py-3.5 text-base font-bold"
                  onClick={() => setShowCreateModal(true)}
                >
                  Создать заявку
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
