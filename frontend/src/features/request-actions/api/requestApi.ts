import { request } from '@/shared/api/client';
import type { HistoryEntry, RenewalRequest } from '@/entities/request/model/types';
import type { Resource } from '@/entities/resource/model/types';

export const requestApi = {
  resources: (slug: string) =>
    request<Resource[]>('GET', `/spaces/${slug}/resources`),

  requests: (slug: string) =>
    request<RenewalRequest[]>('GET', `/spaces/${slug}/requests`),

  create: (slug: string, resourceId: string) =>
    request<RenewalRequest>('POST', `/spaces/${slug}/resources/${resourceId}/requests`),

  approve: (id: string) =>
    request<RenewalRequest>('PATCH', `/requests/${id}/approve`),

  reject: (id: string) =>
    request<RenewalRequest>('PATCH', `/requests/${id}/reject`),

  retry: (id: string) =>
    request<RenewalRequest>('PATCH', `/requests/${id}/retry`),

  history: (id: string) =>
    request<HistoryEntry[]>('GET', `/requests/${id}/history`),
};
